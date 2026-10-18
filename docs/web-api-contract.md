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

- `GET /v1/web/doctor/profile` reads the signed-in doctor's profile. `PATCH` updates specialty, biography, qualifications, experience, languages, and active consultation services. Medical license number, region, and expiry remain administrator-managed verification records.
- `PATCH /v1/web/doctor/profile/personal` saves the signed-in doctor's personal name and phone number.
- `POST/DELETE /v1/web/doctor/profile/photo` uploads or removes the signed-in doctor's profile photo.
- Administrators use `POST/DELETE /v1/web/admin/doctors/{doctorId}/profile-photo` to manage a doctor's photo; `PATCH /v1/web/admin/doctors/{doctorId}` updates the remaining profile and verification information.

- `GET /v1/web/doctor/dashboard` returns counts and upcoming appointments for the signed-in doctor only.
- `GET /v1/web/doctor/{appointments|patients|messages|availability|consultations|profile}` returns that doctor's authorized list only.
- `GET /v1/web/doctor/availability` returns the signed-in verified doctor's active recurring online rules as weekday, local start/end time, and slot duration.
- `PUT /v1/web/doctor/availability` replaces that doctor's recurring online rules. The API checks that online consultations are enabled, validates days/times/duration, stores local times in `Asia/Yangon`, and records an audit event. In-person rules require a clinic assignment and are not managed by this endpoint.
- `GET /v1/web/doctor/{section}/{uuid}` rechecks the doctor's access to the target record.
- `GET /v1/notifications?limit=25` returns only the recipient's notifications, in reverse chronological order.
- `GET /v1/notifications/unread-count` returns `{ "data": { "count": 0 } }` for the recipient.

## Administrator reads

- `GET /v1/web/admin/dashboard` returns today’s operational counts, up to five pending doctor verification references, and eight recent appointment rows. Patient identities are reduced to opaque references and no clinical content is returned. Waiting and in-progress counts remain zero until consultation and check-in events are persisted.
- `GET /v1/web/admin/appointments?status=ALL&type=ALL&doctorId=...&from=YYYY-MM-DD&to=YYYY-MM-DD` returns up to 500 operational appointment rows and doctor filter options. Dates use `Asia/Yangon`; supported statuses are `SCHEDULED`, `CANCELLED`, `COMPLETED`, and `NO_SHOW`, and types are `ONLINE` and `IN_PERSON`. `GET /{appointmentId}` returns one operational record. Both require an active administrator and omit patient names/contact details, visit reasons, and all clinical content.
- `GET /v1/web/admin/schedules` returns active, verified doctor options, clinics assigned to those doctors, and up to 500 appointment slots, with optional `doctorId`, `from`, and `until` filters. It returns no patient or clinical details.
- `GET /v1/web/admin/doctor-clinics` returns active in-person doctor options, active clinic options, and clinic assignment rows. `POST` accepts `{ doctorId, clinicId, isPrimary? }`; `PATCH /{doctorId}/{clinicId}` accepts `{ isPrimary }`; `DELETE /{doctorId}/{clinicId}` removes the assignment. All writes require an active administrator and are audited. A clinic assignment cannot be removed while its availability rules or appointment slots still reference it; remove schedule references first. Appointment/booking records are never deleted by this endpoint.
- `GET /v1/web/admin/clinics` lists clinic locations, including inactive records and assignment counts. `POST` accepts `{ name, address, city }`; the API supplies the MVP defaults `region = city`, `countryCode = MM`, and `timeZone = Asia/Yangon`. `PUT /{clinicId}` updates the name, address, and city while preserving the saved region/country/timezone. `DELETE /{clinicId}` deactivates and `PATCH /{clinicId}/activate` reactivates a clinic. These operations preserve assignments and schedule/appointment history. All writes require an active administrator and are audited.
- `GET /v1/web/admin/schedules/{slotId}`, `POST /v1/web/admin/schedules`, `PATCH /v1/web/admin/schedules/{slotId}`, and `DELETE /v1/web/admin/schedules/{slotId}` provide administrator timeslot CRUD. Creation and updates validate that the doctor is active, verified, and offers the selected consultation type; in-person slots must use an active assigned clinic. Times must be future-dated, within a year, and non-overlapping. Booked slots cannot be edited or deleted. Admin writes are audited.
- `POST /v1/web/admin/schedules/weekly/preview` accepts `{ doctorId, startDate, endDate, weekdays, startTime, endTime, slotMinutes }` and returns generated slots with conflict flags. `POST /v1/web/admin/schedules/weekly` accepts the same configuration and atomically creates the batch only if all slots are valid and conflict-free. Date ranges are limited to 90 days and batches to 500 slots. Times use `Asia/Yangon`; in-person doctors use their active primary clinic, falling back to online when online service is enabled and no active clinic is assigned. Batch writes are audited.
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

## Specialty catalog

