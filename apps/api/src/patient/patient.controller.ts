import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { PatientService } from "./patient.service";
import { DailyConsultationService } from "../consultation/daily-consultation.service";

@ApiTags("patient")
@ApiBearerAuth()
@Controller("patient")
export class PatientController {
  constructor(private readonly auth: AuthService, private readonly patients: PatientService, private readonly daily: DailyConsultationService) {}

  @Post("register") register(@Headers("authorization") h: string | undefined, @Body() body: unknown) { return this.patients.register(this.bearer(h), body); }
  @Get("profile") async profile(@Headers("authorization") h?: string) { const s=await this.session(h); return this.patients.profile(s.user.id); }
  @Patch("profile") async updateProfile(@Headers("authorization") h: string | undefined,@Body() body: unknown) { const s=await this.session(h); return this.patients.updateProfile(s.user.id,body); }
  @Get("doctors") async doctors(@Headers("authorization") h: string | undefined,@Query("query") query?: string,@Query("specialty") specialty?: string,@Query("consultationType") consultationType?: string,@Query("language") language?: string,@Query("clinicId") clinicId?: string) { await this.session(h); return this.patients.doctors({query,specialty,consultationType,language,clinicId}); }
  @Get("doctors/:id") async doctor(@Headers("authorization") h: string | undefined,@Param("id") id: string) { await this.session(h); return this.patients.doctor(id); }
  @Get("slots") async slots(@Headers("authorization") h: string | undefined,@Query("doctorId") doctorId: string,@Query("consultationType") type: string,@Query("from") from?: string,@Query("until") until?: string) { await this.session(h); return this.patients.slots(doctorId,type,from,until); }
  @Post("appointments") async book(@Headers("authorization") h: string | undefined,@Body() body: unknown) { const s=await this.session(h); return this.patients.book(s.user.id,body); }
  @Get("appointments") async appointments(@Headers("authorization") h: string | undefined,@Query("status") status?: string) { const s=await this.session(h); return this.patients.appointments(s.user.id,status); }
  @Get("appointments/:id") async appointment(@Headers("authorization") h: string | undefined,@Param("id") id: string) { const s=await this.session(h); return this.patients.appointment(s.user.id,id); }
  @Post("appointments/:id/video-token") async videoToken(@Headers("authorization") h: string | undefined,@Param("id") id: string) { const s=await this.session(h); return this.daily.issueJoinToken(id,s.user.id,"PATIENT"); }
  @Post("appointments/:id/cancel") async cancel(@Headers("authorization") h: string | undefined,@Param("id") id: string) { const s=await this.session(h); return this.patients.cancel(s.user.id,id); }
  @Post("appointments/:id/reschedule") async reschedule(@Headers("authorization") h: string | undefined,@Param("id") id: string,@Body() body: unknown) { const s=await this.session(h); return this.patients.reschedule(s.user.id,id,body); }
  @Get("notifications") async notifications(@Headers("authorization") h: string | undefined) { const s=await this.session(h); return this.patients.notificationList(s.user.id); }
  @Post("notifications/read-all") async readAll(@Headers("authorization") h: string | undefined) { const s=await this.session(h); return this.patients.markRead(s.user.id); }
  @Post("notifications/:id/read") async readOne(@Headers("authorization") h: string | undefined,@Param("id") id: string) { const s=await this.session(h); return this.patients.markRead(s.user.id,id); }
  @Get("notification-preferences") async getPreferences(@Headers("authorization") h: string | undefined) { const s=await this.session(h); return this.patients.preferences(s.user.id); }
  @Patch("notification-preferences") async setPreferences(@Headers("authorization") h: string | undefined,@Body() body: unknown) { const s=await this.session(h); return this.patients.preferences(s.user.id,body); }
  @Post("devices") async addDevice(@Headers("authorization") h: string | undefined,@Body() body: unknown) { const s=await this.session(h); return this.patients.registerDevice(s.user.id,body); }
  @Delete("devices/:installationId") async removeDevice(@Headers("authorization") h: string | undefined,@Param("installationId") id: string) { const s=await this.session(h); return this.patients.removeDevice(s.user.id,id); }

  private session(h?: string) { return this.auth.requirePatient(this.bearer(h)); }
  private bearer(value?: string) { const m=value?.match(/^Bearer\s+(.+)$/i); if(!m) throw new UnauthorizedException({code:"AUTH_TOKEN_REQUIRED"}); return m[1]; }
}
