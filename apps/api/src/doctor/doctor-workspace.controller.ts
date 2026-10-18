import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { DoctorWorkspaceService } from "./doctor-workspace.service";
import { DailyConsultationService } from "../consultation/daily-consultation.service";
import { DoctorProfileService } from "./doctor-profile.service";
import type { FastifyRequest } from "fastify";

@ApiTags("doctor workspace")
@ApiBearerAuth()
@Controller("web/doctor")
export class DoctorWorkspaceController {
  constructor(private readonly auth: AuthService, private readonly workspace: DoctorWorkspaceService, private readonly daily: DailyConsultationService, private readonly profile: DoctorProfileService) {}

  @Get("profile")
  async profileDetails(@Headers("authorization") authorization?: string) {
    const doctor = await this.requireActiveDoctor(authorization);
    return this.profile.get(doctor.user.id);
  }

  @Patch("profile")
  async updateProfile(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const doctor = await this.requireActiveDoctor(authorization);
    return this.profile.updateOwn(doctor.user.id, doctor.user.id, body);
  }

  @Patch("profile/personal")
  async updatePersonalInformation(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const doctor = await this.requireActiveDoctor(authorization);
    return this.profile.updatePersonal(doctor.user.id, body);
  }

  @Post("profile/photo")
  async uploadProfilePhoto(@Headers("authorization") authorization?: string, @Req() request?: FastifyRequest) {
    const doctor = await this.requireActiveDoctor(authorization);
    return this.profile.upload(doctor.user.id, request!, doctor.user.id);
  }

  @Delete("profile/photo")
  async deleteProfilePhoto(@Headers("authorization") authorization?: string) {
    const doctor = await this.requireActiveDoctor(authorization);
    return this.profile.remove(doctor.user.id, doctor.user.id);
  }

  @Get("dashboard")
  @ApiOperation({ summary: "Get the signed-in doctor's schedule dashboard" })
  async dashboard(@Headers("authorization") authorization?: string) {
    const doctor = await this.requireDoctor(authorization);
    return this.workspace.dashboard(doctor.user.id);
  }

  @Get("appointments")
  @ApiOperation({ summary: "List appointments belonging to the signed-in doctor" })
  @ApiQuery({ name: "status", required: false, enum: ["UPCOMING", "COMPLETED", "CANCELLED", "ALL"] })
  async appointments(@Headers("authorization") authorization?: string, @Query("status") status?: string) {
    const doctor = await this.requireDoctor(authorization);
    return this.workspace.appointments(doctor.user.id, status);
  }

  @Get("patients")
  @ApiOperation({ summary: "List patients with appointments assigned to the signed-in doctor" })
  async patients(@Headers("authorization") authorization?: string) {
    const doctor = await this.requireDoctor(authorization);
    return this.workspace.patients(doctor.user.id);
  }

  @Get("patients/:patientId")
  @ApiOperation({ summary: "Get a patient and appointment history authorized for the signed-in doctor" })
  async patient(@Headers("authorization") authorization?: string, @Param("patientId", ParseUUIDPipe) patientId?: string) {
    const doctor = await this.requireDoctor(authorization);
    return this.workspace.patient(doctor.user.id, patientId!);
  }

  @Post("appointments/:appointmentId/video-token")
  @ApiOperation({ summary: "Issue a short-lived Daily token for the doctor's own online appointment" })
  async videoToken(@Headers("authorization") authorization?: string, @Param("appointmentId") appointmentId?: string) {
    const doctor = await this.requireDoctor(authorization);
    return this.daily.issueJoinToken(appointmentId!, doctor.user.id, "DOCTOR");
  }

  private async requireDoctor(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return this.auth.requireVerifiedDoctor(match[1]);
  }

  private async requireActiveDoctor(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return this.auth.requireActiveDoctor(match[1]);
  }
}
