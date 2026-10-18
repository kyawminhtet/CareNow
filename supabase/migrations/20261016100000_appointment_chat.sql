-- Appointment-linked chat is API-owned. Realtime only authorizes participants
-- to receive private broadcasts; clients never query these tables directly.

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint chat_conversations_appointment_unique unique (appointment_id)
);
create index chat_conversations_last_message_idx on public.chat_conversations(last_message_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_user_id uuid not null references public.app_users(id) on delete restrict,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint chat_messages_content_length check (char_length(trim(content)) between 1 and 4000)
);
create index chat_messages_conversation_created_idx on public.chat_messages(conversation_id, created_at desc, id desc);
create index chat_messages_unread_idx on public.chat_messages(conversation_id, read_at);
create index chat_messages_sender_created_idx on public.chat_messages(sender_user_id, created_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_conversations, public.chat_messages from anon, authenticated;

-- Create the conversation transactionally with every appointment so it is
-- already visible in participant inboxes before the 15-minute send window.
insert into public.chat_conversations (appointment_id)
select id from public.appointments
on conflict (appointment_id) do nothing;

create function public.ensure_appointment_chat_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_conversations (appointment_id)
  values (new.id)
  on conflict (appointment_id) do nothing;
  return new;
end;
$$;

create trigger appointments_create_chat_conversation
after insert on public.appointments
for each row execute function public.ensure_appointment_chat_conversation();
revoke all on function public.ensure_appointment_chat_conversation() from public, anon, authenticated;

-- Supabase Realtime clients subscribe to a private topic chat:<conversation UUID>.
-- Map auth.uid() (Supabase Auth ID) to the internal CareNow user ID before
-- allowing the socket to receive broadcasts for either appointment participant.
create function public.can_receive_chat_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_conversations cc
    join public.appointments a on a.id = cc.appointment_id
    join public.identity_mappings im
      on im.app_user_id = a.patient_user_id or im.app_user_id = a.doctor_user_id
    join public.app_users participant on participant.id = im.app_user_id and participant.status = 'ACTIVE'
    where p_topic = 'chat:' || cc.id::text
      and im.provider = 'supabase'
      and im.provider_subject = auth.uid()::text
      and (
        (participant.id = a.patient_user_id and participant.role = 'PATIENT')
        or (participant.id = a.doctor_user_id and participant.role = 'DOCTOR'
          and exists (select 1 from public.doctor_profiles dp where dp.app_user_id = participant.id and dp.verification_status = 'VERIFIED'))
      )
  );
$$;
revoke all on function public.can_receive_chat_topic(text) from public;
grant execute on function public.can_receive_chat_topic(text) to authenticated;

create policy chat_participants_receive_private_broadcasts
on realtime.messages
for select
to authenticated
using (private = true and extension = 'broadcast' and public.can_receive_chat_topic(topic));
