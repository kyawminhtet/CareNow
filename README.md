# CareNow

CareNow is being built as one mobile patient client and one shared doctor/administrator web application. This first implementation pass focuses on `apps/web`. The browser portal uses a single sign-in and asks the API to verify the account role and permissions before showing role-specific routes.

## Web app

Requirements: Node.js 20.9 or newer and npm.

```sh
test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
npm install
npm run dev
```

The UI shell and public sign-in/doctor registration pages render before the API is connected. Authentication requires the Supabase project URL and publishable key in `apps/web/.env.local`. Authenticated screens also require the CareNow API at `CARENOW_API_URL`; without it, the app shows an explicit unavailable state and does not use sample clinical or operational data.

`NEXT_PUBLIC_WEB_ORIGIN` must match the single deployed doctor/admin web origin and be allowlisted for Supabase recovery links. Do not place service-role credentials, database passwords, signing secrets, or push credentials in a `NEXT_PUBLIC_*` variable.

## Supabase development database

Follow [docs/supabase-setup.md](docs/supabase-setup.md) to configure Auth, private document storage, and apply the versioned database migration. The schema intentionally grants no application-table access to browser roles; the API must implement authorization before these tables are used.

## Current web routes

- `/sign-in` — shared doctor/admin email/password sign-in and API role resolution.
- `/forgot-password` — generic password recovery response.
- `/register/doctor` — doctor onboarding wizard; verification documents are sent to the server-side registration API endpoint.
- `/doctor/*` — verified doctor workspace, pending verification status, appointments, patients, messages, availability, consultations, profile and notifications.
- `/admin/*` — administrator operations dashboard, doctors, schedules, appointments, reports, audit logs, settings and notifications.

The doctor and administrator dashboards are guarded on the server and role checks are repeated by the API. There is no client role selector. Administrators receive operational appointment references only; their response contract excludes clinical reasons, notes, prescriptions, private messages and consultation media.

## Web/API boundary

The NestJS API now implements the authenticated session endpoint used by web sign-in. Start the API and web app in separate terminals:

~~~sh
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
npm run dev:api
~~~

Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from the same Supabase project as the web app. DATABASE_URL must connect to the database where the CareNow migrations and administrator seed were applied. The local example expects Supabase CLI's local database. The API exposes GET /v1/auth/session, POST /v1/public/doctor-registrations, administrator-protected POST /v1/web/admin/doctors/invitations, invited-doctor activation, and Swagger at /docs. Other business endpoints and the notification worker are not implemented yet; see [docs/web-api-contract.md](docs/web-api-contract.md).

Doctor self-registration also requires the server-only `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env` for private verification document storage. Apply all migrations in order, including `20261008100000_doctor_registration_details.sql`. Never expose the service role key to the web client.
