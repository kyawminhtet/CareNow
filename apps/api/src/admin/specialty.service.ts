import { BadRequestException, ConflictException, Injectable, NotFoundException, PayloadTooLargeException, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = "specialty-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const FORMATS = {
  "image/jpeg": { extension: "jpg", signature: (bytes: Buffer) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", signature: (bytes: Buffer) => bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { extension: "webp", signature: (bytes: Buffer) => bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" },
} as const;

@Injectable()
export class SpecialtyService {
  private readonly storage: SupabaseClient | null;
  constructor(private readonly prisma: PrismaService) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.storage = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  async publicList() {
    const rows = await this.prisma.specialty.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, photoKey: true } });
    return { items: rows.map(({ photoKey, ...row }) => ({ ...row, photoUrl: photoKey ? this.publicUrl(photoKey) : null })) };
  }

  async adminList() {
    const [specialties, usage] = await Promise.all([
      this.prisma.specialty.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
      this.prisma.$queryRaw<Array<{ specialty: string; doctorCount: number }>>`
        SELECT dp.specialty, count(*)::int AS "doctorCount" FROM public.doctor_profiles dp GROUP BY dp.specialty`,
    ]);
    const counts = new Map(usage.map((row) => [row.specialty.toLocaleLowerCase(), row.doctorCount]));
    return { items: specialties.map(({ photoKey, ...specialty }) => ({ ...specialty, photoUrl: photoKey ? this.publicUrl(photoKey) : null, doctorCount: counts.get(specialty.name.toLocaleLowerCase()) ?? 0 })) };
  }

  async create(actorId: string, body: unknown) {
    const name = this.readName(body);
    await this.assertUniqueName(name);
    try {
      const specialty = await this.prisma.specialty.create({ data: { name } });
      await this.audit(actorId, "SPECIALTY_CREATED", specialty.id, { name });
      return { created: true, item: specialty };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException({ code: "SPECIALTY_ALREADY_EXISTS" });
      throw error;
    }
  }

  async update(actorId: string, id: string, body: unknown) {
    this.validateId(id);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    const input = body as Record<string, unknown>;
    const current = await this.prisma.specialty.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: "SPECIALTY_NOT_FOUND" });
    const name = input.name === undefined ? current.name : this.readName(input);
    const isActive = input.isActive === undefined ? current.isActive : input.isActive;
    if (typeof isActive !== "boolean") throw new BadRequestException({ code: "INVALID_SPECIALTY_STATUS" });
    await this.assertUniqueName(name, id);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.specialty.update({ where: { id }, data: { name, isActive, updatedAt: new Date() } });
        if (name !== current.name) {
          await tx.doctorProfile.updateMany({ where: { specialty: current.name }, data: { specialty: name, updatedAt: new Date() } });
          await tx.doctorService.updateMany({ where: { specialty: current.name }, data: { specialty: name } });
        }
        await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
          VALUES (${actorId}::uuid, 'SPECIALTY_UPDATED', 'SPECIALTY', ${id}::uuid, ${JSON.stringify({ name, isActive })}::jsonb)`;
        return row;
      });
      return { updated: true, item: updated };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException({ code: "SPECIALTY_ALREADY_EXISTS" });
      throw error;
    }
  }

  async remove(actorId: string, id: string) {
    this.validateId(id);
    const current = await this.prisma.specialty.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: "SPECIALTY_NOT_FOUND" });
    const used = await this.prisma.doctorProfile.count({ where: { specialty: { equals: current.name, mode: "insensitive" } } });
    if (used > 0) throw new ConflictException({ code: "SPECIALTY_IN_USE", parameters: { doctorCount: used } });
    await this.prisma.$transaction(async (tx) => {
      await tx.specialty.delete({ where: { id } });
      await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
        VALUES (${actorId}::uuid, 'SPECIALTY_DELETED', 'SPECIALTY', ${id}::uuid, ${JSON.stringify({ name: current.name })}::jsonb)`;
    });
    if (current.photoKey && this.storage) await this.storage.storage.from(BUCKET).remove([current.photoKey]);
    return { deleted: true };
  }

  async uploadPhoto(actorId: string, id: string, request: FastifyRequest) {
    this.validateId(id);
    if (!this.storage) throw new ServiceUnavailableException({ code: "SPECIALTY_PHOTO_STORAGE_NOT_CONFIGURED" });
    const current = await this.prisma.specialty.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: "SPECIALTY_NOT_FOUND" });
    const part = await request.file();
    if (!part || part.fieldname !== "photo") throw new UnprocessableEntityException({ code: "SPECIALTY_PHOTO_REQUIRED" });
    const format = FORMATS[part.mimetype as keyof typeof FORMATS];
    if (!format) throw new UnprocessableEntityException({ code: "INVALID_SPECIALTY_PHOTO_TYPE" });
    let bytes: Buffer;
    try { bytes = await part.toBuffer(); } catch { throw new PayloadTooLargeException({ code: "SPECIALTY_PHOTO_TOO_LARGE" }); }
    if (part.file.truncated || bytes.byteLength > MAX_PHOTO_BYTES) throw new PayloadTooLargeException({ code: "SPECIALTY_PHOTO_TOO_LARGE" });
    if (!format.signature(bytes)) throw new UnprocessableEntityException({ code: "INVALID_SPECIALTY_PHOTO_CONTENT" });
    await this.ensureBucket();
    const key = `${id}/${randomUUID()}.${format.extension}`;
    const { error } = await this.storage.storage.from(BUCKET).upload(key, bytes, { contentType: part.mimetype, upsert: false });
    if (error) throw new ServiceUnavailableException({ code: "SPECIALTY_PHOTO_UPLOAD_FAILED" });
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.specialty.update({ where: { id }, data: { photoKey: key, updatedAt: new Date() } });
        await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
          VALUES (${actorId}::uuid, 'SPECIALTY_PHOTO_UPDATED', 'SPECIALTY', ${id}::uuid, '{}'::jsonb)`;
        return row;
      });
      if (current.photoKey) await this.storage.storage.from(BUCKET).remove([current.photoKey]);
      return { photoUrl: this.publicUrl(updated.photoKey!) };
    } catch (error) {
      await this.storage.storage.from(BUCKET).remove([key]);
      throw error;
    }
  }

  async removePhoto(actorId: string, id: string) {
    this.validateId(id);
    if (!this.storage) throw new ServiceUnavailableException({ code: "SPECIALTY_PHOTO_STORAGE_NOT_CONFIGURED" });
    const current = await this.prisma.specialty.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: "SPECIALTY_NOT_FOUND" });
    await this.prisma.$transaction(async (tx) => {
      await tx.specialty.update({ where: { id }, data: { photoKey: null, updatedAt: new Date() } });
      await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
        VALUES (${actorId}::uuid, 'SPECIALTY_PHOTO_REMOVED', 'SPECIALTY', ${id}::uuid, '{}'::jsonb)`;
    });
    if (current.photoKey) await this.storage.storage.from(BUCKET).remove([current.photoKey]);
    return { photoUrl: null };
  }

  async resolveActiveName(value: string) {
    if (!UUID.test(value)) throw new BadRequestException({ code: "INVALID_SPECIALTY" });
    const specialty = await this.prisma.specialty.findFirst({ where: { id: value, isActive: true }, select: { name: true } });
    if (!specialty) throw new BadRequestException({ code: "INVALID_OR_INACTIVE_SPECIALTY" });
    return specialty.name;
  }

  private readName(body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    const name = (body as Record<string, unknown>).name;
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) throw new BadRequestException({ code: "INVALID_SPECIALTY_NAME" });
    return name.trim().replace(/\s+/g, " ");
  }

  private async assertUniqueName(name: string, exceptId?: string) {
    const existing = await this.prisma.specialty.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (existing) throw new ConflictException({ code: "SPECIALTY_ALREADY_EXISTS" });
  }

  private validateId(id: string) {
    if (!UUID.test(id)) throw new BadRequestException({ code: "INVALID_SPECIALTY_ID" });
  }

  private async audit(actorId: string, action: string, id: string, metadata: object) {
    await this.prisma.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
      VALUES (${actorId}::uuid, ${action}, 'SPECIALTY', ${id}::uuid, ${JSON.stringify(metadata)}::jsonb)`;
  }

  private publicUrl(key: string) {
    return this.storage?.storage.from(BUCKET).getPublicUrl(key).data.publicUrl ?? null;
  }

  private async ensureBucket() {
    if (!this.storage) throw new ServiceUnavailableException({ code: "SPECIALTY_PHOTO_STORAGE_NOT_CONFIGURED" });
    const { data, error } = await this.storage.storage.getBucket(BUCKET);
    if (!error && data) {
      if (!data.public) {
        const { error: updateError } = await this.storage.storage.updateBucket(BUCKET, { public: true, fileSizeLimit: MAX_PHOTO_BYTES, allowedMimeTypes: Object.keys(FORMATS) });
        if (updateError) throw new ServiceUnavailableException({ code: "SPECIALTY_PHOTO_BUCKET_SETUP_FAILED" });
      }
      return;
    }
    const { error: createError } = await this.storage.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_PHOTO_BYTES, allowedMimeTypes: Object.keys(FORMATS) });
    if (createError) throw new ServiceUnavailableException({ code: "SPECIALTY_PHOTO_BUCKET_SETUP_FAILED" });
  }
}
