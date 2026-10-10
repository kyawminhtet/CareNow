import { Controller, HttpCode, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { DoctorRegistrationService } from "./doctor-registration.service";

@ApiTags("registration")
@Controller("public/doctor-registrations")
export class DoctorRegistrationController {
  constructor(private readonly registration: DoctorRegistrationService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: "Submit doctor self-registration for verification" })
  @ApiResponse({ status: 202, description: "Registration accepted; verify the email address." })
  @ApiResponse({ status: 409, description: "Email or medical license is already registered." })
  async create(@Req() request: FastifyRequest) {
    return this.registration.register(request);
  }
}
