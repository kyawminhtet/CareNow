import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { AdminClinicAssignmentService } from "./admin-clinic-assignment.service";

@ApiTags("administrator clinic assignments")
@ApiBearerAuth()
@Controller("web/admin/doctor-clinics")
export class AdminClinicAssignmentController {
  constructor(private readonly auth: AuthService, private readonly assignments: AdminClinicAssignmentService) {}

  @Get()
  @ApiOperation({ summary: "List doctors, active clinics, and clinic assignments" })
  async list(@Headers("authorization") authorization?: string) {
    await this.requireAdministrator(authorization);
    return this.assignments.list();
  }

  @Post()
  @ApiOperation({ summary: "Assign an active clinic to a doctor" })
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actor = await this.requireAdministrator(authorization);
    return this.assignments.create(actor.user.id, body);
  }

  @Patch(":doctorId/:clinicId")
  @ApiOperation({ summary: "Update a doctor clinic assignment's primary status" })
  async update(
    @Headers("authorization") authorization: string | undefined,
    @Param("doctorId", ParseUUIDPipe) doctorId: string,
    @Param("clinicId", ParseUUIDPipe) clinicId: string,
    @Body() body: unknown,
  ) {
    const actor = await this.requireAdministrator(authorization);
    return this.assignments.update(actor.user.id, doctorId, clinicId, body);
  }

  @Delete(":doctorId/:clinicId")
  @ApiOperation({ summary: "Remove a clinic assignment without deleting schedule data" })
  async delete(
    @Headers("authorization") authorization: string | undefined,
    @Param("doctorId", ParseUUIDPipe) doctorId: string,
    @Param("clinicId", ParseUUIDPipe) clinicId: string,
  ) {
    const actor = await this.requireAdministrator(authorization);
    return this.assignments.delete(actor.user.id, doctorId, clinicId);
  }

  private async requireAdministrator(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return this.auth.requireAdministrator(match[1]);
  }
}
