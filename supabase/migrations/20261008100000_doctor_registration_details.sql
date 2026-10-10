-- Additional doctor onboarding fields collected by the shared web portal.
-- Nullable columns preserve compatibility with any previously provisioned doctors.
alter table public.doctor_profiles
  add column if not exists phone_number text,
  add column if not exists license_expiry date,
  add column if not exists qualifications text,
  add column if not exists experience_years integer,
  add column if not exists languages text[] not null default '{}';

alter table public.doctor_profiles
  add constraint doctor_experience_years_nonnegative
  check (experience_years is null or experience_years >= 0);
