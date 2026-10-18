import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SupabaseIdentityService } from "../auth/supabase-identity.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const stripDoctorPrefix = (name: string) => name.replace(/^(?:dr\.?\s*)+/i, "").trim();

@Injectable()
export class PatientService {
  constructor(private readonly prisma: PrismaService, private readonly identity: SupabaseIdentityService) {}

  async register(token: string, body: unknown) {
    const user = await this.identity.verifyAccessToken(token);
    if (!user) throw new UnauthorizedException({ code: "AUTH_TOKEN_INVALID" });
    if (!user.email_confirmed_at) throw new ForbiddenException({ code: "EMAIL_VERIFICATION_REQUIRED" });
    const name = clean((body as Record<string, unknown> | null)?.displayName ?? user.user_metadata?.full_name, 120);
    const phone = clean((body as Record<string, unknown> | null)?.phoneNumber, 40);
    if (name.length < 2) throw new BadRequestException({ code: "DISPLAY_NAME_REQUIRED" });
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<Array<{ id: string; role: string; status: string }>>`
        SELECT au.id::text, au.role::text, au.status::text FROM public.identity_mappings im
        JOIN public.app_users au ON au.id = im.app_user_id
        WHERE im.provider = 'supabase' AND im.provider_subject = ${user.id} FOR UPDATE OF au`;
      if (existing[0] && existing[0].role !== "PATIENT") throw new ConflictException({ code: "ACCOUNT_ROLE_ALREADY_ASSIGNED" });
      if (existing[0] && existing[0].status !== "ACTIVE") throw new ForbiddenException({ code: "ACCOUNT_NOT_ACTIVE" });
      const rows = existing[0] ? existing : await tx.$queryRaw<Array<{ id: string; role: string; status: string }>>`
        INSERT INTO public.app_users (role, status, display_name)
        VALUES ('PATIENT'::public.application_role, 'ACTIVE'::public.account_status, ${name})
        RETURNING id::text, role::text, status::text`;
      const id = rows[0].id;
      if (!existing[0]) {
        await tx.$executeRaw`INSERT INTO public.identity_mappings (app_user_id, provider, provider_subject)
          VALUES (${id}::uuid, 'supabase', ${user.id})`;
        await tx.$executeRaw`INSERT INTO public.patient_profiles (app_user_id, phone_number) VALUES (${id}::uuid, ${phone || null})`;
        await tx.$executeRaw`INSERT INTO public.notification_preferences (app_user_id) VALUES (${id}::uuid)`;
      } else {
        await tx.$executeRaw`UPDATE public.patient_profiles SET phone_number = ${phone || null}, updated_at = now() WHERE app_user_id = ${id}::uuid`;
        await tx.$executeRaw`UPDATE public.app_users SET display_name = ${name}, updated_at = now() WHERE id = ${id}::uuid`;
      }
      return { id, name };
    });
    return { registered: true, user: { id: result.id, role: "PATIENT", displayName: result.name } };
  }

  async profile(patientId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; displayName: string; email: string | null; phoneNumber: string | null }>>`
      SELECT au.id::text, au.display_name AS "displayName", im.provider_subject AS "identityId", pp.phone_number AS "phoneNumber"
      FROM public.app_users au JOIN public.identity_mappings im ON im.app_user_id = au.id AND im.provider = 'supabase'
      LEFT JOIN public.patient_profiles pp ON pp.app_user_id = au.id WHERE au.id = ${patientId}::uuid`;
    if (!rows[0]) throw new NotFoundException({ code: "PATIENT_NOT_FOUND" });
    return { item: { id: rows[0].id, displayName: rows[0].displayName, phoneNumber: rows[0].phoneNumber } };
  }

  async updateProfile(patientId: string, body: unknown) {
    const input = body as Record<string, unknown>;
    const name = clean(input?.displayName, 120); const phone = clean(input?.phoneNumber, 40);
    if (name.length < 2) throw new BadRequestException({ code: "DISPLAY_NAME_REQUIRED" });
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE public.app_users SET display_name = ${name}, updated_at = now() WHERE id = ${patientId}::uuid AND role = 'PATIENT'`,
      this.prisma.$executeRaw`UPDATE public.patient_profiles SET phone_number = ${phone || null}, updated_at = now() WHERE app_user_id = ${patientId}::uuid`,
    ]);
    return this.profile(patientId);
  }

  async doctors(filters: { query?: string; specialty?: string; consultationType?: string; language?: string; clinicId?: string; doctorId?: string }) {
    if (filters.consultationType && !["ONLINE", "IN_PERSON"].includes(filters.consultationType)) throw new BadRequestException({ code: "INVALID_CONSULTATION_TYPE" });
    const q = clean(filters.query, 100); const specialty = clean(filters.specialty, 80); const language = clean(filters.language, 50);
    const clinicId = filters.clinicId && UUID.test(filters.clinicId) ? filters.clinicId : null;
    const doctorId = filters.doctorId && UUID.test(filters.doctorId) ? filters.doctorId : null;
    const doctors = await this.prisma.$queryRaw<Array<{ id: string; name: string; specialty: string; biography: string; experienceYears: number | null; qualifications: string | null; languages: string[]; services: string[]; clinicNames: string[]; nextAvailableAt: Date | null; profilePhotoKey: string | null }>>`
      SELECT au.id::text AS id, au.display_name AS name, dp.specialty, dp.biography,
        dp.profile_photo_key AS "profilePhotoKey",
        dp.experience_years AS "experienceYears", dp.qualifications, dp.languages,
        (SELECT MIN(s.starts_at) FROM public.appointment_slots s
          JOIN public.doctor_services active_service ON active_service.doctor_user_id=s.doctor_user_id AND active_service.consultation_type=s.consultation_type AND active_service.is_active
          LEFT JOIN public.clinics active_clinic ON active_clinic.id=s.clinic_id AND active_clinic.is_active
          WHERE s.doctor_user_id=dp.app_user_id AND s.status='OPEN' AND s.starts_at>now()
            AND (s.clinic_id IS NULL OR active_clinic.id IS NOT NULL)) AS "nextAvailableAt",
        array_agg(DISTINCT ds.consultation_type::text) FILTER (WHERE ds.id IS NOT NULL) AS services,
        array_agg(DISTINCT c.name) FILTER (WHERE c.id IS NOT NULL) AS "clinicNames"
      FROM public.doctor_profiles dp JOIN public.app_users au ON au.id = dp.app_user_id
      LEFT JOIN public.doctor_services ds ON ds.doctor_user_id = dp.app_user_id AND ds.is_active
      LEFT JOIN public.doctor_clinics dc ON dc.doctor_user_id = dp.app_user_id
      LEFT JOIN public.clinics c ON c.id = dc.clinic_id AND c.is_active
      WHERE dp.verification_status = 'VERIFIED' AND au.status = 'ACTIVE'
        AND (${doctorId}::uuid IS NULL OR au.id = ${doctorId}::uuid)
        AND (${q} = '' OR au.display_name ILIKE '%' || ${q} || '%' OR dp.specialty ILIKE '%' || ${q} || '%')
        AND (${specialty} = '' OR dp.specialty ILIKE '%' || ${specialty} || '%')
        AND (${filters.consultationType ?? null}::text IS NULL OR EXISTS (SELECT 1 FROM public.doctor_services x WHERE x.doctor_user_id = dp.app_user_id AND x.is_active AND x.consultation_type::text = ${filters.consultationType ?? null}))
        AND (${language} = '' OR ${language} = ANY(dp.languages))
        AND (${clinicId}::uuid IS NULL OR EXISTS (SELECT 1 FROM public.doctor_clinics x JOIN public.clinics y ON y.id=x.clinic_id AND y.is_active WHERE x.doctor_user_id=dp.app_user_id AND x.clinic_id=${clinicId}::uuid))
      GROUP BY au.id, dp.app_user_id ORDER BY au.display_name LIMIT 100`;
    return { items: doctors.map((doctor) => ({ ...doctor, name: stripDoctorPrefix(doctor.name), profilePhotoUrl: this.profilePhotoUrl(doctor.profilePhotoKey), services: doctor.services ?? [], clinicNames: doctor.clinicNames ?? [] })) };
  }

  private profilePhotoUrl(key: string | null) {
    const base = process.env.SUPABASE_URL;
    return key && base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/doctor-profile-photos/${key.split("/").map(encodeURIComponent).join("/")}` : null;
  }

  async doctor(doctorId: string) {
    if (!UUID.test(doctorId)) throw new BadRequestException({ code: "INVALID_DOCTOR_ID" });
    const result = await this.doctors({ doctorId });
    const item = result.items.find((doctor) => doctor.id === doctorId);
    if (!item) throw new NotFoundException({ code: "ACTIVE_VERIFIED_DOCTOR_NOT_FOUND" });
    return { item };
  }

  async slots(doctorId: string, consultationType: string, from?: string, until?: string) {
    if (!UUID.test(doctorId) || !["ONLINE", "IN_PERSON"].includes(consultationType)) throw new BadRequestException({ code: "INVALID_SLOT_FILTER" });
    return { items: await this.prisma.$queryRaw<Array<{ id: string; startsAt: Date; endsAt: Date; clinicId: string | null; clinicName: string | null }>>`
      SELECT s.id::text, s.starts_at AS "startsAt", s.ends_at AS "endsAt", s.clinic_id::text AS "clinicId", c.name AS "clinicName"
      FROM public.appointment_slots s JOIN public.doctor_profiles dp ON dp.app_user_id=s.doctor_user_id AND dp.verification_status='VERIFIED'
      JOIN public.app_users au ON au.id=dp.app_user_id AND au.status='ACTIVE'
      JOIN public.doctor_services ds ON ds.doctor_user_id=s.doctor_user_id AND ds.is_active AND ds.consultation_type=s.consultation_type
      LEFT JOIN public.clinics c ON c.id=s.clinic_id AND c.is_active
      WHERE s.doctor_user_id=${doctorId}::uuid AND s.consultation_type=${consultationType}::public.consultation_type
      AND s.status='OPEN' AND s.starts_at > now() AND (${from ?? null}::timestamptz IS NULL OR s.starts_at >= ${from ?? null}::timestamptz)
      AND (${until ?? null}::timestamptz IS NULL OR s.starts_at < ${until ?? null}::timestamptz)
      AND (s.clinic_id IS NULL OR c.id IS NOT NULL) ORDER BY s.starts_at LIMIT 300` };
  }

  async book(patientId: string, body: unknown) {
    const input = body as Record<string, unknown>; const slotId = clean(input?.slotId, 40); const reason = clean(input?.reasonForVisit, 1000);
    if (!UUID.test(slotId)) throw new BadRequestException({ code: "INVALID_SLOT_ID" });
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
      const slots = await tx.$queryRaw<Array<{ id: string; doctorId: string; type: string; clinicId: string | null; startsAt: Date }>>`
        SELECT id::text, doctor_user_id::text AS "doctorId", consultation_type::text AS type, clinic_id::text AS "clinicId", starts_at AS "startsAt"
        FROM public.appointment_slots WHERE id=${slotId}::uuid AND status='OPEN' FOR UPDATE`;
      const slot = slots[0];
      if (!slot || slot.startsAt <= new Date()) throw new ConflictException({ code: "APPOINTMENT_SLOT_UNAVAILABLE" });
      const allowed = await tx.$queryRaw<Array<{ ok: boolean }>>`
        SELECT EXISTS(SELECT 1 FROM public.doctor_profiles dp JOIN public.app_users au ON au.id=dp.app_user_id AND au.status='ACTIVE'
          JOIN public.doctor_services ds ON ds.doctor_user_id=dp.app_user_id AND ds.is_active AND ds.consultation_type=${slot.type}::public.consultation_type
          WHERE dp.app_user_id=${slot.doctorId}::uuid AND dp.verification_status='VERIFIED'
          AND (${slot.clinicId}::uuid IS NULL OR EXISTS(SELECT 1 FROM public.doctor_clinics dc JOIN public.clinics c ON c.id=dc.clinic_id AND c.is_active WHERE dc.doctor_user_id=dp.app_user_id AND dc.clinic_id=${slot.clinicId}::uuid))) AS ok`;
      if (!allowed[0]?.ok) throw new ConflictException({ code: "DOCTOR_NO_LONGER_BOOKABLE" });
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO public.appointments(slot_id,patient_user_id,doctor_user_id,consultation_type,clinic_id,reason_for_visit)
        VALUES(${slotId}::uuid,${patientId}::uuid,${slot.doctorId}::uuid,${slot.type}::public.consultation_type,${slot.clinicId}::uuid,${reason || null}) RETURNING id::text`;
      await tx.$executeRaw`UPDATE public.appointment_slots SET status='BOOKED' WHERE id=${slotId}::uuid`;
      await tx.$executeRaw`INSERT INTO public.notifications(recipient_user_id,target_type,target_id,title,safe_message)
        VALUES(${patientId}::uuid,'APPOINTMENT'::public.notification_target_type,${rows[0].id}::uuid,'Appointment confirmed','Your CareNow appointment is confirmed.')`;
      await tx.$executeRaw`INSERT INTO public.notifications(recipient_user_id,target_type,target_id,title,safe_message)
        VALUES(${slot.doctorId}::uuid,'APPOINTMENT'::public.notification_target_type,${rows[0].id}::uuid,'New appointment','A patient booked an appointment.')`;
        return rows[0].id;
      });
    } catch (error) {
      if (this.isAppointmentSlotUniqueViolation(error)) throw new ConflictException({ code: "APPOINTMENT_SLOT_UNAVAILABLE" });
      throw error;
    }
    // appointment() already wraps its value in { item }; return the record
    // directly here so the booking response is { created, item: { id, ... } }.
    return { created: true, item: (await this.appointment(patientId, id)).item };
  }

  async appointments(patientId: string, status?: string) {
    if (status && !["UPCOMING", "COMPLETED", "CANCELLED"].includes(status)) throw new BadRequestException({ code: "INVALID_APPOINTMENT_STATUS" });
    const items = await this.prisma.$queryRaw<Array<Record<string, unknown> & { status: string; startsAt: Date }>>`
      SELECT a.id::text,a.doctor_user_id::text AS "doctorId",a.status::text, a.consultation_type::text AS "consultationType", a.reason_for_visit AS "reasonForVisit",
        s.starts_at AS "startsAt",s.ends_at AS "endsAt",au.display_name AS "doctorName",dp.specialty,
        c.name AS "clinicName",c.address AS "clinicAddress",c.city AS "clinicCity"
      FROM public.appointments a JOIN public.appointment_slots s ON s.id=a.slot_id
      JOIN public.app_users au ON au.id=a.doctor_user_id JOIN public.doctor_profiles dp ON dp.app_user_id=a.doctor_user_id
      LEFT JOIN public.clinics c ON c.id=a.clinic_id WHERE a.patient_user_id=${patientId}::uuid
      AND (${status ?? null}::text IS NULL OR (${status ?? null}='UPCOMING' AND a.status='SCHEDULED' AND s.ends_at>=now()) OR (${status ?? null}='COMPLETED' AND a.status IN ('COMPLETED','NO_SHOW')) OR (${status ?? null}='CANCELLED' AND a.status='CANCELLED'))
      ORDER BY s.starts_at ASC LIMIT 100`;
    if (status === "COMPLETED") items.reverse();
    return { items: items.map((item) => ({ ...item, doctorName: stripDoctorPrefix(String(item.doctorName ?? "")) })) };
  }

  async appointment(patientId: string, appointmentId: string) {
    if (!UUID.test(appointmentId)) throw new BadRequestException({ code: "INVALID_APPOINTMENT_ID" });
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>> & Array<{ id: string }>>`
      SELECT a.id::text,a.doctor_user_id::text AS "doctorId",a.status::text,a.consultation_type::text AS "consultationType",a.reason_for_visit AS "reasonForVisit",
        s.starts_at AS "startsAt",s.ends_at AS "endsAt",au.display_name AS "doctorName",dp.specialty,
        c.name AS "clinicName",c.address AS "clinicAddress",c.city AS "clinicCity"
      FROM public.appointments a JOIN public.appointment_slots s ON s.id=a.slot_id JOIN public.app_users au ON au.id=a.doctor_user_id
      JOIN public.doctor_profiles dp ON dp.app_user_id=a.doctor_user_id LEFT JOIN public.clinics c ON c.id=a.clinic_id
      WHERE a.patient_user_id=${patientId}::uuid AND a.id=${appointmentId}::uuid`;
    if (!rows[0]) throw new NotFoundException({ code: "APPOINTMENT_NOT_FOUND" });
    return { item: { ...rows[0], doctorName: stripDoctorPrefix(String(rows[0].doctorName ?? "")) } };
  }

  async cancel(patientId: string, appointmentId: string) {
    if (!UUID.test(appointmentId)) throw new BadRequestException({ code: "INVALID_APPOINTMENT_ID" });
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ slotId: string; startsAt: Date; doctorId: string }>>`
        SELECT a.slot_id::text AS "slotId",s.starts_at AS "startsAt",a.doctor_user_id::text AS "doctorId"
        FROM public.appointments a JOIN public.appointment_slots s ON s.id=a.slot_id
        WHERE a.id=${appointmentId}::uuid AND a.patient_user_id=${patientId}::uuid AND a.status='SCHEDULED' FOR UPDATE OF a,s`;
      if (!rows[0]) throw new ConflictException({ code: "APPOINTMENT_NOT_CANCELLABLE" });
      if (rows[0].startsAt <= new Date()) throw new ConflictException({ code: "APPOINTMENT_ALREADY_STARTED" });
      await tx.$executeRaw`UPDATE public.appointments SET status='CANCELLED',updated_at=now() WHERE id=${appointmentId}::uuid`;
      await tx.$executeRaw`UPDATE public.appointment_slots SET status='OPEN' WHERE id=${rows[0].slotId}::uuid AND starts_at>now()`;
      await tx.$executeRaw`INSERT INTO public.notifications(recipient_user_id,target_type,target_id,title,safe_message)
        VALUES(${rows[0].doctorId}::uuid,'APPOINTMENT'::public.notification_target_type,${appointmentId}::uuid,'Appointment cancelled','A patient cancelled an appointment.')`;
    });
    return { cancelled: true, item: (await this.appointment(patientId, appointmentId)).item };
  }

  async reschedule(patientId: string, appointmentId: string, body: unknown) {
    if (!UUID.test(appointmentId)) throw new BadRequestException({ code: "INVALID_APPOINTMENT_ID" });
    const slotId = clean((body as Record<string, unknown> | null)?.slotId, 40);
    if (!UUID.test(slotId)) throw new BadRequestException({ code: "INVALID_SLOT_ID" });
    try {
      await this.prisma.$transaction(async (tx) => {
      const currentRows = await tx.$queryRaw<Array<{ doctorId: string; type: string; startsAt: Date; slotId: string }>>`
        SELECT a.doctor_user_id::text AS "doctorId",a.consultation_type::text AS type,a.slot_id::text AS "slotId",s.starts_at AS "startsAt"
        FROM public.appointments a JOIN public.appointment_slots s ON s.id=a.slot_id
        WHERE a.id=${appointmentId}::uuid AND a.patient_user_id=${patientId}::uuid AND a.status='SCHEDULED' FOR UPDATE OF a,s`;
      const current = currentRows[0];
      if (!current) throw new ConflictException({ code: "APPOINTMENT_NOT_RESCHEDULABLE" });
      if (current.startsAt <= new Date()) throw new ConflictException({ code: "APPOINTMENT_ALREADY_STARTED" });
      const nextRows = await tx.$queryRaw<Array<{ doctorId: string; type: string; clinicId: string | null; startsAt: Date }>>`
        SELECT doctor_user_id::text AS "doctorId",consultation_type::text AS type,clinic_id::text AS "clinicId",starts_at AS "startsAt"
        FROM public.appointment_slots WHERE id=${slotId}::uuid AND status='OPEN' FOR UPDATE`;
      const next = nextRows[0];
      if (!next || next.startsAt <= new Date()) throw new ConflictException({ code: "APPOINTMENT_SLOT_UNAVAILABLE" });
      if (next.doctorId !== current.doctorId || next.type !== current.type) throw new BadRequestException({ code: "RESCHEDULE_MUST_KEEP_DOCTOR_AND_TYPE" });
      await tx.$executeRaw`UPDATE public.appointments SET slot_id=${slotId}::uuid,clinic_id=${next.clinicId}::uuid,updated_at=now() WHERE id=${appointmentId}::uuid`;
      await tx.$executeRaw`UPDATE public.appointment_slots SET status='OPEN' WHERE id=${current.slotId}::uuid AND starts_at>now()`;
      await tx.$executeRaw`UPDATE public.appointment_slots SET status='BOOKED' WHERE id=${slotId}::uuid`;
      await tx.$executeRaw`INSERT INTO public.notifications(recipient_user_id,target_type,target_id,title,safe_message)
        VALUES(${patientId}::uuid,'APPOINTMENT'::public.notification_target_type,${appointmentId}::uuid,'Appointment updated','Your CareNow appointment time has changed.')`;
      await tx.$executeRaw`INSERT INTO public.notifications(recipient_user_id,target_type,target_id,title,safe_message)
        VALUES(${current.doctorId}::uuid,'APPOINTMENT'::public.notification_target_type,${appointmentId}::uuid,'Appointment updated','A patient rescheduled an appointment.')`;
      });
    } catch (error) {
      if (this.isAppointmentSlotUniqueViolation(error)) throw new ConflictException({ code: "APPOINTMENT_SLOT_UNAVAILABLE" });
      throw error;
    }
    return { updated: true, item: (await this.appointment(patientId, appointmentId)).item };
  }

  async notificationList(patientId: string) {
    const items = await this.prisma.$queryRaw<Array<Record<string, unknown>> & Array<{ id: string }>>`
      SELECT id::text,title,safe_message AS message,is_read AS "isRead",created_at AS "createdAt",target_type::text AS "targetType",target_id::text AS "targetId"
      FROM public.notifications WHERE recipient_user_id=${patientId}::uuid ORDER BY created_at DESC LIMIT 100`;
    return { items };
  }

  async markRead(patientId: string, notificationId?: string) {
    if (notificationId && !UUID.test(notificationId)) throw new BadRequestException({ code: "INVALID_NOTIFICATION_ID" });
    if (notificationId) await this.prisma.$executeRaw`UPDATE public.notifications SET is_read=true,read_at=now() WHERE recipient_user_id=${patientId}::uuid AND id=${notificationId}::uuid AND NOT is_read`;
    else await this.prisma.$executeRaw`UPDATE public.notifications SET is_read=true,read_at=now() WHERE recipient_user_id=${patientId}::uuid AND NOT is_read`;
    return { updated: true };
  }

  async preferences(patientId: string, body?: unknown) {
    if (body !== undefined) {
      const input = body as Record<string, unknown>;
      for (const field of ["appointmentUpdates", "reminders", "messages", "releasedRecords"] as const) if (typeof input?.[field] !== "boolean") throw new BadRequestException({ code: "INVALID_NOTIFICATION_PREFERENCES" });
      const tz = clean(input.timeZone, 80) || "Asia/Yangon";
      const reminderMinutes = Number(input.reminderMinutesBefore ?? 1440);
      if (![30, 1440].includes(reminderMinutes)) throw new BadRequestException({ code: "INVALID_REMINDER_TIMING" });
      try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { throw new BadRequestException({ code: "INVALID_TIME_ZONE" }); }
      await this.prisma.$executeRaw`UPDATE public.notification_preferences SET appointment_updates=${input.appointmentUpdates as boolean},reminders=${input.reminders as boolean},messages=${input.messages as boolean},released_records=${input.releasedRecords as boolean},reminder_minutes_before=${reminderMinutes},time_zone=${tz},updated_at=now() WHERE app_user_id=${patientId}::uuid`;
    }
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>> & Array<{ app_user_id: string }>>`
      SELECT appointment_updates AS "appointmentUpdates",reminders,messages,released_records AS "releasedRecords",reminder_minutes_before AS "reminderMinutesBefore",time_zone AS "timeZone"
      FROM public.notification_preferences WHERE app_user_id=${patientId}::uuid`;
    return { item: rows[0] ?? { appointmentUpdates: true, reminders: true, messages: true, releasedRecords: true, reminderMinutesBefore: 1440, timeZone: "Asia/Yangon" } };
  }

  async registerDevice(patientId: string, body: unknown) {
    const input = body as Record<string, unknown>; const installationId = clean(input?.installationId, 100); const token = clean(input?.pushToken, 300); const platform = clean(input?.platform, 10).toUpperCase();
    if (!installationId || !token || !["IOS", "ANDROID"].includes(platform) || !token.startsWith("ExponentPushToken[")) throw new BadRequestException({ code: "INVALID_PUSH_DEVICE" });
    await this.prisma.$executeRaw`INSERT INTO public.push_devices(app_user_id,installation_id,platform,push_token)
      VALUES(${patientId}::uuid,${installationId},${platform},${token})
      ON CONFLICT(app_user_id,installation_id) DO UPDATE SET platform=EXCLUDED.platform,push_token=EXCLUDED.push_token,updated_at=now()`;
    return { registered: true };
  }

  async removeDevice(patientId: string, installationId: string) {
    await this.prisma.$executeRaw`DELETE FROM public.push_devices WHERE app_user_id=${patientId}::uuid AND installation_id=${installationId}`;
    return { removed: true };
  }

  private isAppointmentSlotUniqueViolation(error: unknown) {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
      const value = current as { code?: unknown; constraint?: unknown; meta?: { code?: unknown; message?: unknown; target?: unknown }; message?: unknown; cause?: unknown };
      const detail = [value.constraint, value.message, value.meta?.message, value.meta?.target].map(String).join(" ").toLowerCase();
      if ((value.code === "23505" || value.meta?.code === "23505" || value.code === "P2002" || value.code === "P2010") && /appointment_slot_unique|slot_id/.test(detail)) return true;
      current = value.cause;
    }
    return false;
  }
}
