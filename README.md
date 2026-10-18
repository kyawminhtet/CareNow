# CareNow

CareNow has a patient-only iOS/Android app in `apps/mobile` and a shared doctor/administrator web application in `apps/web`. Both use Supabase Auth for identity and the NestJS API for application roles and protected data.

## Patient mobile app

The Expo app includes patient email signup/sign-in, doctor search and profiles, online/in-person appointment booking, appointment history and cancellation, notifications, preference controls, and profile management. To connect it to the development services:

```sh
cp apps/mobile/.env.example apps/mobile/.env
# Set the Supabase URL and publishable key from the same project as the API.
# Use an API URL reachable from the device; physical phones cannot reach the Mac via localhost.
npm run dev:api
# In another terminal:
npm run dev:mobile
```

Apply migrations in `supabase/migrations` before registering a patient. Add `carenow://auth/callback` to Supabase Auth's allowed redirect URLs. Signup requires email verification; the app creates the CareNow patient profile on the first sign-in after verification. See [docs/patient-mobile.md](docs/patient-mobile.md) for setup details and current integrations.

Push token registration requires a physical device, an EAS project ID, and a development build with push credentials. The API stores the Expo token, but push delivery still needs the notification worker. Online video and patient-doctor messaging also require integrations that are not yet present; the app displays those unavailable states instead of fake sessions/messages.

## Web app

Requirements: Node.js 22.13 or newer and npm.

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

The NestJS API implements authenticated session resolution, doctor/admin operations, and patient registration/profile/search/slots/booking/appointments/notifications/preferences/device endpoints. Start the API and web app in separate terminals:

~~~sh
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
npm run dev:api
~~~

Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from the same Supabase project as the web app. DATABASE_URL must connect to the database where the CareNow migrations and administrator seed were applied. The local example expects Supabase CLI's local database. Swagger is at /docs. The notification worker, patient-doctor messaging, released consultation records, and video provider are not implemented yet; see [docs/web-api-contract.md](docs/web-api-contract.md) and [docs/patient-mobile.md](docs/patient-mobile.md).

Doctor self-registration also requires the server-only `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env` for private verification document storage. Apply all migrations in order, including `20261008100000_doctor_registration_details.sql`. Never expose the service role key to the web client.
