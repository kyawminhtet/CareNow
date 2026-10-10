-- Run once the CareNow foundation migration is applied.
-- Safe to re-run: it updates this Auth user's existing CareNow account or
-- creates one, without changing their Supabase Auth password or email.
--
-- Dashboard: SQL Editor -> New query -> paste/run this file.

begin;

do $provision_admin$
declare
  v_auth_user_id uuid;
  v_auth_user_count integer;
  v_app_user_id uuid;
  v_display_name text := 'Kyaw Min Htun';
begin
  select count(*)
    into v_auth_user_count
    from auth.users as u
   where lower(u.email) = lower('kmhitmdy24@gmail.com');

  if v_auth_user_count <> 1 then
    raise exception 'Expected exactly one Supabase Auth user for kmhitmdy24@gmail.com; found %.', v_auth_user_count;
  end if;

  select u.id
    into v_auth_user_id
    from auth.users as u
   where lower(u.email) = lower('kmhitmdy24@gmail.com');

  if v_auth_user_id is null then
    raise exception 'No Supabase Auth user found for kmhitmdy24@gmail.com. Create/confirm the Auth user first.';
  end if;

  select m.app_user_id
    into v_app_user_id
    from public.identity_mappings as m
   where m.provider = 'supabase'
     and m.provider_subject = v_auth_user_id::text;

  if v_app_user_id is null then
    insert into public.app_users (role, status, display_name)
    values ('ADMINISTRATOR', 'ACTIVE', v_display_name)
    returning id into v_app_user_id;

    insert into public.identity_mappings (app_user_id, provider, provider_subject)
    values (v_app_user_id, 'supabase', v_auth_user_id::text);
  else
    if exists (
      select 1
        from public.doctor_profiles as d
       where d.app_user_id = v_app_user_id
    ) then
      raise exception 'This identity is already linked to a doctor profile. Resolve the existing application account before assigning the administrator role.';
    end if;

    update public.app_users
       set role = 'ADMINISTRATOR',
           status = 'ACTIVE',
           display_name = v_display_name,
           updated_at = now()
     where id = v_app_user_id;
  end if;

  raise notice 'Provisioned CareNow administrator account % with internal ID %.',
    'kmhitmdy24@gmail.com',
    v_app_user_id;
end;
$provision_admin$;

select au.id as carenow_user_id,
       au.display_name,
       au.role,
       au.status,
       u.email
  from public.app_users as au
  join public.identity_mappings as im
    on im.app_user_id = au.id
  join auth.users as u
    on u.id::text = im.provider_subject
 where im.provider = 'supabase'
   and lower(u.email) = lower('kmhitmdy24@gmail.com');

commit;
