import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Req, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { DoctorRegistrationService } from "./doctor-registration.service";
import { AdminDoctorService } from "./admin-doctor.service";

@ApiTags("administrator doctors")
@ApiBearerAuth()
@Controller("web/admin/doctors")
export class AdminDoctorController {
  constructor(
    private readonly auth: AuthService,
    private readonly registrations: DoctorRegistrationService,
    private readonly doctors: AdminDoctorService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List doctor accounts for administrator operations" })
  async list(@Headers("authorization") authorization?: string) {
    await this.requireAdministrator(authorization);
    return this.doctors.list();
  }

  @Get(":doctorId")
  @ApiOperation({ summary: "Read a doctor profile and temporary verification document links" })
  async get(@Headers("authorization") authorization: string | undefined, @Param("doctorId", ParseUUIDPipe) doctorId: string) {
    await this.requireAdministrator(authorization);
    return this.doctors.get(doctorId);
  }

  @Patch(":doctorId")
  @ApiOperation({ summary: "Update a doctor's professional profile and offered services" })
  async update(
    @Headers("authorization") authorization: string | undefined,
    @Param("doctorId", ParseUUIDPipe) doctorId: string,
    @Body() body: unknown,
  ) {
    const actor = await this.requireAdministrator(authorization);
    return this.doctors.update(doctorId, actor.user.id, body);
  }

  @Patch(":doctorId/verification")
  @ApiOperation({ summary: "Approve, reject, or request information for doctor verification" })
  async updateVerification(
    @Headers("authorization") authorization: string | undefined,
    @Param("doctorId", ParseUUIDPipe) doctorId: string,
    @Body() body: unknown,
  ) {
    const actor = await this.requireAdministrator(authorization);
    return this.doctors.updateVerification(doctorId, actor.user.id, body);
  }

  @Patch(":doctorId/account-status")
  @ApiOperation({ summary: "Change a doctor's account access status" })
  async updateAccountStatus(
    @Headers("authorization") authorization: string | undefined,
    @Param("doctorId", ParseUUIDPipe) doctorId: string,
    @Body() body: unknown,
  ) {
    const actor = await this.requireAdministrator(authorization);
    return this.doctors.updateAccountStatus(doctorId, actor.user.id, body);
  }

  @Delete(":doctorId")
  @ApiOperation({ summary: "Deactivate a doctor account while retaining its audit and clinical history" })
  async deactivate(@Headers("authorization") authorization: string | undefined, @Param("doctorId", ParseUUIDPipe) doctorId: string) {
    const actor = await this.requireAdministrator(authorization);
    return this.doctors.deactivate(doctorId, actor.user.id);
  }

  @Post("invitations")
  @ApiOperation({ summary: "Create a pending doctor account and send a secure invitation" })
  @ApiResponse({ status: 201, description: "Doctor account created in invited state." })
  @ApiResponse({ status: 403, description: "Only active administrators may invite doctors." })
  async invite(@Headers("authorization") authorization: string | undefined, @Req() request: FastifyRequest) {
    const session = await this.requireAdministrator(authorization);
    return this.registrations.inviteFromAdministrator(request, session.user.id);
  }

  private async requireAdministrator(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return this.auth.requireAdministrator(match[1]);
  }
}
