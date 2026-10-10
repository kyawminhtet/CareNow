import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type DashboardCounts = {
  pending_verifications: bigint;
  scheduled_today: bigint;
  completed_today: bigint;
};

type VerificationQueueRow = {
  id: string;
  name: string;
  specialty: string;
  submitted_at: Date;
};

type AppointmentRow = {
  id: string;
  patient_reference: string;
  doctor_name: string;
  starts_at: Date;
  consultation_type: "ONLINE" | "IN_PERSON";
  location: string | null;
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
};

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const [counts, verifications, appointments] = await Promise.all([
      this.prisma.$queryRaw<DashboardCounts[]>(Prisma.sql`
        SELECT
          (SELECT count(*) FROM public.doctor_profiles dp
             JOIN public.app_users au ON au.id = dp.app_user_id
            WHERE dp.verification_status = 'PENDING' AND au.status IN ('INVITED', 'ACTIVE')) AS pending_verifications,
          (SELECT count(*) FROM public.appointments a
             JOIN public.appointment_slots s ON s.id = a.slot_id
            WHERE a.status = 'SCHEDULED'
              AND s.starts_at >= ((now() AT TIME ZONE 'Asia/Yangon')::date::timestamp AT TIME ZONE 'Asia/Yangon')
              AND s.starts_at < (((now() AT TIME ZONE 'Asia/Yangon')::date + 1)::timestamp AT TIME ZONE 'Asia/Yangon')) AS scheduled_today,
          (SELECT count(*) FROM public.appointments a
             JOIN public.appointment_slots s ON s.id = a.slot_id
            WHERE a.status = 'COMPLETED'
              AND s.starts_at >= ((now() AT TIME ZONE 'Asia/Yangon')::date::timestamp AT TIME ZONE 'Asia/Yangon')
              AND s.starts_at < (((now() AT TIME ZONE 'Asia/Yangon')::date + 1)::timestamp AT TIME ZONE 'Asia/Yangon')) AS completed_today
      `),
      this.prisma.$queryRaw<VerificationQueueRow[]>(Prisma.sql`
        SELECT au.id::text AS id, au.display_name AS name, dp.specialty, dp.created_at AS submitted_at
          FROM public.doctor_profiles dp
          JOIN public.app_users au ON au.id = dp.app_user_id
         WHERE dp.verification_status = 'PENDING' AND au.status IN ('INVITED', 'ACTIVE')
         ORDER BY dp.created_at ASC
         LIMIT 5
      `),
      this.prisma.$queryRaw<AppointmentRow[]>(Prisma.sql`
        SELECT a.id::text AS id,
               'PT-' || upper(substr(a.patient_user_id::text, 1, 8)) AS patient_reference,
               doctor.display_name AS doctor_name,
               s.starts_at,
               a.consultation_type::text AS consultation_type,
               clinic.name AS location,
               a.status::text AS status
          FROM public.appointments a
          JOIN public.appointment_slots s ON s.id = a.slot_id
          JOIN public.app_users doctor ON doctor.id = a.doctor_user_id
          LEFT JOIN public.clinics clinic ON clinic.id = a.clinic_id
         ORDER BY a.created_at DESC
         LIMIT 8
      `),
    ]);

    const metric = counts[0];
    return {
      pendingVerifications: Number(metric?.pending_verifications ?? 0),
      scheduledToday: Number(metric?.scheduled_today ?? 0),
      // The schema does not yet persist consultation progress or check-in state.
      // Keep these honest at zero until those event-backed workflows are implemented.
      waiting: 0,
      inProgress: 0,
      completed: Number(metric?.completed_today ?? 0),
      verifications: verifications.map((row) => ({
        id: row.id,
        name: row.name,
        initials: row.name.split(/\s+/).map((part) => part[0] ?? "").slice(0, 2).join("").toUpperCase(),
        specialty: row.specialty,
        submittedAt: row.submitted_at.toISOString(),
        status: "PENDING" as const,
      })),
      appointments: appointments.map((row) => ({
        id: row.id,
        patientReference: row.patient_reference,
        doctorName: row.doctor_name,
        date: row.starts_at.toISOString(),
        startTime: row.starts_at.toISOString(),
        consultationType: row.consultation_type,
        ...(row.location ? { location: row.location } : {}),
        status: row.status,
      })),
    };
  }
}
