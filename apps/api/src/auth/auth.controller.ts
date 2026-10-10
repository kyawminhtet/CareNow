import { Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("session")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Resolve the signed-in CareNow account and role" })
  @ApiResponse({ status: 200, description: "Verified user and application role." })
  @ApiResponse({ status: 401, description: "Missing or invalid Supabase access token." })
  @ApiResponse({ status: 403, description: "Identity is not provisioned or account is inactive." })
  async getSession(@Headers("authorization") authorization?: string) {
    return this.authService.resolveSession(this.getBearerToken(authorization));
  }

  @Post("activate-invited-doctor")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Activate an invited doctor's account after password setup" })
  async activateInvitedDoctor(@Headers("authorization") authorization?: string) {
    return this.authService.activateInvitedDoctor(this.getBearerToken(authorization));
  }

  private getBearerToken(authorization?: string): string {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return match[1];
  }
}
