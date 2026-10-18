import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Put, Req, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { SpecialtyService } from "./specialty.service";

@ApiTags("specialties")
@Controller()
export class SpecialtyController {
  constructor(private readonly auth: AuthService, private readonly specialties: SpecialtyService) {}

  @Get("public/specialties")
  async publicList() { return this.specialties.publicList(); }

  @Get("web/admin/specialties")
  @ApiBearerAuth()
  async list(@Headers("authorization") authorization?: string) {
    await this.requireAdministrator(authorization);
    return this.specialties.adminList();
  }

  @Post("web/admin/specialties")
  @ApiBearerAuth()
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const actor = await this.requireAdministrator(authorization);
    return this.specialties.create(actor.user.id, body);
  }

  @Put("web/admin/specialties/:specialtyId")
  @ApiBearerAuth()
  async update(@Headers("authorization") authorization: string | undefined, @Param("specialtyId", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const actor = await this.requireAdministrator(authorization);
    return this.specialties.update(actor.user.id, id, body);
  }

  @Post("web/admin/specialties/:specialtyId/photo")
  @ApiBearerAuth()
  async uploadPhoto(@Headers("authorization") authorization: string | undefined, @Param("specialtyId", ParseUUIDPipe) id: string, @Req() request: FastifyRequest) {
    const actor = await this.requireAdministrator(authorization);
    return this.specialties.uploadPhoto(actor.user.id, id, request);
  }

  @Delete("web/admin/specialties/:specialtyId/photo")
  @ApiBearerAuth()
  async removePhoto(@Headers("authorization") authorization: string | undefined, @Param("specialtyId", ParseUUIDPipe) id: string) {
    const actor = await this.requireAdministrator(authorization);
    return this.specialties.removePhoto(actor.user.id, id);
  }

  @Delete("web/admin/specialties/:specialtyId")
  @ApiBearerAuth()
  async remove(@Headers("authorization") authorization: string | undefined, @Param("specialtyId", ParseUUIDPipe) id: string) {
    const actor = await this.requireAdministrator(authorization);
    return this.specialties.remove(actor.user.id, id);
  }

  private async requireAdministrator(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return this.auth.requireAdministrator(match[1]);
  }
}
