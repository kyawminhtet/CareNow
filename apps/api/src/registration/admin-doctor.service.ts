import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { AccountStatus, ConsultationType, DoctorVerificationStatus, Prisma } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PrismaService } from "../prisma/prisma.service";

const SERVICE_TYPES = new Set<string>(["ONLINE", "IN_PERSON"]);
const ACCOUNT_STATUSES = new Set<string>(["ACTIVE", "SUSPENDED", "INACTIVE"]);
type JsonObject = Record<string, unknown>;

@Injectable()
export class AdminDoctorService {
  private readonly storage: SupabaseClient | null;

  constructor(private readonly prisma: PrismaService) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.storage = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  async list() {
    const doctors = await this.prisma.doctorProfile.findMany({
      include: { appUser: true, services: { where: { isActive: true } } },
      orderBy: { createdAt: "desc" },
    });
    return {
      items: doctors.map(({ appUser, specialty, verificationStatus, services, updatedAt }) => ({
        id: appUser.id,
        label: appUser.displayName,
        detail: `${specialty} · ${services.map((service) => service.consultationType === "ONLINE" ? "Online" : "In person").join(", ") || "No services selected"}`,
        status: `${appUser.status} · ${verificationStatus}`,
        updatedAt: updatedAt.toISOString(),
      })),
    };
  }

