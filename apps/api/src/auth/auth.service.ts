import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SupabaseIdentityService } from "./supabase-identity.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseIdentity: SupabaseIdentityService,
  ) {}

  async resolveSession(accessToken: string) {
    const identity = await this.supabaseIdentity.verifyAccessToken(accessToken);
    if (!identity) throw new UnauthorizedException({ code: "AUTH_TOKEN_INVALID" });

    const mapping = await this.prisma.identityMapping.findUnique({
      where: {
        provider_providerSubject: {
          provider: "supabase",
          providerSubject: identity.id,
        },
      },
      include: {
        appUser: {
          include: { doctorProfile: true },
        },
      },
    });

    if (!mapping) {
      throw new ForbiddenException({ code: "ACCOUNT_NOT_PROVISIONED" });
    }

    const user = mapping.appUser;
    return {
      user: {
        id: user.id,
        role: user.role,
        accountStatus: user.status,
        ...(user.role === "DOCTOR"
          ? { verificationStatus: user.doctorProfile?.verificationStatus ?? "PENDING" }
          : {}),
        displayName: user.displayName,
      },
    };
  }

  async requireAdministrator(accessToken: string) {
    const session = await this.resolveSession(accessToken);
    if (session.user.role !== "ADMINISTRATOR" || session.user.accountStatus !== "ACTIVE") {
      throw new ForbiddenException({ code: "ADMINISTRATOR_REQUIRED" });
    }
    return session;
  }

  async requireVerifiedDoctor(accessToken: string) {
    const session = await this.resolveSession(accessToken);
    if (session.user.role !== "DOCTOR" || session.user.accountStatus !== "ACTIVE" || session.user.verificationStatus !== "VERIFIED") {
      throw new ForbiddenException({ code: "VERIFIED_DOCTOR_REQUIRED" });
    }
    return session;
  }

  async activateInvitedDoctor(accessToken: string) {
    const identity = await this.supabaseIdentity.verifyAccessToken(accessToken);
    if (!identity) throw new UnauthorizedException({ code: "AUTH_TOKEN_INVALID" });
    const mapping = await this.prisma.identityMapping.findUnique({
      where: { provider_providerSubject: { provider: "supabase", providerSubject: identity.id } },
      include: { appUser: { include: { doctorProfile: true } } },
    });
    if (!mapping || mapping.appUser.role !== "DOCTOR" || mapping.appUser.status !== "INVITED" || !mapping.appUser.doctorProfile) {
      throw new ForbiddenException({ code: "INVITED_DOCTOR_ACTIVATION_NOT_ALLOWED" });
    }
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.appUser.updateMany({
        where: { id: mapping.appUserId, role: "DOCTOR", status: "INVITED" },
        data: { status: "ACTIVE", updatedAt: new Date() },
      });
      if (result.count !== 1) throw new ForbiddenException({ code: "INVITED_DOCTOR_ACTIVATION_NOT_ALLOWED" });
      await tx.$executeRaw`INSERT INTO public.audit_events
        (actor_user_id, action, target_type, target_id, metadata)
        VALUES (${mapping.appUserId}::uuid, 'DOCTOR_ACCOUNT_ACTIVATED', 'DOCTOR', ${mapping.appUserId}::uuid, '{}'::jsonb)`;
    });
    return { activated: true };
  }
}
