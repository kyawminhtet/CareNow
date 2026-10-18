CREATE TABLE public.specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT specialties_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT specialties_name_unique UNIQUE (name)
);

CREATE UNIQUE INDEX specialties_name_case_insensitive_unique ON public.specialties (lower(name));
ALTER TABLE public.specialties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.specialties FROM anon, authenticated;

INSERT INTO public.specialties (name) VALUES
  ('General Medicine'),
  ('Pediatrics'),
  ('Dermatology'),
  ('Women''s Health'),
  ('Cardiology'),
  ('Mental Health')
ON CONFLICT (name) DO NOTHING;