  async get(doctorId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { appUserId: doctorId },
      include: {
        appUser: { include: { identityMappings: true } },
        services: { orderBy: { consultationType: "asc" } },
        verificationDocuments: { orderBy: { uploadedAt: "desc" } },
      },
    });
    if (!doctor) throw new NotFoundException({ code: "DOCTOR_NOT_FOUND" });

    let email: string | null = null;
    if (this.storage) {
      const { data } = await this.storage.auth.admin.getUserById(doctorId);
      email = data.user?.email ?? null;
    }
    const documents = await Promise.all(doctor.verificationDocuments.map(async (document) => {
      const signedUrl = await this.createDocumentLink(document.storageBucket, document.storageObjectKey);
      return {
        id: document.id,
        type: document.documentType,
        status: document.reviewStatus,
        uploadedAt: document.uploadedAt.toISOString(),
        signedUrl,
      };
    }));

    return {
      item: {
        id: doctor.appUser.id,
        displayName: doctor.appUser.displayName,
        email,
        phone: doctor.phoneNumber,
        accountStatus: doctor.appUser.status,
        verificationStatus: doctor.verificationStatus,
        specialty: doctor.specialty,
        biography: doctor.biography,
        profilePhotoUrl: doctor.profilePhotoKey && this.storage ? this.storage.storage.from("doctor-profile-photos").getPublicUrl(doctor.profilePhotoKey).data.publicUrl : null,
        licenseNumber: doctor.licenseNumber,
        licenseRegion: doctor.licenseRegion,
        licenseExpiry: doctor.licenseExpiry?.toISOString().slice(0, 10) ?? "",
        qualifications: doctor.qualifications ?? "",
        experienceYears: doctor.experienceYears ?? 0,
        languages: doctor.languages,
        services: doctor.services.map((service) => service.consultationType),
        documents,
        createdAt: doctor.createdAt.toISOString(),
        updatedAt: doctor.updatedAt.toISOString(),
      },
    };
  }

  async update(doctorId: string, actorUserId: string, body: unknown) {
    const data = this.readProfile(body);
    await this.assertDoctorExists(doctorId);
    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({ where: { id: doctorId }, data: { displayName: data.fullName, updatedAt: new Date() } });
      await tx.doctorProfile.update({
        where: { appUserId: doctorId },
        data: {
          specialty: data.specialty,
          biography: data.biography,
          licenseNumber: data.licenseNumber,
          licenseRegion: data.licenseRegion,
          licenseExpiry: new Date(`${data.licenseExpiry}T00:00:00.000Z`),
          phoneNumber: data.phone,
          qualifications: data.qualifications,
          experienceYears: data.experienceYears,
          languages: data.languages,
          updatedAt: new Date(),
        },
      });
      await tx.doctorService.updateMany({ where: { doctorUserId: doctorId }, data: { isActive: false } });
      for (const consultationType of data.services) {
        await tx.doctorService.upsert({
          where: { doctorUserId_consultationType: { doctorUserId: doctorId, consultationType } },
          create: { doctorUserId: doctorId, consultationType, specialty: data.specialty, isActive: true },
          update: { specialty: data.specialty, isActive: true },
        });
      }
      await this.audit(tx, actorUserId, "DOCTOR_PROFILE_UPDATED", doctorId, { serviceCount: data.services.length });
    });
    return { updated: true };
  }

  async updateVerification(doctorId: string, actorUserId: string, body: unknown) {
    const input = this.asObject(body);
    const action = this.readString(input.action, "action");
    if (!["APPROVE", "REJECT", "REQUEST_INFORMATION"].includes(action)) throw new BadRequestException({ code: "INVALID_VERIFICATION_ACTION" });
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if ((action === "REJECT" || action === "REQUEST_INFORMATION") && reason.length < 5) {
      throw new BadRequestException({ code: "VERIFICATION_REASON_REQUIRED" });
    }
    if (reason.length > 1000) throw new BadRequestException({ code: "VERIFICATION_REASON_TOO_LONG" });
    const currentDoctor = await this.prisma.doctorProfile.findUnique({
      where: { appUserId: doctorId },
      select: { verificationStatus: true },
    });
    if (!currentDoctor) throw new NotFoundException({ code: "DOCTOR_NOT_FOUND" });
    if (action === "APPROVE" && currentDoctor.verificationStatus !== "PENDING") {
      throw new ConflictException({ code: "DOCTOR_REVIEW_NOT_PENDING" });
    }

    await this.prisma.$transaction(async (tx) => {
      if (action !== "REQUEST_INFORMATION") {
        const status: DoctorVerificationStatus = action === "APPROVE" ? "VERIFIED" : "REJECTED";
        await tx.doctorProfile.update({
          where: { appUserId: doctorId },
          data: { verificationStatus: status, verifiedAt: status === "VERIFIED" ? new Date() : null, updatedAt: new Date() },
        });
        await tx.doctorVerificationDocument.updateMany({
          where: { doctorUserId: doctorId },
          data: { reviewStatus: status, reviewedAt: new Date(), reviewedByUserId: actorUserId },
        });
      }
      const title = action === "APPROVE" ? "Verification completed" : action === "REJECT" ? "Verification update" : "Information requested";
      const safeMessage = action === "APPROVE" ? "Your doctor verification has been approved." : reason;
      await tx.$executeRaw`INSERT INTO public.notifications
        (recipient_user_id, target_type, target_id, title, safe_message)
        VALUES (${doctorId}::uuid, 'DOCTOR_VERIFICATION', ${doctorId}::uuid, ${title}, ${safeMessage})`;
      await this.audit(tx, actorUserId, `DOCTOR_VERIFICATION_${action}`, doctorId, { reason: reason || undefined });
    });
    return { updated: true, action };
  }

  async updateAccountStatus(doctorId: string, actorUserId: string, body: unknown) {
    const input = this.asObject(body);
    const status = this.readString(input.status, "status");
    if (!ACCOUNT_STATUSES.has(status)) throw new BadRequestException({ code: "INVALID_ACCOUNT_STATUS" });
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { appUserId: doctorId },
      select: { appUserId: true },
    });
    if (!doctor) throw new NotFoundException({ code: "DOCTOR_NOT_FOUND" });
    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({ where: { id: doctorId }, data: { status: status as AccountStatus, updatedAt: new Date() } });
      await this.audit(tx, actorUserId, "DOCTOR_ACCOUNT_STATUS_CHANGED", doctorId, { status });
    });
    return { updated: true, accountStatus: status };
  }

  async deactivate(doctorId: string, actorUserId: string) {
    await this.assertDoctorExists(doctorId);
    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({ where: { id: doctorId }, data: { status: "INACTIVE", updatedAt: new Date() } });
      await this.audit(tx, actorUserId, "DOCTOR_ACCOUNT_DEACTIVATED", doctorId, {});
    });
    return { deactivated: true, accountStatus: "INACTIVE" };
  }

  private readProfile(body: unknown) {
    const input = this.asObject(body);
    const fullName = this.readString(input.fullName, "fullName");
    const specialty = this.readString(input.specialty, "specialty");
    const biography = typeof input.biography === "string" ? input.biography.trim() : "";
    const licenseNumber = this.readString(input.licenseNumber, "licenseNumber");
    const licenseRegion = this.readString(input.licenseRegion, "licenseRegion");
    const licenseExpiry = this.readString(input.licenseExpiry, "licenseExpiry");
    const phone = this.readString(input.phone, "phone");
    const qualifications = this.readString(input.qualifications, "qualifications");
    const experienceYears = Number(input.experienceYears);
    const languages = Array.isArray(input.languages) ? input.languages.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean) : [];
    const services = Array.isArray(input.services) ? input.services.filter((value): value is ConsultationType => typeof value === "string" && SERVICE_TYPES.has(value)) : [];
    if (biography.length > 2000) throw new BadRequestException({ code: "BIOGRAPHY_TOO_LONG" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiry) || Number.isNaN(Date.parse(`${licenseExpiry}T00:00:00Z`))) throw new BadRequestException({ code: "INVALID_LICENSE_EXPIRY" });
    if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 100) throw new BadRequestException({ code: "INVALID_EXPERIENCE" });
    if (!languages.length || !services.length || new Set(services).size !== services.length) throw new BadRequestException({ code: "INVALID_PROFILE_LIST_FIELDS" });
    return { fullName, specialty, biography, licenseNumber, licenseRegion, licenseExpiry, phone, qualifications, experienceYears, languages, services };
  }

  private asObject(value: unknown): JsonObject {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    return value as JsonObject;
  }

  private readString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 500) {
      throw new BadRequestException({ code: "INVALID_FIELD", parameters: { field } });
    }
    return value.trim();
  }

  private async assertDoctorExists(doctorId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({ where: { appUserId: doctorId }, select: { appUserId: true } });
    if (!profile) throw new NotFoundException({ code: "DOCTOR_NOT_FOUND" });
  }

  private async createDocumentLink(bucket: string, key: string): Promise<string> {
    if (!this.storage) throw new ServiceUnavailableException({ code: "PRIVATE_STORAGE_NOT_CONFIGURED" });
    const { data, error } = await this.storage.storage.from(bucket).createSignedUrl(key, 300);
    if (error || !data.signedUrl) throw new ServiceUnavailableException({ code: "VERIFICATION_DOCUMENT_UNAVAILABLE" });
    return data.signedUrl;
  }

  private async audit(tx: Prisma.TransactionClient, actorUserId: string, action: string, doctorId: string, metadata: JsonObject) {
    const safeMetadata = Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
    await tx.$executeRaw`INSERT INTO public.audit_events
      (actor_user_id, action, target_type, target_id, metadata)
      VALUES (${actorUserId}::uuid, ${action}, 'DOCTOR', ${doctorId}::uuid, ${JSON.stringify(safeMetadata)}::jsonb)`;
  }
}
