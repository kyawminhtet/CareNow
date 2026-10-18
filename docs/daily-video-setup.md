# CareNow Daily video setup

CareNow creates one private Daily room per online appointment. The room name is derived from the appointment UUID, and the Daily API key never leaves the NestJS API. Doctor and patient endpoints issue short-lived meeting tokens only to the matching appointment participants.

## Configure the API

Add the Daily developer API key and Daily subdomain to `apps/api/.env`:

```dotenv
DAILY_API_KEY=your_daily_developer_api_key
DAILY_DOMAIN=carenow.daily.co
```

Use the subdomain you selected in Daily. `DAILY_DOMAIN=carenow` is also accepted. Restart the API after setting these values. The app does not need a separate Daily client key.

## Join behavior

- Patients request a token from `POST /v1/patient/appointments/:id/video-token` and open the private Daily Prebuilt room in the device browser.
- Doctors request a token from `POST /v1/web/doctor/appointments/:id/video-token`; the doctor portal embeds Daily Prebuilt on the consultation page.
- Only scheduled online appointments are eligible. Joining opens 15 minutes before the appointment and remains available for 90 minutes after its end.
- Tokens expire after 20 minutes. A participant can request a fresh token from the API while the appointment window is open.
- Rooms are private, limited to two participants, and have recording and chat disabled. Doctor tokens allow screen sharing; patient tokens do not.

The patient app currently uses the device browser for the video UI. The Daily React Native SDK requires custom native code and an Expo development build; Expo Go cannot load that native module. Revisit the SDK integration after the project has a Daily-supported config-plugin version for its Expo SDK.
