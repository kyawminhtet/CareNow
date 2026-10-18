import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SupabaseIdentityService } from "./supabase-identity.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, SupabaseIdentityService],
  exports: [AuthService, SupabaseIdentityService],
})
export class AuthModule {}
