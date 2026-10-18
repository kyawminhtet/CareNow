import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ClinicInput = { name: string; address: string; city: string };

@Injectable()
export class AdminClinicService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; address: string; city: string; region: string; countryCode: string; timeZone: string; isActive: boolean; assignedDoctors: number; createdAt: Date; updatedAt: Date }>>`
      SELECT c.id::text, c.name, c.address, c.city, c.region, c.country_code AS "countryCode",
             c.time_zone AS "timeZone", c.is_active AS "isActive", c.created_at AS "createdAt", c.updated_at AS "updatedAt",
             count(dc.doctor_user_id)::int AS "assignedDoctors"
        FROM public.clinics c LEFT JOIN public.doctor_clinics dc ON dc.clinic_id = c.id
       GROUP BY c.id ORDER BY c.is_active DESC, c.name
    `;
    return { items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })) };
  }

  async create(actorId: string, value: unknown) {
    const input = this.readInput(value);
    const rows = await this.prisma.$transaction(async (tx) => {
      const created = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO public.clinics (name, address, city, region, country_code, time_zone)
        VALUES (${input.name}, ${input.address}, ${input.city}, ${input.city}, 'MM', 'Asia/Yangon')
        RETURNING id::text
      `;
      await this.audit(tx, actorId, "CLINIC_CREATED", created[0].id, input);
      return created;
    });
    return { created: true, id: rows[0].id };
  }

  async update(actorId: string, clinicId: string, value: unknown) {
    this.validateId(clinicId);
    const input = this.readInput(value);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE public.clinics SET name = ${input.name}, address = ${input.address}, city = ${input.city}, updated_at = now()
         WHERE id = ${clinicId}::uuid RETURNING id::text
      `;
      if (!updated[0]) throw new NotFoundException({ code: "CLINIC_NOT_FOUND" });
      await this.audit(tx, actorId, "CLINIC_UPDATED", clinicId, input);
      return { updated: true };
    });
  }

  async deactivate(actorId: string, clinicId: string) {
    this.validateId(clinicId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE public.clinics SET is_active = false, updated_at = now()
         WHERE id = ${clinicId}::uuid AND is_active = true RETURNING id::text
      `;
      if (!updated[0]) {
        const exists = await tx.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM public.clinics WHERE id = ${clinicId}::uuid) AS exists`;
        if (!exists[0]?.exists) throw new NotFoundException({ code: "CLINIC_NOT_FOUND" });
        return { deactivated: false };
      }
      await this.audit(tx, actorId, "CLINIC_DEACTIVATED", clinicId, {});
      return { deactivated: true };
    });
  }

  async activate(actorId: string, clinicId: string) {
    this.validateId(clinicId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE public.clinics SET is_active = true, updated_at = now()
         WHERE id = ${clinicId}::uuid AND is_active = false RETURNING id::text
      `;
      if (!updated[0]) {
        const exists = await tx.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM public.clinics WHERE id = ${clinicId}::uuid) AS exists`;
        if (!exists[0]?.exists) throw new NotFoundException({ code: "CLINIC_NOT_FOUND" });
        return { activated: false };
      }
      await this.audit(tx, actorId, "CLINIC_ACTIVATED", clinicId, {});
      return { activated: true };
    });
  }

  private readInput(value: unknown): ClinicInput {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    const body = value as Record<string, unknown>;
    const name = this.text(body.name, "name", 120);
    const address = this.text(body.address, "address", 300);
    const city = this.text(body.city, "city", 100);
    return { name, address, city };
  }

  private text(value: unknown, field: string, max: number) {
    if (typeof value !== "string") throw new BadRequestException({ code: `INVALID_CLINIC_${field.toUpperCase()}` });
    const result = value.trim();
    if (!result || result.length > max) throw new BadRequestException({ code: `INVALID_CLINIC_${field.toUpperCase()}` });
    return result;
  }

  private validateId(value: string) {
    if (!UUID.test(value)) throw new BadRequestException({ code: "INVALID_CLINIC_ID" });
  }

  private async audit(tx: Prisma.TransactionClient, actorId: string, action: string, clinicId: string, metadata: object) {
    await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
      VALUES (${actorId}::uuid, ${action}, 'CLINIC', ${clinicId}::uuid, ${JSON.stringify(metadata)}::jsonb)`;
  }
}
