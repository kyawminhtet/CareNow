# Supabase setup for CareNow

This repository treats Supabase Auth as the identity provider and PostgreSQL as the development database. The CareNow API (not the browser) owns application roles, authorization, business writes, and access to verification files. The foundation migration creates API-owned tables; it does not create permissive client policies or demo patient data.

## Dashboard setup

1. Create or select a **development** Supabase project. Choose a region close to the first users and keep the database password in a password manager. Do not use production patient data while developing.
2. In Project Settings → API, copy the project URL and publishable key into apps/web/.env.local as NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. These are client-safe values. Never expose the secret/service-role key or database password in a NEXT_PUBLIC_* variable.
3. In Authentication → URL Configuration, set Site URL to http://localhost:3000 and add http://localhost:3000/** to Redirect URLs. For deployment, set the production Site URL and add only the exact production auth callback/recovery URLs; add preview patterns only if you use preview deployments.
4. In Authentication → Providers → Email, keep email signup enabled for the doctor registration flow and enable email confirmation. Configure custom SMTP before inviting real users; the default email sender is for limited testing.
5. For doctor registration, set `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env` using the server-only secret key from the same project. Never put this key in a `NEXT_PUBLIC_*` variable or browser code. The API creates a private `doctor-verification` Storage bucket on first upload and stores verification files there.
6. Apply the doctor-registration details migration after the foundation migration: `supabase/migrations/20261008100000_doctor_registration_details.sql`.
7. Set `WEB_ORIGIN` in `apps/api/.env` to the shared doctor/admin portal origin. Add `${WEB_ORIGIN}/auth/callback?next=/reset-password` to Supabase Auth's allowed redirect URLs so administrator-created doctor invitations can set a password safely.
5. The web sign-in uses email and password only. In Authentication → Multi-Factor Authentication, disable TOTP enrollment and verification if you want the hosted project to match this app. The local settings in supabase/config.toml disable both. This does not delete factors users already enrolled.
6. In Storage, create a private bucket named doctor-verification, with a conservative file-size limit and allowed document types (PDF, JPEG, PNG). Keep it private. Do not create broad storage.objects policies; uploads/downloads should go through the authorized API until ownership policies are implemented.
7. Check Database → Extensions only if a later migration requests an extension. This foundation schema intentionally avoids adding one.

## Apply the migration

Install the Supabase CLI and Docker Desktop (the local Supabase stack uses containers), then run from the repository root:

~~~sh
supabase start
supabase db reset
~~~

db reset rebuilds the local database and applies supabase/migrations. It is destructive to local Supabase data, so use only for the local development stack.

For a newly created empty development project, authenticate the CLI and link it using the project reference shown in the Supabase Dashboard:

~~~sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase migration list
supabase db push
~~~

Review migration status before pushing. If the project already has tables, policies, functions, or other schema changes, do not push this baseline over it. First capture and review the existing schema with supabase db pull, then reconcile it with the migration history. After setup, make all schema changes in versioned migration files and deploy them with supabase db push; do not edit the remote database schema directly.

## Provision the first administrator

After the foundation migration is applied and the Auth user exists, open Supabase Dashboard → SQL Editor, paste and run supabase/seeds/provision_admin_kmhitmdy24.sql. It maps kmhitmdy24@gmail.com to a CareNow internal account with the ADMINISTRATOR role, ACTIVE status, and the display name “Kyaw Min Htun.” The script is safe to re-run and does not change the Auth password or email. Edit the display-name literal in the script if you want another name.

## What the foundation provides

- Internal CareNow UUID accounts with a separate identity_mappings table, so app IDs are not tied to Supabase Auth IDs.
- Doctor profiles, clinics, services, availability rules, materialized time slots, appointments, notification preferences/inbox, an outbox, audit metadata, and verification-document object references.
- RLS enabled and no browser data grants/policies on application tables. This is intentionally API-only until endpoint authorization is implemented.
- An appointment slot uniqueness constraint so one time slot cannot be booked twice. The API must change slot state and insert/cancel the appointment in one database transaction.

## Before real accounts or files

- Build the API identity adapter to validate Supabase JWTs, resolve identity_mappings, and verify role/account/doctor state. Never trust user metadata for role.
- Use a least-privilege backend database role and add/verify policies for each endpoint. Do not give the browser a service-role key; it bypasses RLS.
- Add private Storage authorization for upload, review, and signed download paths. Check file type and size server-side and use quarantine/review states.
- Set up SMTP, backups/restore checks, migration review, and separate development/production projects.

This setup is development scaffolding, not a compliance or production-readiness claim.

## Run the login API

The first API slice is in apps/api. Copy apps/api/.env.example to apps/api/.env, use the same Supabase URL and publishable key as the web app, and set DATABASE_URL to the project database. For local Supabase, the example uses the CLI default connection; for a hosted project, use its database connection details from Dashboard → Connect. Keep the database password in this ignored .env file and use a least-privilege database role outside local development.

From the repository root, start the API with npm run dev:api and the web app with npm run dev in separate terminals. The browser sign-in should then call GET http://localhost:4000/v1/auth/session. The identity mapping and active internal administrator row must already exist. Open http://localhost:4000/docs for the API reference and http://localhost:4000/v1/health to check database connectivity.
