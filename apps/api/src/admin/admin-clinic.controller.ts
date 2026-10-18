import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Put, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { AdminClinicService } from "./admin-clinic.service";

@ApiTags("administrator clinics")
@ApiBearerAuth()
@Controller("web/admin/clinics")
export class AdminClinicController {
  constructor(private readonly auth: AuthService, private readonly clinics: AdminClinicService) {}

  @Get()
  @ApiOperation({ summary: "List clinic records for administrator management" })
  async list(@Headers("authorization") authorization?: string) {
    await this.requireAdministrator(authorization);
    return this.clinics.list();
  }

  @Post()
  @ApiOperation({ summary: "Create a clinic" })
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actor = await this.requireAdministrator(authorization);
    return this.clinics.create(actor.user.id, body);
  }

  @Put(":clinicId")
  @ApiOperation({ summary: "Update a clinic's details" })
  async update(@Headers("authorization") authorization: string | undefined, @Param("clinicId", ParseUUIDPipe) clinicId: string, @Body() body: unknown) {
    const actor = await this.requireAdministrator(authorization);
    return this.clinics.update(actor.user.id, clinicId, body);
  }

  @Delete(":clinicId")
  @ApiOperation({ summary: "Deactivate a clinic without deleting assignments or schedule history" })
  async deactivate(@Headers("authorization") authorization: string | undefined, @Param("clinicId", ParseUUIDPipe) clinicId: string) {
    const actor = await this.requireAdministrator(authorization);
    return this.clinics.deactivate(actor.user.id, clinicId);
  }

  @Patch(":clinicId/activate")
  @ApiOperation({ summary: "Reactivate a clinic" })
  async activate(@Headers("authorization") authorization: string | undefined, @Param("clinicId", ParseUUIDPipe) clinicId: string) {
    const actor = await this.requireAdministrator(authorization);
    return this.clinics.activate(actor.user.id, clinicId);
  }

  private async requireAdministrator(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return this.auth.requireAdministrator(match[1]);
  }
}
