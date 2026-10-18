import { BadRequestException, Injectable, PayloadTooLargeException, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { ConsultationType } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

const BUCKET = "doctor-profile-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const FORMATS = {
  "image/jpeg": { extension: "jpg", signature: (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { extension: "png", signature: (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { extension: "webp", signature: (b: Buffer) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
} as const;
const SERVICE_TYPES = new Set<string>(["ONLINE", "IN_PERSON"]);

@Injectable()
export class DoctorProfileService {
  private readonly storage: SupabaseClient | null;

  constructor(private readonly prisma: PrismaService) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.storage = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  async get(doctorId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ displayName: string; phone: string | null; specialty: string; biography: string; qualifications: string | null; experienceYears: number | null; languages: string[]; services: string[]; licenseNumber: string; licenseRegion: string; licenseExpiry: Date | null; profilePhotoKey: string | null }>>`
      SELECT au.display_name AS "displayName", dp.phone_number AS phone, dp.specialty, dp.biography,
        dp.qualifications, dp.experience_years AS "experienceYears", dp.languages,
        dp.license_number AS "licenseNumber", dp.license_region AS "licenseRegion", dp.license_expiry AS "licenseExpiry",
        dp.profile_photo_key AS "profilePhotoKey",
        COALESCE((SELECT array_agg(ds.consultation_type::text ORDER BY ds.consultation_type::text) FROM public.doctor_services ds WHERE ds.doctor_user_id = dp.app_user_id AND ds.is_active), ARRAY[]::text[]) AS services
      FROM public.app_users au JOIN public.doctor_profiles dp ON dp.app_user_id = au.id WHERE au.id = ${doctorId}::uuid`;
    const doctor = rows[0];
    if (!doctor) throw new BadRequestException({ code: "DOCTOR_PROFILE_NOT_FOUND" });
    const { profilePhotoKey, ...profile } = doctor;
    return { ...profile, licenseExpiry: profile.licenseExpiry?.toISOString().slice(0, 10) ?? "", profilePhotoUrl: profilePhotoKey ? this.publicUrl(profilePhotoKey) : null };
  }

  async updateOwn(doctorId: string, actorUserId: string, body: unknown) {
    const data = this.readSelfProfile(body);
    await this.prisma.$transaction(async (tx) => {
      await tx.doctorProfile.update({ where: { appUserId: doctorId }, data: {
        specialty: data.specialty,
        biography: data.biography,
        qualifications: data.qualifications,
        experienceYears: data.experienceYears,
        languages: data.languages,
        updatedAt: new Date(),
      } });
      await tx.doctorService.updateMany({ where: { doctorUserId: doctorId }, data: { isActive: false } });
      for (const consultationType of data.services) {
        await tx.doctorService.upsert({
          where: { doctorUserId_consultationType: { doctorUserId: doctorId, consultationType } },
          create: { doctorUserId: doctorId, consultationType, specialty: data.specialty, isActive: true },
          update: { specialty: data.specialty, isActive: true },
        });
      }
      await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
        VALUES (${actorUserId}::uuid, 'DOCTOR_PROFILE_SELF_UPDATED', 'DOCTOR', ${doctorId}::uuid, '{}'::jsonb)`;
    });
    return { updated: true };
  }

  async updatePersonal(doctorId: string, body: unknown) {
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    const input = body as Record<string, unknown>;
    const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    if (fullName.length < 2 || fullName.length > 120 || phone.length < 6 || phone.length > 40) {
      throw new BadRequestException({ code: "INVALID_PERSONAL_INFORMATION" });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({ where: { id: doctorId }, data: { displayName: fullName, updatedAt: new Date() } });
      await tx.doctorProfile.update({ where: { appUserId: doctorId }, data: { phoneNumber: phone, updatedAt: new Date() } });
      await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
        VALUES (${doctorId}::uuid, 'DOCTOR_PERSONAL_INFORMATION_UPDATED', 'DOCTOR', ${doctorId}::uuid, '{}'::jsonb)`;
    });
    return { updated: true };
  }

  private readSelfProfile(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    const input = value as Record<string, unknown>;
    const text = (name: string, max: number, required = true) => {
      const raw = input[name];
      if (typeof raw !== "string" || raw.trim().length > max || (required && raw.trim().length === 0)) throw new BadRequestException({ code: "INVALID_PROFILE_FIELD", parameters: { field: name } });
      return raw.trim();
    };
    const experienceYears = Number(input.experienceYears);
    const languages = Array.isArray(input.languages) ? input.languages.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
    const services = Array.isArray(input.services) ? input.services.filter((item): item is ConsultationType => typeof item === "string" && SERVICE_TYPES.has(item)) : [];
    if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 100) throw new BadRequestException({ code: "INVALID_EXPERIENCE" });
    if (!languages.length || languages.length > 12 || languages.some((language) => language.length > 50) || new Set(languages.map((item) => item.toLowerCase())).size !== languages.length) throw new BadRequestException({ code: "INVALID_LANGUAGES" });
    if (!services.length || new Set(services).size !== services.length) throw new BadRequestException({ code: "INVALID_SERVICES" });
    return {
      specialty: text("specialty", 100),
      biography: text("biography", 2000, false), qualifications: text("qualifications", 500),
      experienceYears, languages, services,
    };
  }

  async upload(doctorId: string, request: FastifyRequest, actorUserId = doctorId) {
    if (!this.storage) throw new ServiceUnavailableException({ code: "PROFILE_PHOTO_STORAGE_NOT_CONFIGURED" });
    const part = await request.file();
    if (!part || part.fieldname !== "photo") throw new UnprocessableEntityException({ code: "PROFILE_PHOTO_REQUIRED" });
    const format = FORMATS[part.mimetype as keyof typeof FORMATS];
    if (!format) throw new UnprocessableEntityException({ code: "INVALID_PROFILE_PHOTO_TYPE" });
    let bytes: Buffer;
    try { bytes = await part.toBuffer(); } catch { throw new PayloadTooLargeException({ code: "PROFILE_PHOTO_TOO_LARGE" }); }
    if (part.file.truncated || bytes.byteLength > MAX_BYTES) throw new PayloadTooLargeException({ code: "PROFILE_PHOTO_TOO_LARGE" });
    if (!format.signature(bytes)) throw new UnprocessableEntityException({ code: "INVALID_PROFILE_PHOTO_CONTENT" });

    await this.ensureBucket();
    const key = `${doctorId}/${randomUUID()}.${format.extension}`;
    const { error } = await this.storage.storage.from(BUCKET).upload(key, bytes, { contentType: part.mimetype, upsert: false });
    if (error) throw new ServiceUnavailableException({ code: "PROFILE_PHOTO_UPLOAD_FAILED" });
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        const previous = await tx.$queryRaw<Array<{ previous_key: string | null }>>`
          WITH previous AS (SELECT profile_photo_key FROM public.doctor_profiles WHERE app_user_id = ${doctorId}::uuid),
          updated AS (UPDATE public.doctor_profiles SET profile_photo_key = ${key}, updated_at = now()
            WHERE app_user_id = ${doctorId}::uuid RETURNING app_user_id)
          SELECT previous.profile_photo_key AS previous_key FROM previous JOIN updated ON true`;
        if (previous[0]) await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
          VALUES (${actorUserId}::uuid, ${actorUserId === doctorId ? "DOCTOR_PROFILE_PHOTO_SELF_UPDATED" : "DOCTOR_PROFILE_PHOTO_ADMIN_UPDATED"}, 'DOCTOR', ${doctorId}::uuid, '{}'::jsonb)`;
        return previous;
      });
      if (!rows[0]) throw new BadRequestException({ code: "DOCTOR_PROFILE_NOT_FOUND" });
      const previous = rows[0].previous_key;
      if (previous && previous !== key) await this.storage.storage.from(BUCKET).remove([previous]);
      return { profilePhotoUrl: this.publicUrl(key) };
    } catch (error) {
      await this.storage.storage.from(BUCKET).remove([key]);
      throw error;
    }
  }

  async remove(doctorId: string, actorUserId = doctorId) {
    if (!this.storage) throw new ServiceUnavailableException({ code: "PROFILE_PHOTO_STORAGE_NOT_CONFIGURED" });
    const rows = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.$queryRaw<Array<{ previous_key: string | null }>>`
        WITH previous AS (SELECT profile_photo_key FROM public.doctor_profiles WHERE app_user_id = ${doctorId}::uuid),
        updated AS (UPDATE public.doctor_profiles SET profile_photo_key = NULL, updated_at = now()
          WHERE app_user_id = ${doctorId}::uuid RETURNING app_user_id)
        SELECT previous.profile_photo_key AS previous_key FROM previous JOIN updated ON true`;
      if (previous[0]) await tx.$executeRaw`INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
        VALUES (${actorUserId}::uuid, ${actorUserId === doctorId ? "DOCTOR_PROFILE_PHOTO_SELF_REMOVED" : "DOCTOR_PROFILE_PHOTO_ADMIN_REMOVED"}, 'DOCTOR', ${doctorId}::uuid, '{}'::jsonb)`;
      return previous;
    });
    if (!rows[0]) throw new BadRequestException({ code: "DOCTOR_PROFILE_NOT_FOUND" });
    if (rows[0].previous_key) await this.storage.storage.from(BUCKET).remove([rows[0].previous_key]);
    return { profilePhotoUrl: null };
  }

  publicUrl(key: string) {
    return this.storage?.storage.from(BUCKET).getPublicUrl(key).data.publicUrl ?? null;
  }

  private async ensureBucket() {
    if (!this.storage) throw new ServiceUnavailableException({ code: "PROFILE_PHOTO_STORAGE_NOT_CONFIGURED" });
    const { data, error } = await this.storage.storage.getBucket(BUCKET);
    if (!error && data) {
      if (!data.public) {
        const { error: updateError } = await this.storage.storage.updateBucket(BUCKET, {
          public: true,
          fileSizeLimit: MAX_BYTES,
          allowedMimeTypes: Object.keys(FORMATS),
        });
        if (updateError) throw new ServiceUnavailableException({ code: "PROFILE_PHOTO_BUCKET_SETUP_FAILED" });
      }
      return;
    }
    const { error: createError } = await this.storage.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: Object.keys(FORMATS),
    });
    if (createError && !/already exists/i.test(createError.message)) throw new ServiceUnavailableException({ code: "PROFILE_PHOTO_BUCKET_SETUP_FAILED" });
  }
}
