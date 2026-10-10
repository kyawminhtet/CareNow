# Doctor/admin web API contract

The web client is one deployment and one sign-in. Supabase Auth provides identity; the API remains authoritative for application roles, account state, verification state, record access, and every write. The web client keeps Supabase session tokens in server-managed cookies. Server components and server actions send the access token to the API over HTTPS. Do not send application role claims from browser form fields or URL parameters.

## Session and onboarding

### `GET /v1/auth/session`

Requires a verified Supabase access token. The API validates the bearer token with Supabase Auth, resolves the provider subject through the internal identity mapping, and returns the role and account state from CareNow's database. The web app signs in with email and password; application authorization is still enforced by the API. Response:

```json
{
  "user": {
    "id": "internal-user-uuid",
    "role": "DOCTOR",
    "accountStatus": "ACTIVE",
    "verificationStatus": "VERIFIED",
    "displayName": "Dr. Example"
  }
}
```

Allowed web roles are `DOCTOR` and `ADMINISTRATOR`; one role is assigned per account. Pending doctors can access onboarding/profile only. Only active, verified doctors can open clinical workflows. Invited, suspended and inactive accounts cannot use clinical routes. Administrators are provisioned through controlled processes and never through public registration.

### `POST /v1/public/doctor-registrations`

Accepts multipart account, professional, service and verification-document fields from the server-side registration action. The API validates all fields again, rate limits submissions, creates the identity/account mapping, stores documents privately in quarantine, records audit metadata without document contents, and sends the email verification link. It returns `201`/`202` only when the registration transaction was accepted. The API must never trust a role included in metadata or a form field.

### `POST /v1/web/admin/doctors/invitations`

Requires an active administrator bearer token. Accepts multipart doctor account, professional, service, terms, and verification-document fields. The API validates the administrator against the CareNow identity mapping, creates a Supabase invitation, persists the account with `INVITED` status and the doctor profile with `PENDING` verification, stores the documents privately, and records an operational audit event. It does not accept a role from the form. The doctor follows the email link to set a password; on the next successful sign-in the API activates the invited account, which remains pending verification until an administrator completes review.

The optional initial schedule accepts online weekdays, local start/end times, and slot duration. In-person availability is configured after a clinic is assigned. An administrator must configure the portal timezone consistently with `Asia/Yangon` (or the selected clinic timezone) when reviewing these local hours.

### `POST /v1/auth/activate-invited-doctor`

Requires the invited doctor's verified Supabase bearer token. Activates only an account that is still `INVITED`, has the `DOCTOR` role, and has a doctor profile. It cannot activate administrator or suspended accounts.

## Doctor reads

- `GET /v1/web/doctor/dashboard` returns counts and upcoming appointments for the signed-in doctor only.
- `GET /v1/web/doctor/{appointments|patients|messages|availability|consultations|profile}` returns that doctor's authorized list only.
- `GET /v1/web/doctor/availability` returns the signed-in verified doctor's active recurring online rules as weekday, local start/end time, and slot duration.
- `PUT /v1/web/doctor/availability` replaces that doctor's recurring online rules. The API checks that online consultations are enabled, validates days/times/duration, stores local times in `Asia/Yangon`, and records an audit event. In-person rules require a clinic assignment and are not managed by this endpoint.
- `GET /v1/web/doctor/{section}/{uuid}` rechecks the doctor's access to the target record.
- `GET /v1/notifications?limit=25` returns only the recipient's notifications, in reverse chronological order.
- `GET /v1/notifications/unread-count` returns `{ "data": { "count": 0 } }` for the recipient.

## Administrator reads

- `GET /v1/web/admin/dashboard` returns today’s operational counts, up to five pending doctor verification references, and eight recent appointment rows. Patient identities are reduced to opaque references and no clinical content is returned. Waiting and in-progress counts remain zero until consultation and check-in events are persisted.
- `GET /v1/web/admin/schedules` returns active, verified doctor options, clinics assigned to those doctors, and up to 500 appointment slots, with optional `doctorId`, `from`, and `until` filters. It returns no patient or clinical details.
- `GET /v1/web/admin/schedules/{slotId}`, `POST /v1/web/admin/schedules`, `PATCH /v1/web/admin/schedules/{slotId}`, and `DELETE /v1/web/admin/schedules/{slotId}` provide administrator timeslot CRUD. Creation and updates validate that the doctor is active, verified, and offers the selected consultation type; in-person slots must use an active assigned clinic. Times must be future-dated, within a year, and non-overlapping. Booked slots cannot be edited or deleted. Admin writes are audited.
- `GET /v1/web/admin/{doctors|schedules|patients|appointments|consultations|reports|audit-logs|settings}` returns data authorized for operations.
- `GET /v1/web/admin/{section}/{uuid}` rechecks operational record access.
- The admin appointment row is limited to `id`, opaque `patientReference`, `doctorName`, date/time, one consultation type, nonclinical location and appointment status. Never return patient name, visit reason, diagnosis, clinical notes, prescription contents, private message content/attachments, or video/audio data to administrator contracts.
- Administrator notifications may contain verification and operational event context only. They must not include clinical content.

## Notification inbox writes

- `PATCH /v1/notifications/{uuid}/read` marks one recipient-owned inbox row as read.
- `PATCH /v1/notifications/read-all` marks all of the current recipient's inbox rows read.
- `POST /v1/notifications/{uuid}/open` rechecks recipient ownership and the target's current authorization, marks the row read, and returns only an allowlisted `targetType` and opaque `targetId`. The web app maps target types to local role-specific routes and makes a separately authorized API fetch after navigation.
- A notification ID is never authorization. In-app safe content must be written alongside the business event through a transactional outbox; provider failures do not affect business operations.

## Shared API response rules

List payloads currently consumed by the web UI use `{ "items": [{ "id", "label", "detail", "status", "updatedAt", "reference?" }] }`. API handlers must scope records to the authenticated role before returning the response. `detail` is role-specific and must be safe for the requesting role. Error responses use stable `{ "code", "parameters?", "requestId" }` fields; clients show localized messages, never database errors or stack traces.

The web app does not implement browser push. Doctor and administrator notification delivery remains in the persistent inbox and is available on the next portal visit.