- `GET /v1/public/specialties` returns active `{ id, name }` options for doctor registration.
- Administrators use `GET/POST /v1/web/admin/specialties`, `PUT /v1/web/admin/specialties/{specialtyId}`, and `DELETE /v1/web/admin/specialties/{specialtyId}`. The list includes doctor usage counts. Names are unique without regard to case. Deletion is rejected while doctor profiles use the value; deactivate the specialty instead.
- Both self-registration and administrator invitations submit `specialtyId`. The API resolves it to the active catalog name before creating a doctor profile, so arbitrary names and inactive values are rejected.
- Administrators upload or remove a specialty image with `POST/DELETE /v1/web/admin/specialties/{specialtyId}/photo`. Images are stored privately for writes in the API-managed `specialty-photos` bucket and exposed through public image URLs. Public specialty results include `photoUrl` (nullable) alongside `id` and `name` for the patient app.

## Patient mobile endpoints

All `/v1/patient/*` routes require an active `PATIENT` identity mapping, except `POST /v1/patient/register`, which verifies the Supabase email before provisioning that role and profile. The patient mobile app uses these endpoints:

- `GET/PATCH /v1/patient/profile` reads or updates the current patient's display name and phone.
- `GET /v1/patient/doctors` supports name/specialty query, specialty, consultation type, language, and clinic filters. It returns only active doctors with verified profiles and active services. `GET /v1/patient/doctors/{doctorId}` returns one such profile.
- `GET /v1/patient/slots?doctorId=...&consultationType=...` returns future open slots only. In-person slots include their assigned active clinic.
- `POST /v1/patient/appointments` accepts `{ slotId, reasonForVisit? }`. The API locks and revalidates the slot and verified active doctor/service, derives type/doctor/clinic from the slot, and inserts the appointment while marking the slot booked in one transaction.
- `GET /v1/patient/appointments?status=UPCOMING|COMPLETED|CANCELLED` and `GET /{appointmentId}` return records for the signed-in patient. `POST /{appointmentId}/cancel` releases an eligible future slot. `POST /{appointmentId}/reschedule` accepts a new `slotId` and preserves the same doctor and consultation type.
- `GET /v1/patient/notifications`, `POST /{notificationId}/read`, and `POST /read-all` are recipient-scoped and use messages without patient or clinical detail. `GET/PATCH /v1/patient/notification-preferences` manages patient categories and timezone.
- `POST /v1/patient/devices` registers an Expo push token; `DELETE /{installationId}` removes the current patient's device registration. This stores tokens only; notification delivery still requires a worker and provider setup.

Released consultation records remain unavailable until their separate storage and release workflow is implemented. The patient mobile app and verified-doctor web portal use the appointment chat API below; the web portal proxies chat requests through its server-managed Supabase session.

## Appointment chat API

The database creates one conversation for each appointment. Only the appointment's patient and assigned doctor can access it. A conversation appears in participant inboxes before it opens for sending: messages can be sent starting 15 minutes before the scheduled start, through the scheduled end, and for seven days afterward. After that, it is read-only. Cancelled and no-show appointments are read-only. Existing messages remain readable outside the sending window.

- `GET /v1/chat/conversations?limit=50` returns the current participant's conversations, appointment context, latest message preview, doctor photo URL, unread count, and `availableAt`, `readOnlyAt`, `canSend`, and `readOnly` state.
- `GET /v1/chat/conversations/{conversationId}/messages?limit=50&before={messageUuid}` returns a page of messages in chronological order with an `isMine` and `readAt` state for each message, plus a `nextCursor` for older messages. `after={messageUuid}` pages forward for automatic reconnect catch-up.
- `POST /v1/chat/conversations/{conversationId}/messages` accepts `{ "content": "...", "clientMessageId": "<uuid>" }`. Text must contain 1–4,000 characters after trimming. Reuse the same `clientMessageId` when retrying a send.
- `POST /v1/chat/conversations/{conversationId}/read` marks received messages as read.
- `GET /v1/chat/unread-count` returns `{ "count": 0 }` for the signed-in participant.

Common chat errors use stable API codes: `CHAT_CONVERSATION_NOT_FOUND` (404), `CHAT_MESSAGE_REQUIRED`, `CHAT_MESSAGE_TOO_LONG`, or `INVALID_CHAT_PAGE_SIZE` (400), `CHAT_NOT_OPEN_YET`, `CHAT_READ_ONLY`, or `CHAT_APPOINTMENT_CLOSED` (409), and `CHAT_MESSAGE_SEND_FAILED` (503).

These routes require an active patient or a verified, active doctor bearer token. Administrators cannot access chat. Reads and writes go through NestJS; clients have no grants on the chat tables. Live updates use private Supabase Realtime Broadcast topics named `chat:{conversationId}`. The database policy maps the Supabase Auth identity to the CareNow internal user and permits only the appointment's patient and doctor to receive broadcasts. Clients apply message events immediately, show optimistic sends with retry, and page forward through the API after a Realtime reconnect or app resume. An open conversation also catches up automatically every five seconds, and inboxes sync automatically as a fallback if a Realtime event is missed. Broadcasts are hints; the API remains authoritative.
