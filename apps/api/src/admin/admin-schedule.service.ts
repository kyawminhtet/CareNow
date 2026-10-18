import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type ConsultationTypeValue = "ONLINE" | "IN_PERSON";
type SlotStatusValue = "OPEN" | "BLOCKED";
type SlotInput = { doctorId: string; consultationType: ConsultationTypeValue; clinicId: string | null; startsAt: Date; endsAt: Date; status: SlotStatusValue };
type WeeklyScheduleInput = { doctorId: string; startDate: string; endDate: string; weekdays: number[]; startTime: string; endTime: string; slotMinutes: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AdminScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async getSchedule(filters: { doctorId?: string; from?: string; until?: string }) {
    const doctors = await this.prisma.doctorProfile.findMany({
      where: { verificationStatus: "VERIFIED", appUser: { status: "ACTIVE" }, services: { some: { isActive: true } } },
      include: { appUser: true, services: { where: { isActive: true } } },
      orderBy: { appUser: { displayName: "asc" } },
    });
    const doctorOptions = doctors.map((doctor) => ({
      id: doctor.appUserId,
      name: doctor.appUser.displayName,
      specialty: doctor.specialty,
      services: doctor.services.map((service) => service.consultationType),
    }));

    const clinics = await this.prisma.$queryRaw<Array<{ doctorId: string; clinicId: string; name: string; isPrimary: boolean }>>`
      SELECT dc.doctor_user_id::text AS "doctorId", c.id::text AS "clinicId", c.name, dc.is_primary AS "isPrimary"
        FROM public.doctor_clinics dc
        JOIN public.clinics c ON c.id = dc.clinic_id AND c.is_active = true
        JOIN public.doctor_profiles dp ON dp.app_user_id = dc.doctor_user_id AND dp.verification_status = 'VERIFIED'
        JOIN public.app_users au ON au.id = dp.app_user_id AND au.status = 'ACTIVE'
       ORDER BY dc.is_primary DESC, c.name
    `;
    const filtersParsed = this.readFilters(filters);
    const slotRows = await this.prisma.$queryRaw<Array<{
      id: string; doctorId: string; doctorName: string; consultationType: string; clinicId: string | null;
      clinicName: string | null; startsAt: Date; endsAt: Date; status: string;
    }>>`
      SELECT s.id::text, s.doctor_user_id::text AS "doctorId", au.display_name AS "doctorName",
             s.consultation_type::text AS "consultationType", s.clinic_id::text AS "clinicId",
             c.name AS "clinicName", s.starts_at AS "startsAt", s.ends_at AS "endsAt", s.status::text AS status
        FROM public.appointment_slots s
        JOIN public.app_users au ON au.id = s.doctor_user_id
        LEFT JOIN public.clinics c ON c.id = s.clinic_id
       WHERE (${filtersParsed.doctorId}::uuid IS NULL OR s.doctor_user_id = ${filtersParsed.doctorId}::uuid)
         AND (${filtersParsed.from}::timestamptz IS NULL OR s.starts_at >= ${filtersParsed.from}::timestamptz)
         AND (${filtersParsed.until}::timestamptz IS NULL OR s.starts_at < ${filtersParsed.until}::timestamptz)
       ORDER BY s.starts_at, au.display_name
       LIMIT 500
    `;
    return {
      doctors: doctorOptions,
      clinics,
      items: slotRows.map((slot) => ({ ...slot, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() })),
    };
  }

  async getSlot(slotId: string) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>> & Array<{
      id: string; doctorId: string; doctorName: string; consultationType: string; clinicId: string | null;
      clinicName: string | null; startsAt: Date; endsAt: Date; status: string;
    }>>`
      SELECT s.id::text, s.doctor_user_id::text AS "doctorId", au.display_name AS "doctorName",
             s.consultation_type::text AS "consultationType", s.clinic_id::text AS "clinicId",
             c.name AS "clinicName", s.starts_at AS "startsAt", s.ends_at AS "endsAt", s.status::text AS status
        FROM public.appointment_slots s
        JOIN public.app_users au ON au.id = s.doctor_user_id
        LEFT JOIN public.clinics c ON c.id = s.clinic_id
       WHERE s.id = ${slotId}::uuid
    `;
    const slot = rows[0];
    if (!slot) throw new NotFoundException({ code: "APPOINTMENT_SLOT_NOT_FOUND" });
    return { item: { ...slot, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() } };
  }

  async createSlot(actorUserId: string, body: unknown) {
    const input = this.readInput(body, true);
    await this.assertDoctorCanOffer(input);
    const rows = await this.prisma.$transaction(async (tx) => {
      await this.lockDoctorRow(tx, input.doctorId);
      await this.assertNoOverlap(input, undefined, tx);
      const created = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO public.appointment_slots
          (doctor_user_id, consultation_type, clinic_id, starts_at, ends_at, status)
        VALUES (${input.doctorId}::uuid, ${input.consultationType}::public.consultation_type,
          ${input.clinicId}::uuid, ${input.startsAt}, ${input.endsAt}, ${input.status}::public.slot_status)
        RETURNING id::text
      `;
      await this.audit(tx, actorUserId, "APPOINTMENT_SLOT_CREATED", created[0].id, input);
      return created;
    });
    return { created: true, ...(await this.getSlot(rows[0].id)).item };
  }

  async previewWeekly(body: unknown) {
    const input = this.readWeeklyInput(body);
    const defaults = await this.getWeeklyDefaults(input.doctorId);
    const slots = this.generateWeeklySlots(input, defaults.consultationType, defaults.clinicId);
    const overlaps = await this.findOverlaps(input.doctorId, slots);
    return {
      total: slots.length,
      consultationType: defaults.consultationType,
      clinicName: defaults.clinicName,
      timeZone: "Asia/Yangon",
      items: slots.map((slot) => ({ ...slot, conflict: overlaps.some((overlap) => slot.startsAt < overlap.endsAt && slot.endsAt > overlap.startsAt) })),
    };
  }

  async createWeekly(actorUserId: string, body: unknown) {
    const input = this.readWeeklyInput(body);
    const defaults = await this.getWeeklyDefaults(input.doctorId);
    const slots = this.generateWeeklySlots(input, defaults.consultationType, defaults.clinicId);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockDoctorRow(tx, input.doctorId);
      await this.assertDoctorCanOffer({ doctorId: input.doctorId, consultationType: defaults.consultationType, clinicId: defaults.clinicId, startsAt: slots[0].startsAt, endsAt: slots[0].endsAt, status: "OPEN" }, tx);
      const overlaps = await this.findOverlaps(input.doctorId, slots, tx);
      if (overlaps.length) throw new ConflictException({ code: "WEEKLY_TIMESLOT_CONFLICT", conflicts: overlaps.map((item) => item.startsAt.toISOString()) });
      const values = slots.map((slot) => Prisma.sql`(
        ${input.doctorId}::uuid,
        ${defaults.consultationType}::public.consultation_type,
        ${defaults.clinicId}::uuid,
        ${slot.startsAt}, ${slot.endsAt}, 'OPEN'::public.slot_status
      )`);
      const created = await tx.$queryRaw<Array<{ id: string; startsAt: Date; endsAt: Date }>>(Prisma.sql`
        INSERT INTO public.appointment_slots (doctor_user_id, consultation_type, clinic_id, starts_at, ends_at, status)
        VALUES ${Prisma.join(values)}
        RETURNING id::text, starts_at AS "startsAt", ends_at AS "endsAt"
      `);
      await tx.$executeRaw`
        INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
        VALUES (${actorUserId}::uuid, 'APPOINTMENT_SLOTS_WEEKLY_CREATED', 'DOCTOR', ${input.doctorId}::uuid,
          ${JSON.stringify({ count: created.length, consultationType: defaults.consultationType, clinicId: defaults.clinicId, startDate: input.startDate, endDate: input.endDate, weekdays: input.weekdays, startTime: input.startTime, endTime: input.endTime, slotMinutes: input.slotMinutes })}::jsonb)
      `;
      return created;
    });
    return { created: true, total: result.length, items: result.map((slot) => ({ id: slot.id, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() })) };
  }

  private readWeeklyInput(value: unknown): WeeklyScheduleInput {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    const body = value as Record<string, unknown>;
    if (typeof body.doctorId !== "string" || !UUID.test(body.doctorId)) throw new BadRequestException({ code: "INVALID_DOCTOR_ID" });
    const startDate = this.readLocalDate(body.startDate);
    const endDate = this.readLocalDate(body.endDate);
    if (!startDate || !endDate || endDate < startDate) throw new BadRequestException({ code: "INVALID_WEEKLY_DATE_RANGE" });
    const totalDays = Math.round((this.dateNumber(endDate) - this.dateNumber(startDate)) / 86400000) + 1;
    if (totalDays > 90) throw new BadRequestException({ code: "WEEKLY_DATE_RANGE_TOO_LONG" });
    const weekdays = Array.isArray(body.weekdays) ? body.weekdays : [];
    if (weekdays.length === 0 || weekdays.length > 7 || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(weekdays).size !== weekdays.length) {
      throw new BadRequestException({ code: "INVALID_WEEKLY_DAYS" });
    }
    if (typeof body.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime) ||
        typeof body.endTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.endTime) || body.endTime <= body.startTime) {
      throw new BadRequestException({ code: "INVALID_WEEKLY_HOURS" });
    }
    if (![15, 30, 45, 60].includes(Number(body.slotMinutes))) throw new BadRequestException({ code: "INVALID_SLOT_DURATION" });
    return { doctorId: body.doctorId, startDate, endDate, weekdays: weekdays as number[], startTime: body.startTime, endTime: body.endTime, slotMinutes: Number(body.slotMinutes) };
  }

  private readLocalDate(value: unknown): string | null {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
  }

  private dateNumber(value: string) { return new Date(`${value}T00:00:00.000Z`).getTime(); }

  private generateWeeklySlots(input: WeeklyScheduleInput, consultationType: ConsultationTypeValue, clinicId: string | null) {
    const slots: Array<{ startsAt: Date; endsAt: Date }> = [];
    const cursor = new Date(`${input.startDate}T00:00:00.000Z`);
    const end = this.dateNumber(input.endDate);
    const [startHour, startMinute] = input.startTime.split(":").map(Number);
    const [endHour, endMinute] = input.endTime.split(":").map(Number);
    const startMinuteOfDay = startHour * 60 + startMinute;
    const endMinuteOfDay = endHour * 60 + endMinute;
    while (cursor.getTime() <= end) {
      if (input.weekdays.includes(cursor.getUTCDay())) {
        for (let minute = startMinuteOfDay; minute + input.slotMinutes <= endMinuteOfDay; minute += input.slotMinutes) {
          const date = cursor.toISOString().slice(0, 10);
          const hour = String(Math.floor(minute / 60)).padStart(2, "0");
          const mins = String(minute % 60).padStart(2, "0");
          const startsAt = new Date(`${date}T${hour}:${mins}:00+06:30`);
          const endsAt = new Date(startsAt.getTime() + input.slotMinutes * 60000);
          if (startsAt <= new Date()) throw new BadRequestException({ code: "WEEKLY_SLOT_NOT_IN_FUTURE", startsAt: startsAt.toISOString() });
          slots.push({ startsAt, endsAt });
          if (slots.length > 500) throw new BadRequestException({ code: "WEEKLY_SLOT_LIMIT_EXCEEDED", max: 500 });
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (slots.length === 0) throw new BadRequestException({ code: "WEEKLY_SCHEDULE_HAS_NO_SLOTS" });
    if (consultationType === "IN_PERSON" && !clinicId) throw new BadRequestException({ code: "DOCTOR_HAS_NO_ACTIVE_PRIMARY_CLINIC" });
    return slots;
  }

  private async getWeeklyDefaults(doctorId: string) {
    const services = await this.prisma.doctorService.findMany({
      where: { doctorUserId: doctorId, isActive: true, doctor: { verificationStatus: "VERIFIED", appUser: { status: "ACTIVE" } } },
      select: { consultationType: true },
    });
    if (services.length === 0) throw new NotFoundException({ code: "ACTIVE_VERIFIED_DOCTOR_NOT_FOUND" });
    const clinics = await this.prisma.$queryRaw<Array<{ clinicId: string; name: string }>>`
      SELECT c.id::text AS "clinicId", c.name FROM public.doctor_clinics dc
        JOIN public.clinics c ON c.id = dc.clinic_id AND c.is_active = true
       WHERE dc.doctor_user_id = ${doctorId}::uuid ORDER BY dc.is_primary DESC, c.name LIMIT 1
    `;
    const hasInPerson = services.some((service) => service.consultationType === "IN_PERSON");
    const hasOnline = services.some((service) => service.consultationType === "ONLINE");
    if (hasInPerson && clinics[0]) return { consultationType: "IN_PERSON" as const, clinicId: clinics[0].clinicId, clinicName: clinics[0].name };
    if (hasOnline) return { consultationType: "ONLINE" as const, clinicId: null, clinicName: null };
    throw new BadRequestException({ code: "DOCTOR_HAS_NO_ACTIVE_PRIMARY_CLINIC" });
  }

  private async findOverlaps(doctorId: string, slots: Array<{ startsAt: Date; endsAt: Date }>, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const first = slots[0].startsAt;
    const last = slots[slots.length - 1].endsAt;
    const existing = await client.$queryRaw<Array<{ startsAt: Date; endsAt: Date }>>`
      SELECT starts_at AS "startsAt", ends_at AS "endsAt" FROM public.appointment_slots
       WHERE doctor_user_id = ${doctorId}::uuid AND starts_at < ${last} AND ends_at > ${first}
    `;
    return existing.filter((candidate) => slots.some((slot) => slot.startsAt < candidate.endsAt && slot.endsAt > candidate.startsAt));
  }

  async updateSlot(actorUserId: string, slotId: string, body: unknown) {
    const input = this.readInput(body, false);
    await this.assertDoctorCanOffer(input);
    const rows = await this.prisma.$transaction(async (tx) => {
      await this.lockSlotRow(tx, slotId);
      await this.lockDoctorRow(tx, input.doctorId);
      await this.assertNoOverlap(input, slotId, tx);
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE public.appointment_slots
           SET doctor_user_id = ${input.doctorId}::uuid,
               consultation_type = ${input.consultationType}::public.consultation_type,
               clinic_id = ${input.clinicId}::uuid,
               starts_at = ${input.startsAt}, ends_at = ${input.endsAt}, status = ${input.status}::public.slot_status
         WHERE id = ${slotId}::uuid AND status IN ('OPEN'::public.slot_status, 'BLOCKED'::public.slot_status)
        RETURNING id::text
      `;
      if (updated.length === 0) throw new ConflictException({ code: "APPOINTMENT_SLOT_NO_LONGER_EDITABLE" });
      await this.audit(tx, actorUserId, "APPOINTMENT_SLOT_UPDATED", slotId, input);
      return updated;
    });
    return { updated: true, ...(await this.getSlot(rows[0].id)).item };
  }

  async deleteSlot(actorUserId: string, slotId: string) {
    await this.prisma.$transaction(async (tx) => {
      const slot = await this.lockSlotRow(tx, slotId);
      await this.lockDoctorRow(tx, slot.doctorId);
      const booked = await tx.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM public.appointments WHERE slot_id = ${slotId}::uuid) AS exists
      `;
      if (booked[0]?.exists) throw new ConflictException({ code: "APPOINTMENT_SLOT_HAS_APPOINTMENT" });
      const deleted = await tx.$queryRaw<Array<{ id: string }>>`
        DELETE FROM public.appointment_slots
         WHERE id = ${slotId}::uuid AND status IN ('OPEN'::public.slot_status, 'BLOCKED'::public.slot_status)
         RETURNING id::text
      `;
      if (deleted.length === 0) throw new ConflictException({ code: "APPOINTMENT_SLOT_NO_LONGER_EDITABLE" });
      await this.audit(tx, actorUserId, "APPOINTMENT_SLOT_DELETED", slotId, {});
    });
    return { deleted: true };
  }

  private readFilters(filters: { doctorId?: string; from?: string; until?: string }) {
    const doctorId = filters.doctorId?.trim() || null;
    if (doctorId && !UUID.test(doctorId)) throw new BadRequestException({ code: "INVALID_DOCTOR_ID" });
    const from = filters.from?.trim() || null;
    const until = filters.until?.trim() || null;
    if ((from && !this.parseDate(from)) || (until && !this.parseDate(until))) throw new BadRequestException({ code: "INVALID_DATE_FILTER" });
    if (from && until && new Date(until) <= new Date(from)) throw new BadRequestException({ code: "INVALID_DATE_RANGE" });
    return { doctorId, from: from ? new Date(from) : null, until: until ? new Date(until) : null };
  }

  private readInput(value: unknown, isCreate: boolean): SlotInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    const body = value as Record<string, unknown>;
    if (typeof body.doctorId !== "string" || !UUID.test(body.doctorId)) throw new BadRequestException({ code: "INVALID_DOCTOR_ID" });
    if (body.consultationType !== "ONLINE" && body.consultationType !== "IN_PERSON") throw new BadRequestException({ code: "INVALID_CONSULTATION_TYPE" });
    const consultationType = body.consultationType as ConsultationTypeValue;
    const clinicId = body.clinicId === null || body.clinicId === "" || body.clinicId === undefined ? null : body.clinicId;
    if (clinicId !== null && (typeof clinicId !== "string" || !UUID.test(clinicId))) throw new BadRequestException({ code: "INVALID_CLINIC_ID" });
    if ((consultationType === "ONLINE" && clinicId !== null) || (consultationType === "IN_PERSON" && clinicId === null)) {
      throw new BadRequestException({ code: "CLINIC_CONSULTATION_TYPE_MISMATCH" });
    }
    const startsAt = this.parseDate(body.startsAt);
    const endsAt = this.parseDate(body.endsAt);
    if (!startsAt || !endsAt || endsAt <= startsAt) throw new BadRequestException({ code: "INVALID_SLOT_TIME" });
    const duration = (endsAt.getTime() - startsAt.getTime()) / 60000;
    if (duration < 5 || duration > 240) throw new BadRequestException({ code: "INVALID_SLOT_DURATION" });
    if (startsAt <= new Date()) throw new BadRequestException({ code: "SLOT_MUST_BE_IN_FUTURE" });
    if (startsAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) throw new BadRequestException({ code: "SLOT_TOO_FAR_IN_FUTURE" });
    const status = isCreate ? "OPEN" : body.status;
    if (status !== "OPEN" && status !== "BLOCKED") throw new BadRequestException({ code: "INVALID_SLOT_STATUS" });
    return { doctorId: body.doctorId, consultationType, clinicId: clinicId as string | null, startsAt, endsAt, status: status as SlotStatusValue };
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async assertDoctorCanOffer(input: SlotInput, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const service = await client.doctorService.findFirst({
      where: { doctorUserId: input.doctorId, consultationType: input.consultationType, isActive: true,
        doctor: { verificationStatus: "VERIFIED", appUser: { status: "ACTIVE" } } },
      select: { id: true },
    });
    if (!service) throw new BadRequestException({ code: "DOCTOR_SERVICE_NOT_AVAILABLE" });
    if (input.consultationType === "IN_PERSON") {
      const assignment = await client.$queryRaw<Array<{ allowed: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM public.doctor_clinics dc
          JOIN public.clinics c ON c.id = dc.clinic_id AND c.is_active = true
          WHERE dc.doctor_user_id = ${input.doctorId}::uuid AND dc.clinic_id = ${input.clinicId}::uuid) AS allowed
      `;
      if (!assignment[0]?.allowed) throw new BadRequestException({ code: "DOCTOR_NOT_ASSIGNED_TO_CLINIC" });
    }
  }

  private async assertNoOverlap(input: SlotInput, exceptSlotId?: string, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const ignoredSlotId = exceptSlotId ?? null;
    const overlap = await client.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM public.appointment_slots
         WHERE doctor_user_id = ${input.doctorId}::uuid
           AND starts_at < ${input.endsAt} AND ends_at > ${input.startsAt}
           AND (${ignoredSlotId}::uuid IS NULL OR id <> ${ignoredSlotId}::uuid)
      ) AS exists
    `;
    if (overlap[0]?.exists) throw new ConflictException({ code: "APPOINTMENT_SLOT_OVERLAP" });
  }

  private async lockDoctorRow(tx: Prisma.TransactionClient, doctorId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM public.app_users WHERE id = ${doctorId}::uuid FOR UPDATE
    `;
    if (!rows[0]) throw new NotFoundException({ code: "DOCTOR_NOT_FOUND" });
  }

  private async lockSlotRow(tx: Prisma.TransactionClient, slotId: string) {
    if (!UUID.test(slotId)) throw new BadRequestException({ code: "INVALID_SLOT_ID" });
    const rows = await tx.$queryRaw<Array<{ status: string; doctorId: string }>>`
      SELECT status::text, doctor_user_id::text AS "doctorId"
        FROM public.appointment_slots WHERE id = ${slotId}::uuid FOR UPDATE
    `;
    if (!rows[0]) throw new NotFoundException({ code: "APPOINTMENT_SLOT_NOT_FOUND" });
    if (rows[0].status === "BOOKED") throw new ConflictException({ code: "BOOKED_SLOT_NOT_EDITABLE" });
    return rows[0];
  }

  private async audit(tx: Prisma.TransactionClient, actorUserId: string, action: string, slotId: string, input: Partial<SlotInput>) {
    const metadata = {
      doctorId: input.doctorId,
      consultationType: input.consultationType,
      clinicId: input.clinicId,
      startsAt: input.startsAt?.toISOString(),
      endsAt: input.endsAt?.toISOString(),
      status: input.status,
    };
    await tx.$executeRaw`
      INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
      VALUES (${actorUserId}::uuid, ${action}, 'APPOINTMENT_SLOT', ${slotId}::uuid, ${JSON.stringify(metadata)}::jsonb)
    `;
  }
}
