import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { DoctorRegistrationController } from "./registration/doctor-registration.controller";
import { DoctorRegistrationService } from "./registration/doctor-registration.service";
import { AdminDoctorController } from "./registration/admin-doctor.controller";
import { AdminDashboardController } from "./admin/admin-dashboard.controller";
import { AdminDashboardService } from "./admin/admin-dashboard.service";
import { AdminDoctorService } from "./registration/admin-doctor.service";
import { DoctorAvailabilityController } from "./availability/doctor-availability.controller";
import { DoctorAvailabilityService } from "./availability/doctor-availability.service";
import { AdminScheduleController } from "./admin/admin-schedule.controller";
import { AdminScheduleService } from "./admin/admin-schedule.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController, DoctorRegistrationController, AdminDoctorController, AdminDashboardController, DoctorAvailabilityController, AdminScheduleController],
  providers: [DoctorRegistrationService, AdminDashboardService, AdminDoctorService, DoctorAvailabilityService, AdminScheduleService],
})
export class AppModule {}
