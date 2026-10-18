import { ConflictException, Injectable, PayloadTooLargeException, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { ApplicationRole, AccountStatus, ConsultationType, Prisma } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

const BUCKET = "doctor-verification";
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_FIELDS = {
  licenseDocument: "LICENSE",
  qualificationDocument: "QUALIFICATION",
  identityDocument: "IDENTITY",
} as const;
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

type RegistrationFile = { field: keyof typeof DOCUMENT_FIELDS; mime: string; bytes: Buffer };

@Injectable()
export class DoctorRegistrationService {
  private readonly authClient: SupabaseClient;
  private readonly storageClient: SupabaseClient | null;

  constructor(private readonly prisma: PrismaService) {
    const url = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publishableKey) throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured.");
    this.authClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.storageClient = serviceRoleKey
      ? createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  }

  async register(request: FastifyRequest) {
    const form = await this.readMultipart(request);
    form.fields.specialty = await this.resolveSpecialty(form.fields.specialtyId);
    this.validate(form.fields, form.files);
    if (!this.storageClient) throw new ServiceUnavailableException({ code: "PRIVATE_STORAGE_NOT_CONFIGURED" });

    const email = form.fields.email.toLowerCase();
    const { data: authResult, error: authError } = await this.authClient.auth.signUp({
      email,
      password: form.fields.password,
      options: { data: { display_name: form.fields.fullName } },
    });
    if (authError || !authResult.user?.id) {
      if (authError?.status === 422 || authError?.code === "user_already_exists") {
        throw new ConflictException({ code: "REGISTRATION_ALREADY_EXISTS" });
      }
      throw new UnprocessableEntityException({ code: "REGISTRATION_IDENTITY_CREATE_FAILED" });
    }
    // Supabase may return a deliberately obfuscated user object for an
    // existing email. Do not delete that pre-existing identity on a later DB conflict.
    const mayDeleteAuthUser = (authResult.user.identities?.length ?? 0) > 0;

    const userId = authResult.user.id;
    const uploaded: Array<{ key: string; field: keyof typeof DOCUMENT_FIELDS }> = [];
    const selectedServices = form.fields.services.split(",") as ConsultationType[];
    try {
      await this.ensureBucket();
      for (const file of form.files) {
        const key = `${userId}/${file.field.toLowerCase()}-${randomUUID()}${MIME_EXTENSIONS[file.mime]}`;
        const { error } = await this.storageClient.storage.from(BUCKET).upload(key, file.bytes, {
          contentType: file.mime,
          upsert: false,
        });
        if (error) throw new Error("PRIVATE_DOCUMENT_UPLOAD_FAILED");
        uploaded.push({ key, field: file.field });
      }

      const expiry = new Date(`${form.fields.licenseExpiry}T00:00:00.000Z`);
      await this.prisma.$transaction(async (tx) => {
        await tx.appUser.create({
          data: {
            id: userId,
            role: ApplicationRole.DOCTOR,
            status: AccountStatus.ACTIVE,
            displayName: form.fields.fullName,
            identityMappings: { create: { provider: "supabase", providerSubject: userId } },
            doctorProfile: {
              create: {
                specialty: form.fields.specialty,
                licenseNumber: form.fields.licenseNumber,
                licenseRegion: form.fields.licenseRegion,
                phoneNumber: form.fields.phone,
                licenseExpiry: expiry,
                qualifications: form.fields.qualifications,
                experienceYears: Number(form.fields.experienceYears),
                languages: form.fields.languages.split(",").map((language) => language.trim()).filter(Boolean),
                verificationStatus: "PENDING",
                services: {
                  create: selectedServices.map((type) => ({ consultationType: type, specialty: form.fields.specialty })),
                },
                verificationDocuments: {
                  create: uploaded.map((key) => ({
                    storageBucket: BUCKET,
                    storageObjectKey: key.key,
                    documentType: DOCUMENT_FIELDS[key.field],
                  })),
                },
              },
            },
          },
        });
      });
      return { accepted: true, emailVerificationRequired: !authResult.session };
    } catch (error) {
      if (uploaded.length > 0) await this.storageClient.storage.from(BUCKET).remove(uploaded.map(({ key }) => key));
      if (mayDeleteAuthUser) await this.storageClient.auth.admin.deleteUser(userId);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "REGISTRATION_ALREADY_EXISTS" });
      }
      if (error instanceof ConflictException) throw error;
      throw new UnprocessableEntityException({ code: "REGISTRATION_PERSISTENCE_FAILED" });
    }
  }

  async inviteFromAdministrator(request: FastifyRequest, actorUserId: string) {
    const form = await this.readMultipart(request);
    form.fields.specialty = await this.resolveSpecialty(form.fields.specialtyId);
    this.validate(form.fields, form.files, false);
    if (!this.storageClient) throw new ServiceUnavailableException({ code: "PRIVATE_STORAGE_NOT_CONFIGURED" });
    const email = form.fields.email.toLowerCase();
    const existingLicense = await this.prisma.doctorProfile.findFirst({
      where: { licenseNumber: form.fields.licenseNumber, licenseRegion: form.fields.licenseRegion },
      select: { appUserId: true },
    });
    if (existingLicense) throw new ConflictException({ code: "REGISTRATION_ALREADY_EXISTS" });
    await this.ensureBucket();
    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    const redirectTo = `${webOrigin}/auth/callback?next=/reset-password`;
    const { data: invited, error: inviteError } = await this.storageClient.auth.admin.inviteUserByEmail(email, {
      data: { display_name: form.fields.fullName },
      redirectTo,
    });
    if (inviteError || !invited.user?.id) {
      if (/already|exists/i.test(inviteError?.message ?? "")) throw new ConflictException({ code: "REGISTRATION_ALREADY_EXISTS" });
      throw new UnprocessableEntityException({ code: "DOCTOR_INVITATION_FAILED" });
    }

    const userId = invited.user.id;
    const uploaded: Array<{ key: string; field: keyof typeof DOCUMENT_FIELDS }> = [];
    const selectedServices = form.fields.services.split(",") as ConsultationType[];
    try {
      for (const file of form.files) {
        const key = `${userId}/${file.field.toLowerCase()}-${randomUUID()}${MIME_EXTENSIONS[file.mime]}`;
        const { error } = await this.storageClient.storage.from(BUCKET).upload(key, file.bytes, {
          contentType: file.mime,
          upsert: false,
        });
        if (error) throw new Error("PRIVATE_DOCUMENT_UPLOAD_FAILED");
        uploaded.push({ key, field: file.field });
      }
      const expiry = new Date(`${form.fields.licenseExpiry}T00:00:00.000Z`);
      await this.prisma.$transaction(async (tx) => {
        await tx.appUser.create({
          data: {
            id: userId,
            role: ApplicationRole.DOCTOR,
            status: AccountStatus.INVITED,
            displayName: form.fields.fullName,
            identityMappings: { create: { provider: "supabase", providerSubject: userId } },
            doctorProfile: {
              create: {
                specialty: form.fields.specialty,
                licenseNumber: form.fields.licenseNumber,
                licenseRegion: form.fields.licenseRegion,
                phoneNumber: form.fields.phone,
                licenseExpiry: expiry,
                qualifications: form.fields.qualifications,
                experienceYears: Number(form.fields.experienceYears),
                languages: form.fields.languages.split(",").map((language) => language.trim()).filter(Boolean),
                verificationStatus: "PENDING",
                services: { create: selectedServices.map((type) => ({ consultationType: type, specialty: form.fields.specialty })) },
                verificationDocuments: {
                  create: uploaded.map((key) => ({
                    storageBucket: BUCKET,
                    storageObjectKey: key.key,
                    documentType: DOCUMENT_FIELDS[key.field],
                  })),
                },
              },
            },
          },
        });
        if (form.fields.initialAvailability === "on") {
          const days = form.fields.availabilityDays.split(",").map(Number);
          for (const weekday of days) {
            await tx.$executeRaw`INSERT INTO public.availability_rules
              (doctor_user_id, consultation_type, clinic_id, weekday, local_start, local_end, effective_from, slot_minutes)
              VALUES (${userId}::uuid, 'ONLINE'::public.consultation_type, NULL, ${weekday}::smallint,
                ${form.fields.availabilityStart}::time, ${form.fields.availabilityEnd}::time, CURRENT_DATE, ${Number(form.fields.slotMinutes)}::smallint)`;
          }
        }
        await tx.$executeRaw`INSERT INTO public.audit_events
          (actor_user_id, action, target_type, target_id, metadata)
          VALUES (${actorUserId}::uuid, 'DOCTOR_INVITED', 'DOCTOR', ${userId}::uuid,
            jsonb_build_object('verificationStatus', 'PENDING'))`;
      });
      return { accepted: true, invitedEmail: email, accountStatus: "INVITED", verificationStatus: "PENDING" };
    } catch (error) {
      if (uploaded.length > 0) await this.storageClient.storage.from(BUCKET).remove(uploaded.map(({ key }) => key));
      await this.storageClient.auth.admin.deleteUser(userId);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "REGISTRATION_ALREADY_EXISTS" });
      }
      throw new UnprocessableEntityException({ code: "DOCTOR_INVITATION_PERSISTENCE_FAILED" });
    }
  }

  private async readMultipart(request: FastifyRequest) {
    const fields: Record<string, string> = {};
    const files: RegistrationFile[] = [];
    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (!(part.fieldname in DOCUMENT_FIELDS)) throw new UnprocessableEntityException({ code: "UNEXPECTED_DOCUMENT_FIELD" });
          if (!MIME_EXTENSIONS[part.mimetype]) throw new UnprocessableEntityException({ code: "INVALID_DOCUMENT_TYPE" });
          const bytes = await part.toBuffer();
          if (part.file.truncated || bytes.byteLength > MAX_DOCUMENT_BYTES) throw new PayloadTooLargeException({ code: "DOCUMENT_TOO_LARGE" });
          files.push({ field: part.fieldname as keyof typeof DOCUMENT_FIELDS, mime: part.mimetype, bytes });
        } else {
          if (typeof part.value === "string") {
            if (part.fieldname === "services" || part.fieldname === "availabilityDays") fields[part.fieldname] = [fields[part.fieldname], part.value.trim()].filter(Boolean).join(",");
            else fields[part.fieldname] = part.value.trim();
          }
          else if (Array.isArray(part.value)) fields[part.fieldname] = part.value.map(String).join(",");
        }
      }
    } catch (error) {
      if (error instanceof UnprocessableEntityException || error instanceof PayloadTooLargeException) throw error;
      throw new UnprocessableEntityException({ code: "INVALID_MULTIPART_FORM" });
    }
    const services = (fields.services ?? "").split(",").filter((type): type is ConsultationType => type === "ONLINE" || type === "IN_PERSON");
    fields.services = services.join(",");
    return { fields, files };
  }

  private validate(fields: Record<string, string>, files: RegistrationFile[], passwordRequired = true) {
    const required = ["fullName", "email", "phone", "specialty", "licenseNumber", "licenseRegion", "licenseExpiry", "qualifications", "experienceYears", "languages", "services", "termsAccepted"];
    if (passwordRequired) required.push("password");
    if (required.some((key) => !fields[key])) throw new UnprocessableEntityException({ code: "REGISTRATION_FIELDS_REQUIRED" });
    if (!/^\S+@\S+\.\S+$/.test(fields.email)) throw new UnprocessableEntityException({ code: "INVALID_EMAIL" });
    if (passwordRequired && fields.password.length < 8) throw new UnprocessableEntityException({ code: "PASSWORD_TOO_SHORT" });
    if (!/^\d{1,3}$/.test(fields.experienceYears)) throw new UnprocessableEntityException({ code: "INVALID_EXPERIENCE" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.licenseExpiry) || Number.isNaN(Date.parse(`${fields.licenseExpiry}T00:00:00Z`))) {
      throw new UnprocessableEntityException({ code: "INVALID_LICENSE_EXPIRY" });
    }
    const services = fields.services.split(",").filter(Boolean);
    if (!services.length || services.some((type) => type !== "ONLINE" && type !== "IN_PERSON")) throw new UnprocessableEntityException({ code: "INVALID_SERVICES" });
    if (fields.initialAvailability === "on") {
      if (!services.includes("ONLINE")) throw new UnprocessableEntityException({ code: "ONLINE_SERVICE_REQUIRED_FOR_AVAILABILITY" });
      const days = (fields.availabilityDays ?? "").split(",").filter(Boolean);
      if (!days.length || days.some((day) => !/^[0-6]$/.test(day)) || new Set(days).size !== days.length) {
        throw new UnprocessableEntityException({ code: "INVALID_AVAILABILITY_DAYS" });
      }
      const validTime = (value: string | undefined) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      if (!validTime(fields.availabilityStart) || !validTime(fields.availabilityEnd) || fields.availabilityStart >= fields.availabilityEnd) {
        throw new UnprocessableEntityException({ code: "INVALID_AVAILABILITY_TIME" });
      }
      if (![15, 30, 45, 60].includes(Number(fields.slotMinutes))) throw new UnprocessableEntityException({ code: "INVALID_SLOT_DURATION" });
    }
    if (fields.termsAccepted !== "on") throw new UnprocessableEntityException({ code: "TERMS_NOT_ACCEPTED" });
    if (files.length !== 3 || new Set(files.map((file) => file.field)).size !== 3) throw new UnprocessableEntityException({ code: "VERIFICATION_DOCUMENTS_REQUIRED" });
  }

  private async resolveSpecialty(specialtyId: string | undefined) {
    if (!specialtyId) throw new UnprocessableEntityException({ code: "SPECIALTY_REQUIRED" });
    const specialty = await this.prisma.specialty.findFirst({ where: { id: specialtyId, isActive: true }, select: { name: true } });
    if (!specialty) throw new UnprocessableEntityException({ code: "INVALID_OR_INACTIVE_SPECIALTY" });
    return specialty.name;
  }

  private async ensureBucket() {
    if (!this.storageClient) throw new ServiceUnavailableException({ code: "PRIVATE_STORAGE_NOT_CONFIGURED" });
    const { data, error } = await this.storageClient.storage.getBucket(BUCKET);
    if (!error && data) return;
    const { error: createError } = await this.storageClient.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_DOCUMENT_BYTES,
      allowedMimeTypes: Object.keys(MIME_EXTENSIONS),
    });
    if (createError && !/already exists/i.test(createError.message)) throw new Error("PRIVATE_BUCKET_CREATE_FAILED");
  }
}
