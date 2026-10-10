import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type ConsultationTypeValue = "ONLINE" | "IN_PERSON";
type SlotStatusValue = "OPEN" | "BLOCKED";
type SlotInput = { doctorId: string; consultationType: ConsultationTypeValue; clinicId: string | null; startsAt: Date; endsAt: Date; status: SlotStatusValue };
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

    const clinics = await this.prisma.$queryRaw<Array<{ doctorId: string; clinicId: string; name: string }>>`
      SELECT dc.doctor_user_id::text AS "doctorId", c.id::text AS "clinicId", c.name
        FROM public.doctor_clinics dc
        JOIN public.clinics c ON c.id = dc.clinic_id AND c.is_active = true
        JOIN public.doctor_profiles dp ON dp.app_user_id = dc.doctor_user_id AND dp.verification_status = 'VERIFIED'
        JOIN public.app_users au ON au.id = dp.app_user_id AND au.status = 'ACTIVE'
       ORDER BY c.name
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

  private async assertDoctorCanOffer(input: SlotInput) {
    const service = await this.prisma.doctorService.findFirst({
      where: { doctorUserId: input.doctorId, consultationType: input.consultationType, isActive: true,
        doctor: { verificationStatus: "VERIFIED", appUser: { status: "ACTIVE" } } },
      select: { id: true },
    });
    if (!service) throw new BadRequestException({ code: "DOCTOR_SERVICE_NOT_AVAILABLE" });
    if (input.consultationType === "IN_PERSON") {
      const assignment = await this.prisma.$queryRaw<Array<{ allowed: boolean }>>`
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
