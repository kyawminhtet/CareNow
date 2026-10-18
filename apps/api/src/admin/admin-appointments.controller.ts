import { Controller, Get, Headers, Param, ParseUUIDPipe, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { AdminAppointmentsService } from "./admin-appointments.service";

@ApiTags("administrator appointments")
@ApiBearerAuth()
@Controller("web/admin/appointments")
export class AdminAppointmentsController {
  constructor(private readonly auth: AuthService, private readonly appointments: AdminAppointmentsService) {}

  @Get()
  @ApiOperation({ summary: "List operational appointment information for administrators" })
  @ApiQuery({ name: "status", required: false, enum: ["ALL", "SCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"] })
  @ApiQuery({ name: "type", required: false, enum: ["ALL", "ONLINE", "IN_PERSON"] })
  @ApiQuery({ name: "doctorId", required: false })
  @ApiQuery({ name: "from", required: false, description: "Start date in YYYY-MM-DD using Yangon time" })
  @ApiQuery({ name: "to", required: false, description: "End date in YYYY-MM-DD using Yangon time" })
  async list(
    @Headers("authorization") authorization?: string,
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("doctorId") doctorId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    await this.requireAdministrator(authorization);
    return this.appointments.list({ status, type, doctorId, from, to });
  }

  @Get(":appointmentId")
  @ApiOperation({ summary: "Get operational details for one appointment without clinical content" })
  async get(@Headers("authorization") authorization: string | undefined, @Param("appointmentId", ParseUUIDPipe) appointmentId: string) {
    await this.requireAdministrator(authorization);
    return this.appointments.get(appointmentId);
  }

  private async requireAdministrator(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return this.auth.requireAdministrator(match[1]);
  }
}
