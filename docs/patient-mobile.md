# CareNow patient mobile app

`apps/mobile` is the patient-only Expo app for iOS and Android. It authenticates through Supabase, stores the Supabase session in SecureStore, and sends bearer tokens to the CareNow API. Patients cannot select an application role; the API provisions only the `PATIENT` role after Supabase confirms the email address.

## Start locally

1. Install Node.js 22.13 or newer and run `npm install` from the repository root.
2. Apply the foundation, doctor-registration, and patient migrations in order. With local Supabase, `supabase start` and `supabase db reset` apply the checked-in migrations.
3. In Supabase Auth, enable email confirmation and add the callback to **Authentication → URL Configuration → Redirect URLs**:
   - For an installed CareNow development/production build, allow `carenow://**`.
   - For Expo Go, start Metro first and allow the exact `exp://<Metro-host>:<port>/--/auth/callback` URL generated for that run. Expo Go uses a changing development URL; use a development build with the `carenow` scheme for a stable email callback.
4. Copy the example env file and set values from the same Supabase project used by the API:

   ```sh
   cp apps/mobile/.env.example apps/mobile/.env
   ```

   Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_CARENOW_API_URL`. For Expo Go on a physical phone, a `localhost` API URL is automatically mapped to the Metro host's LAN address. Keep the phone and development computer on the same network, and make sure the API is running. For a development build, use an API address reachable from the phone. Never place Supabase service-role keys or database credentials in this file.

5. Configure and start `apps/api` using its `.env.example` and the same Supabase project/database, then run:

   ```sh
   npm run dev:mobile
   ```

   Use Expo Go for the app UI and auth flow. Use an iOS/Android development build for remote push notifications.

## Patient flow

- Sign up with name, email, optional phone, and a password of at least eight characters. Verify the email, then return to CareNow and sign in; the API provisions the patient account, profile, and notification preferences on first verified sign-in. A browser message after verification can mean the OS could not open the app link; if the email is confirmed, sign in manually to finish setup.
- Home lists active, verified doctors from the API. Search results are constrained to public doctor profile fields and consultation offerings.
- Booking loads open future slots for the selected doctor and consultation type. The selected slot is locked and validated in one database transaction before the appointment is created, preventing concurrent double booking. The API derives doctor, type, and clinic from the stored slot rather than trusting client fields.
- Patients can browse upcoming, completed, and cancelled appointments, view clinic details and directions, join the online waiting-room screen, cancel eligible appointments, read safe notifications, and edit notification preferences and contact details.
- Push tokens are registered only after an explicit user action. The API stores the device token; the notification worker and provider credentials must be deployed before remote messages are delivered.

## Current integration boundaries

Appointment-linked text chat is available through the authenticated API and the patient mobile app. The patient sees conversations in Messages and from appointment details; private Realtime updates use the user's Supabase session. An open conversation catches up automatically every five seconds if a Realtime event is missed, and again when the app returns to the foreground. The inbox also syncs automatically. Attachments are not supported. Released consultation summaries, prescriptions, and follow-up records still require their separate storage and release workflow. The online waiting room is connected to Daily for video consultations.

The patient schema migration is `supabase/migrations/20261010120000_patient_mobile_foundation.sql`. It adds the PATIENT role, patient profile and push-device tables, retaining API-only table access with RLS enabled and no grants to browser roles.
