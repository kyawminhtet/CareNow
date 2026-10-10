import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { AdminDashboardService } from "./admin-dashboard.service";

@ApiTags("administrator dashboard")
@ApiBearerAuth()
@Controller("web/admin/dashboard")
export class AdminDashboardController {
  constructor(
    private readonly auth: AuthService,
    private readonly dashboard: AdminDashboardService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get operational dashboard data for the active administrator" })
  @ApiResponse({ status: 200, description: "Operational metrics and appointment references without patient clinical content." })
  async getDashboard(@Headers("authorization") authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    await this.auth.requireAdministrator(match[1]);
    return this.dashboard.getDashboard();
  }
}
