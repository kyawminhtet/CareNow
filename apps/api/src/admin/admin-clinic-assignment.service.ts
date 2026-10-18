import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AdminClinicAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [doctors, clinics, assignments] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; name: string; specialty: string }>>`
        SELECT au.id::text AS id, au.display_name AS name, dp.specialty
          FROM public.doctor_profiles dp
          JOIN public.app_users au ON au.id = dp.app_user_id
          JOIN public.doctor_services ds ON ds.doctor_user_id = dp.app_user_id
            AND ds.consultation_type = 'IN_PERSON'::public.consultation_type AND ds.is_active = true
         WHERE au.status = 'ACTIVE'
         GROUP BY au.id, au.display_name, dp.specialty
         ORDER BY au.display_name
      `,
      this.prisma.$queryRaw<Array<{ id: string; name: string; address: string; city: string; region: string }>>`
        SELECT id::text, name, address, city, region FROM public.clinics
         WHERE is_active = true ORDER BY name
      `,
      this.prisma.$queryRaw<Array<{ doctorId: string; doctorName: string; specialty: string; clinicId: string; clinicName: string; address: string; city: string; region: string; isPrimary: boolean; assignedAt: Date }>>`
        SELECT dc.doctor_user_id::text AS "doctorId", au.display_name AS "doctorName", dp.specialty,
               c.id::text AS "clinicId", c.name AS "clinicName", c.address, c.city, c.region,
               dc.is_primary AS "isPrimary", dc.created_at AS "assignedAt"
          FROM public.doctor_clinics dc
          JOIN public.app_users au ON au.id = dc.doctor_user_id
          JOIN public.doctor_profiles dp ON dp.app_user_id = dc.doctor_user_id
          JOIN public.clinics c ON c.id = dc.clinic_id
         ORDER BY au.display_name, dc.is_primary DESC, c.name
      `,
    ]);
    return { doctors, clinics, assignments: assignments.map((item) => ({ ...item, assignedAt: item.assignedAt.toISOString() })) };
  }

  async create(actorId: string, body: unknown) {
    const { doctorId, clinicId, isPrimary } = this.readBody(body);
    await this.assertDoctorAndClinic(doctorId, clinicId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockDoctor(tx, doctorId);
      if (isPrimary) await this.clearPrimary(tx, doctorId);
      try {
        await tx.$executeRaw`INSERT INTO public.doctor_clinics (doctor_user_id, clinic_id, is_primary)
          VALUES (${doctorId}::uuid, ${clinicId}::uuid, ${isPrimary})`;
      } catch (error) {
        if (this.isUniqueViolation(error)) throw new ConflictException({ code: "DOCTOR_CLINIC_ALREADY_ASSIGNED" });
        throw error;
      }
      await this.audit(tx, actorId, "DOCTOR_CLINIC_ASSIGNED", doctorId, clinicId, { isPrimary });
      return { created: true };
    });
  }

  async update(actorId: string, doctorId: string, clinicId: string, body: unknown) {
    this.validateIds(doctorId, clinicId);
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).isPrimary !== "boolean") {
      throw new BadRequestException({ code: "INVALID_PRIMARY_CLINIC_VALUE" });
    }
    const isPrimary = (body as { isPrimary: boolean }).isPrimary;
    return this.prisma.$transaction(async (tx) => {
      await this.lockDoctor(tx, doctorId);
      const exists = await tx.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (
        SELECT 1 FROM public.doctor_clinics WHERE doctor_user_id = ${doctorId}::uuid AND clinic_id = ${clinicId}::uuid
      ) AS exists`;
      if (!exists[0]?.exists) throw new NotFoundException({ code: "DOCTOR_CLINIC_ASSIGNMENT_NOT_FOUND" });
      if (isPrimary) await this.clearPrimary(tx, doctorId);
      await tx.$executeRaw`UPDATE public.doctor_clinics SET is_primary = ${isPrimary}
        WHERE doctor_user_id = ${doctorId}::uuid AND clinic_id = ${clinicId}::uuid`;
      await this.audit(tx, actorId, "DOCTOR_CLINIC_UPDATED", doctorId, clinicId, { isPrimary });
      return { updated: true };
    });
  }

  async delete(actorId: string, doctorId: string, clinicId: string) {
    this.validateIds(doctorId, clinicId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockDoctor(tx, doctorId);
      const exists = await tx.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (
        SELECT 1 FROM public.doctor_clinics WHERE doctor_user_id = ${doctorId}::uuid AND clinic_id = ${clinicId}::uuid
      ) AS exists`;
      if (!exists[0]?.exists) throw new NotFoundException({ code: "DOCTOR_CLINIC_ASSIGNMENT_NOT_FOUND" });
      const references = await tx.$queryRaw<Array<{ hasReferences: boolean }>>`SELECT (
        EXISTS (SELECT 1 FROM public.appointment_slots WHERE doctor_user_id = ${doctorId}::uuid AND clinic_id = ${clinicId}::uuid)
        OR EXISTS (SELECT 1 FROM public.availability_rules WHERE doctor_user_id = ${doctorId}::uuid AND clinic_id = ${clinicId}::uuid)
      ) AS "hasReferences"`;
      if (references[0]?.hasReferences) throw new ConflictException({ code: "DOCTOR_CLINIC_HAS_SCHEDULE" });
      await tx.$executeRaw`DELETE FROM public.doctor_clinics WHERE doctor_user_id = ${doctorId}::uuid AND clinic_id = ${clinicId}::uuid`;
      await this.audit(tx, actorId, "DOCTOR_CLINIC_REMOVED", doctorId, clinicId, {});
      return { deleted: true };
    });
  }

  private readBody(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    const body = value as Record<string, unknown>;
    if (typeof body.doctorId !== "string" || typeof body.clinicId !== "string") throw new BadRequestException({ code: "INVALID_DOCTOR_OR_CLINIC_ID" });
    this.validateIds(body.doctorId, body.clinicId);
    if (body.isPrimary !== undefined && typeof body.isPrimary !== "boolean") throw new BadRequestException({ code: "INVALID_PRIMARY_CLINIC_VALUE" });
    return { doctorId: body.doctorId, clinicId: body.clinicId, isPrimary: body.isPrimary === true };
  }

  private validateIds(doctorId: string, clinicId: string) {
    if (!UUID.test(doctorId)) throw new BadRequestException({ code: "INVALID_DOCTOR_ID" });
    if (!UUID.test(clinicId)) throw new BadRequestException({ code: "INVALID_CLINIC_ID" });
  }

  private async assertDoctorAndClinic(doctorId: string, clinicId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ doctorExists: boolean; clinicExists: boolean }>>`SELECT
      EXISTS (SELECT 1 FROM public.doctor_profiles dp JOIN public.app_users au ON au.id = dp.app_user_id
        JOIN public.doctor_services ds ON ds.doctor_user_id = dp.app_user_id
         AND ds.consultation_type = 'IN_PERSON'::public.consultation_type AND ds.is_active = true
        WHERE dp.app_user_id = ${doctorId}::uuid AND au.status = 'ACTIVE') AS "doctorExists",
      EXISTS (SELECT 1 FROM public.clinics WHERE id = ${clinicId}::uuid AND is_active = true) AS "clinicExists"`;
    if (!rows[0]?.doctorExists) throw new NotFoundException({ code: "ACTIVE_IN_PERSON_DOCTOR_NOT_FOUND" });
    if (!rows[0]?.clinicExists) throw new NotFoundException({ code: "ACTIVE_CLINIC_NOT_FOUND" });
  }

  private async lockDoctor(tx: Prisma.TransactionClient, doctorId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id::text FROM public.app_users WHERE id = ${doctorId}::uuid FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException({ code: "DOCTOR_NOT_FOUND" });
  }

  private async clearPrimary(tx: Prisma.TransactionClient, doctorId: string) {
    await tx.$executeRaw`UPDATE public.doctor_clinics SET is_primary = false WHERE doctor_user_id = ${doctorId}::uuid AND is_primary = true`;
  }

  private async audit(tx: Prisma.TransactionClient, actorId: string, action: string, doctorId: string, clinicId: string, metadata: object) {
    await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
      VALUES (${actorId}::uuid, ${action}, 'DOCTOR', ${doctorId}::uuid, ${JSON.stringify({ clinicId, ...metadata })}::jsonb)`;
  }

  private isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || (error.code === "P2010" && String(error.meta?.code ?? "") === "23505"));
  }
}
