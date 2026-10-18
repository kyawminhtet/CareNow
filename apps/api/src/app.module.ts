import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { DoctorRegistrationController } from "./registration/doctor-registration.controller";
import { DoctorRegistrationService } from "./registration/doctor-registration.service";
import { AdminDoctorController } from "./registration/admin-doctor.controller";
import { AdminDashboardController } from "./admin/admin-dashboard.controller";
import { AdminDashboardService } from "./admin/admin-dashboard.service";
import { AdminAppointmentsController } from "./admin/admin-appointments.controller";
import { AdminAppointmentsService } from "./admin/admin-appointments.service";
import { AdminDoctorService } from "./registration/admin-doctor.service";
import { DoctorAvailabilityController } from "./availability/doctor-availability.controller";
import { DoctorAvailabilityService } from "./availability/doctor-availability.service";
import { AdminScheduleController } from "./admin/admin-schedule.controller";
import { AdminScheduleService } from "./admin/admin-schedule.service";
import { AdminClinicAssignmentController } from "./admin/admin-clinic-assignment.controller";
import { AdminClinicAssignmentService } from "./admin/admin-clinic-assignment.service";
import { AdminClinicController } from "./admin/admin-clinic.controller";
import { AdminClinicService } from "./admin/admin-clinic.service";
import { SpecialtyController } from "./admin/specialty.controller";
import { SpecialtyService } from "./admin/specialty.service";
import { PatientController } from "./patient/patient.controller";
import { PatientService } from "./patient/patient.service";
import { DoctorWorkspaceController } from "./doctor/doctor-workspace.controller";
import { DoctorWorkspaceService } from "./doctor/doctor-workspace.service";
import { DoctorProfileService } from "./doctor/doctor-profile.service";
import { DailyConsultationService } from "./consultation/daily-consultation.service";
import { ChatController } from "./chat/chat.controller";
import { ChatService } from "./chat/chat.service";
import { ChatRealtimeService } from "./chat/chat-realtime.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController, DoctorRegistrationController, AdminDoctorController, AdminDashboardController, AdminAppointmentsController, DoctorWorkspaceController, DoctorAvailabilityController, AdminScheduleController, AdminClinicAssignmentController, AdminClinicController, SpecialtyController, PatientController, ChatController],
  providers: [DoctorRegistrationService, AdminDashboardService, AdminAppointmentsService, DoctorWorkspaceService, DoctorProfileService, DailyConsultationService, AdminDoctorService, DoctorAvailabilityService, AdminScheduleService, AdminClinicAssignmentService, AdminClinicService, SpecialtyService, PatientService, ChatService, ChatRealtimeService],
})
export class AppModule {}
