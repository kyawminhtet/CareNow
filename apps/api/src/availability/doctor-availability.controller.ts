import { Body, Controller, Get, Headers, Put, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { DoctorAvailabilityService } from "./doctor-availability.service";

@ApiTags("doctor availability")
@ApiBearerAuth()
@Controller("web/doctor/availability")
export class DoctorAvailabilityController {
  constructor(private readonly auth: AuthService, private readonly availability: DoctorAvailabilityService) {}

  @Get()
  @ApiOperation({ summary: "Get the signed-in doctor's recurring online availability" })
  async get(@Headers("authorization") authorization?: string) {
    const session = await this.requireDoctor(authorization);
    return this.availability.getWeeklySchedule(session.user.id);
  }

  @Put()
  @ApiOperation({ summary: "Replace the signed-in doctor's recurring online availability" })
  @ApiResponse({ status: 200, description: "Weekly schedule saved." })
  async set(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const session = await this.requireDoctor(authorization);
    return this.availability.setWeeklySchedule(session.user.id, body);
  }

  private async requireDoctor(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return this.auth.requireVerifiedDoctor(match[1]);
  }
}
