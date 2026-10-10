-- Permanently remove one CareNow doctor from Supabase Auth and the CareNow
-- application tables. Replace the email below before running this in the
-- Supabase SQL Editor. Remove any listed private Storage files through the
-- Supabase Storage UI/API before running this script. It refuses to delete
-- doctors with appointments or materialized slots to preserve operational history.

begin;

do $delete_doctor$
declare
  target_email constant text := 'replace-with-doctor-email@example.com';
  auth_user_id uuid;
  app_user_id uuid;
  matching_auth_users integer;
  has_appointments boolean;
  has_slots boolean;
  document_record record;
begin
  if target_email = 'replace-with-doctor-email@example.com' then
    raise exception 'Edit target_email in this script before running it.';
  end if;

  select count(*)
    into matching_auth_users
    from auth.users
   where lower(email) = lower(trim(target_email));

  if matching_auth_users = 0 then
    raise exception 'No Supabase Auth user found for %.', target_email;
  elsif matching_auth_users > 1 then
    raise exception 'More than one Supabase Auth user matched %; no rows were deleted.', target_email;
  end if;

  select id into auth_user_id
    from auth.users
   where lower(email) = lower(trim(target_email));

  select au.id
    into app_user_id
    from public.app_users as au
    join public.doctor_profiles as dp on dp.app_user_id = au.id
    left join public.identity_mappings as im
      on im.app_user_id = au.id
     and im.provider = 'supabase'
   where au.role = 'DOCTOR'
     and (au.id = auth_user_id or im.provider_subject = auth_user_id::text)
   limit 1;

  if app_user_id is null then
    raise exception 'The Supabase Auth user % is not linked to a CareNow doctor; no rows were deleted.', target_email;
  end if;

  select exists (
    select 1 from public.appointments where doctor_user_id = app_user_id
  ) into has_appointments;
  select exists (
    select 1 from public.appointment_slots where doctor_user_id = app_user_id
  ) into has_slots;

  if has_appointments or has_slots then
    raise exception 'Doctor % has appointment history or slots. Deletion stopped to preserve operational records; deactivate the account instead.', target_email;
  end if;

  -- Do not delete rows directly from storage.objects. Remove files through
  -- the Supabase Storage UI/API first; direct SQL can orphan the actual blobs.
  if exists (
    select 1 from public.doctor_verification_documents where doctor_user_id = app_user_id
  ) then
    for document_record in
      select storage_bucket, storage_object_key
        from public.doctor_verification_documents
       where doctor_user_id = app_user_id
    loop
      raise notice 'Remove private Storage file first: bucket %, key %',
        document_record.storage_bucket, document_record.storage_object_key;
    end loop;
    raise exception 'No account data was deleted. Remove the listed Storage files, then run this script again.';
  end if;

  -- Cascades remove the identity mapping, doctor profile, services,
  -- availability, preferences, notifications, and verification metadata.
  delete from public.app_users
   where id = app_user_id
     and role = 'DOCTOR';

  delete from auth.users where id = auth_user_id;

  raise notice 'Deleted CareNow doctor % (Auth ID %, app user ID %).', target_email, auth_user_id, app_user_id;
end
$delete_doctor$;

commit;
