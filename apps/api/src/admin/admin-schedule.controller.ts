import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { AdminScheduleService } from "./admin-schedule.service";

@ApiTags("administrator schedules")
@ApiBearerAuth()
@Controller("web/admin/schedules")
export class AdminScheduleController {
  constructor(private readonly auth: AuthService, private readonly schedules: AdminScheduleService) {}

  @Get()
  @ApiOperation({ summary: "List available doctors, assigned clinics, and appointment slots" })
  async list(
    @Headers("authorization") authorization: string | undefined,
    @Query("doctorId") doctorId?: string,
    @Query("from") from?: string,
    @Query("until") until?: string,
  ) {
    await this.requireAdministrator(authorization);
    return this.schedules.getSchedule({ doctorId, from, until });
  }

  @Post("weekly/preview")
  @ApiOperation({ summary: "Preview generated weekly appointment slots and conflicts" })
  async previewWeekly(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    await this.requireAdministrator(authorization);
    return this.schedules.previewWeekly(body);
  }

  @Post("weekly")
  @ApiOperation({ summary: "Create a weekly batch of appointment slots atomically" })
  @ApiResponse({ status: 201, description: "Weekly appointment slots created." })
  async createWeekly(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actor = await this.requireAdministrator(authorization);
    return this.schedules.createWeekly(actor.user.id, body);
  }

  @Get(":slotId")
  @ApiOperation({ summary: "Read one appointment slot" })
  async get(@Headers("authorization") authorization: string | undefined, @Param("slotId", ParseUUIDPipe) slotId: string) {
    await this.requireAdministrator(authorization);
    return this.schedules.getSlot(slotId);
  }

  @Post()
  @ApiOperation({ summary: "Create an appointment slot on behalf of a doctor" })
  @ApiResponse({ status: 201, description: "Appointment slot created." })
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actor = await this.requireAdministrator(authorization);
    return this.schedules.createSlot(actor.user.id, body);
  }

  @Patch(":slotId")
  @ApiOperation({ summary: "Update or block an unbooked appointment slot" })
  async update(
    @Headers("authorization") authorization: string | undefined,
    @Param("slotId", ParseUUIDPipe) slotId: string,
    @Body() body: unknown,
  ) {
    const actor = await this.requireAdministrator(authorization);
    return this.schedules.updateSlot(actor.user.id, slotId, body);
  }

  @Delete(":slotId")
  @ApiOperation({ summary: "Delete an unbooked appointment slot" })
  async delete(@Headers("authorization") authorization: string | undefined, @Param("slotId", ParseUUIDPipe) slotId: string) {
    const actor = await this.requireAdministrator(authorization);
    return this.schedules.deleteSlot(actor.user.id, slotId);
  }

  private async requireAdministrator(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return this.auth.requireAdministrator(match[1]);
  }
}
