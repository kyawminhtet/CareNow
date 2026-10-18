-- Stores the Storage object key for each doctor's public profile headshot.
ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS profile_photo_key text;
