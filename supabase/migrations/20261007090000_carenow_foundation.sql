-- CareNow's API is the only application data plane. Browser clients use Supabase
-- Auth, but do not query these business tables directly.

create type public.application_role as enum ('DOCTOR', 'ADMINISTRATOR');
create type public.account_status as enum ('INVITED', 'ACTIVE', 'SUSPENDED', 'INACTIVE');
create type public.doctor_verification_status as enum ('PENDING', 'VERIFIED', 'REJECTED');
create type public.consultation_type as enum ('ONLINE', 'IN_PERSON');
create type public.appointment_status as enum ('SCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
create type public.slot_status as enum ('OPEN', 'BLOCKED', 'BOOKED');
create type public.notification_target_type as enum (
  'APPOINTMENT', 'CONSULTATION', 'MESSAGE', 'VERIFICATION',
  'DOCTOR_VERIFICATION', 'ACCOUNT', 'AVAILABILITY', 'SCHEDULE',
  'REPORT', 'SETTINGS', 'OPERATIONAL_ISSUE'
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  role public.application_role not null,
  status public.account_status not null default 'INVITED',
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep internal IDs stable across identity-provider changes.
create table public.identity_mappings (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  created_at timestamptz not null default now(),
  constraint identity_mappings_provider_subject_unique unique (provider, provider_subject),
  constraint identity_mappings_provider_not_blank check (length(trim(provider)) > 0),
  constraint identity_mappings_subject_not_blank check (length(trim(provider_subject)) > 0)
);
create index identity_mappings_app_user_id_idx on public.identity_mappings(app_user_id);

create table public.doctor_profiles (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  specialty text not null,
  biography text not null default '',
  license_number text not null,
  license_region text not null,
  verification_status public.doctor_verification_status not null default 'PENDING',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_license_region_number_unique unique (license_region, license_number),
  constraint doctor_verified_timestamp_check check (
    (verification_status = 'VERIFIED' and verified_at is not null)
    or (verification_status <> 'VERIFIED' and verified_at is null)
  )
);

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text not null,
  region text not null,
  country_code char(2) not null,
  time_zone text not null default 'Asia/Yangon',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.doctor_services (
  id uuid primary key default gen_random_uuid(),
  doctor_user_id uuid not null references public.doctor_profiles(app_user_id) on delete cascade,
  consultation_type public.consultation_type not null,
  specialty text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint doctor_service_type_unique unique (doctor_user_id, consultation_type)
);

create table public.doctor_clinics (
  doctor_user_id uuid not null references public.doctor_profiles(app_user_id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (doctor_user_id, clinic_id)
);
create unique index doctor_one_primary_clinic_idx on public.doctor_clinics(doctor_user_id) where is_primary;

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  doctor_user_id uuid not null references public.doctor_profiles(app_user_id) on delete cascade,
  consultation_type public.consultation_type not null,
  clinic_id uuid references public.clinics(id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 6),
  local_start time not null,
  local_end time not null,
  effective_from date not null,
  effective_until date,
  slot_minutes smallint not null default 30 check (slot_minutes between 5 and 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint availability_time_order check (local_start < local_end),
  constraint availability_date_order check (effective_until is null or effective_from <= effective_until),
  constraint availability_clinic_type check (
    (consultation_type = 'ONLINE' and clinic_id is null)
    or (consultation_type = 'IN_PERSON' and clinic_id is not null)
  )
);
create index availability_rules_doctor_weekday_idx on public.availability_rules(doctor_user_id, weekday, is_active);

-- Slots are materialized by the API from availability rules. A booking
-- transaction changes OPEN -> BOOKED and inserts the appointment.
create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_user_id uuid not null references public.doctor_profiles(app_user_id) on delete restrict,
  consultation_type public.consultation_type not null,
  clinic_id uuid references public.clinics(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.slot_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  constraint appointment_slot_time_order check (starts_at < ends_at),
  constraint appointment_slot_clinic_type check (
    (consultation_type = 'ONLINE' and clinic_id is null)
    or (consultation_type = 'IN_PERSON' and clinic_id is not null)
  )
);
-- Separate partial indexes treat NULL clinic IDs for online slots as equal.
create unique index appointment_slot_online_unique on public.appointment_slots(doctor_user_id, starts_at, ends_at) where clinic_id is null;
create unique index appointment_slot_clinic_unique on public.appointment_slots(doctor_user_id, clinic_id, starts_at, ends_at) where clinic_id is not null;
create index appointment_slots_search_idx on public.appointment_slots(consultation_type, starts_at, status);
create index appointment_slots_doctor_search_idx on public.appointment_slots(doctor_user_id, starts_at, status);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.appointment_slots(id) on delete restrict,
  patient_user_id uuid not null references public.app_users(id) on delete restrict,
  doctor_user_id uuid not null references public.doctor_profiles(app_user_id) on delete restrict,
  consultation_type public.consultation_type not null,
  clinic_id uuid references public.clinics(id) on delete restrict,
  status public.appointment_status not null default 'SCHEDULED',
  reason_for_visit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_slot_unique unique (slot_id),
  constraint appointment_clinic_type check (
    (consultation_type = 'ONLINE' and clinic_id is null)
    or (consultation_type = 'IN_PERSON' and clinic_id is not null)
  )
);
create index appointments_patient_start_idx on public.appointments(patient_user_id, created_at desc);
create index appointments_doctor_status_idx on public.appointments(doctor_user_id, status, created_at);
create index appointments_status_created_idx on public.appointments(status, created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.app_users(id) on delete cascade,
  target_type public.notification_target_type not null,
  target_id uuid,
  title text not null,
  safe_message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notification_read_timestamp_check check (
    (is_read and read_at is not null) or (not is_read and read_at is null)
  )
);
create index notifications_recipient_unread_idx on public.notifications(recipient_user_id, created_at desc) where not is_read;
create index notifications_recipient_history_idx on public.notifications(recipient_user_id, created_at desc);

create table public.notification_preferences (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  appointment_updates boolean not null default true,
  reminders boolean not null default true,
  messages boolean not null default true,
  released_records boolean not null default true,
  reminder_minutes_before smallint not null default 1440 check (reminder_minutes_before between 0 and 10080),
  time_zone text not null default 'Asia/Yangon',
  updated_at timestamptz not null default now()
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  deduplication_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz not null default now()
);
create index outbox_events_pending_idx on public.outbox_events(available_at, created_at) where processed_at is null;

-- Audit metadata only: never store clinical text, document contents, tokens, or secrets.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  request_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index audit_events_time_idx on public.audit_events(occurred_at desc);
create index audit_events_actor_time_idx on public.audit_events(actor_user_id, occurred_at desc);

-- Store object keys, not uploaded documents, in PostgreSQL.
create table public.doctor_verification_documents (
  id uuid primary key default gen_random_uuid(),
  doctor_user_id uuid not null references public.doctor_profiles(app_user_id) on delete cascade,
  storage_bucket text not null default 'doctor-verification',
  storage_object_key text not null unique,
  document_type text not null,
  review_status public.doctor_verification_status not null default 'PENDING',
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.app_users(id) on delete set null
);
create index verification_documents_doctor_idx on public.doctor_verification_documents(doctor_user_id, uploaded_at desc);

-- No browser/PostgREST access until endpoint authorization and explicit RLS
-- policies have been designed and verified.
alter table public.app_users enable row level security;
alter table public.identity_mappings enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.doctor_services enable row level security;
alter table public.doctor_clinics enable row level security;
alter table public.availability_rules enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_events enable row level security;
alter table public.doctor_verification_documents enable row level security;

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
