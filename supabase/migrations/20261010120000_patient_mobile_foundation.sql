-- Patient self-service account details and push device registrations.
-- Business data continues to be accessed through the authenticated API only.
ALTER TYPE public.application_role ADD VALUE IF NOT EXISTS 'PATIENT';

CREATE TABLE public.patient_profiles (
  app_user_id uuid PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  phone_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  installation_id text NOT NULL,
  provider text NOT NULL DEFAULT 'EXPO' CHECK (provider = 'EXPO'),
  platform text NOT NULL CHECK (platform IN ('IOS', 'ANDROID')),
  push_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_devices_user_installation_unique UNIQUE (app_user_id, installation_id),
  CONSTRAINT push_devices_token_unique UNIQUE (push_token)
);
CREATE INDEX push_devices_user_idx ON public.push_devices(app_user_id);

ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_profiles, public.push_devices FROM anon, authenticated;
