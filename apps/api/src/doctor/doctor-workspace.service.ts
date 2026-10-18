import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const APPOINTMENT_FILTERS = ["UPCOMING", "COMPLETED", "CANCELLED", "ALL"] as const;
type AppointmentFilter = (typeof APPOINTMENT_FILTERS)[number];

type AppointmentDbRow = {
  id: string;
  patient_id: string;
  patient_name: string;
  reason: string;
  starts_at: Date;
  ends_at: Date;
  consultation_type: "ONLINE" | "IN_PERSON";
  location: string | null;
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
};

@Injectable()
export class DoctorWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(doctorId: string) {
    const [rows, appointments] = await Promise.all([
      this.prisma.$queryRaw<Array<{ upcoming_count: bigint; online_today: bigint; in_person_today: bigint; completed_this_week: bigint }>>(Prisma.sql`
        WITH time_bounds AS (
          SELECT
            ((now() AT TIME ZONE 'Asia/Yangon')::date::timestamp AT TIME ZONE 'Asia/Yangon') AS today_start,
            (((now() AT TIME ZONE 'Asia/Yangon')::date + 1)::timestamp AT TIME ZONE 'Asia/Yangon') AS tomorrow_start,
            (date_trunc('week', now() AT TIME ZONE 'Asia/Yangon') AT TIME ZONE 'Asia/Yangon') AS week_start,
            ((date_trunc('week', now() AT TIME ZONE 'Asia/Yangon') + interval '1 week') AT TIME ZONE 'Asia/Yangon') AS week_end
        )
        SELECT
          count(*) FILTER (WHERE a.status = 'SCHEDULED' AND s.ends_at >= now()) AS upcoming_count,
          count(*) FILTER (WHERE a.status = 'SCHEDULED' AND a.consultation_type = 'ONLINE' AND s.starts_at >= b.today_start AND s.starts_at < b.tomorrow_start) AS online_today,
          count(*) FILTER (WHERE a.status = 'SCHEDULED' AND a.consultation_type = 'IN_PERSON' AND s.starts_at >= b.today_start AND s.starts_at < b.tomorrow_start) AS in_person_today,
          count(*) FILTER (WHERE a.status = 'COMPLETED' AND s.starts_at >= b.week_start AND s.starts_at < b.week_end) AS completed_this_week
        FROM public.appointments a
        JOIN public.appointment_slots s ON s.id = a.slot_id
        CROSS JOIN time_bounds b
        WHERE a.doctor_user_id = ${doctorId}::uuid
      `),
      this.prisma.$queryRaw<AppointmentDbRow[]>(Prisma.sql`
        ${this.appointmentSelect()}
        WHERE a.doctor_user_id = ${doctorId}::uuid AND a.status = 'SCHEDULED' AND s.ends_at >= now()
        ORDER BY s.starts_at ASC LIMIT 8
      `),
    ]);
    const metric = rows[0];
    return {
      upcomingCount: Number(metric?.upcoming_count ?? 0),
      onlineCount: Number(metric?.online_today ?? 0),
      inPersonCount: Number(metric?.in_person_today ?? 0),
      completedThisWeek: Number(metric?.completed_this_week ?? 0),
      appointments: appointments.map((row) => this.toAppointment(row)),
    };
  }

  async appointments(doctorId: string, status?: string) {
    const filter = this.readAppointmentFilter(status);
    const items = await this.prisma.$queryRaw<AppointmentDbRow[]>(Prisma.sql`
      ${this.appointmentSelect()}
      WHERE a.doctor_user_id = ${doctorId}::uuid
        AND (${filter} = 'ALL'
          OR (${filter} = 'UPCOMING' AND a.status = 'SCHEDULED' AND s.ends_at >= now())
          OR (${filter} = 'COMPLETED' AND a.status IN ('COMPLETED', 'NO_SHOW'))
          OR (${filter} = 'CANCELLED' AND a.status = 'CANCELLED'))
      ORDER BY
        CASE WHEN ${filter} = 'UPCOMING' THEN s.starts_at END ASC,
        CASE WHEN ${filter} <> 'UPCOMING' THEN s.starts_at END DESC
      LIMIT 500
    `);
    return { items: items.map((row) => this.toAppointment(row)) };
  }

  async patients(doctorId: string) {
    const items = await this.prisma.$queryRaw<Array<{
      id: string; name: string; appointments_count: bigint; last_visit_at: Date | null; next_appointment_at: Date | null;
    }>>(Prisma.sql`
      SELECT p.id::text AS id, p.display_name AS name,
        count(*) FILTER (WHERE a.status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW')) AS appointments_count,
        max(s.starts_at) FILTER (WHERE a.status IN ('COMPLETED', 'NO_SHOW')) AS last_visit_at,
        min(s.starts_at) FILTER (WHERE a.status = 'SCHEDULED' AND s.ends_at >= now()) AS next_appointment_at
      FROM public.appointments a
      JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.app_users p ON p.id = a.patient_user_id AND p.role = 'PATIENT' AND p.status = 'ACTIVE'
      WHERE a.doctor_user_id = ${doctorId}::uuid
      GROUP BY p.id, p.display_name
      HAVING count(*) FILTER (WHERE a.status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW')) > 0
      ORDER BY next_appointment_at ASC NULLS LAST, last_visit_at DESC NULLS LAST, p.display_name ASC
      LIMIT 500
    `);
    return { items: items.map((row) => ({
      id: row.id,
      name: row.name,
      initials: this.initials(row.name),
      appointmentsCount: Number(row.appointments_count),
      lastVisitAt: row.last_visit_at?.toISOString() ?? null,
      nextAppointmentAt: row.next_appointment_at?.toISOString() ?? null,
    })) };
  }

  async patient(doctorId: string, patientId: string) {
    const patients = await this.prisma.$queryRaw<Array<{ id: string; name: string; phone: string | null }>>(Prisma.sql`
      SELECT p.id::text AS id, p.display_name AS name, pp.phone_number AS phone
      FROM public.app_users p
      LEFT JOIN public.patient_profiles pp ON pp.app_user_id = p.id
      WHERE p.id = ${patientId}::uuid AND p.role = 'PATIENT' AND p.status = 'ACTIVE'
        AND EXISTS (SELECT 1 FROM public.appointments a WHERE a.doctor_user_id = ${doctorId}::uuid AND a.patient_user_id = p.id
          AND a.status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW'))
    `);
    if (!patients[0]) throw new NotFoundException({ code: "AUTHORIZED_PATIENT_NOT_FOUND" });
    const appointments = await this.prisma.$queryRaw<AppointmentDbRow[]>(Prisma.sql`
      ${this.appointmentSelect()}
      WHERE a.doctor_user_id = ${doctorId}::uuid AND a.patient_user_id = ${patientId}::uuid
        AND a.status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW')
      ORDER BY s.starts_at DESC LIMIT 200
    `);
    return {
      patient: { ...patients[0], initials: this.initials(patients[0].name) },
      appointments: appointments.map((row) => this.toAppointment(row)),
    };
  }

  private appointmentSelect() {
    return Prisma.sql`SELECT a.id::text AS id, a.patient_user_id::text AS patient_id,
      p.display_name AS patient_name, COALESCE(NULLIF(trim(a.reason_for_visit), ''), 'General consultation') AS reason,
      s.starts_at, s.ends_at, a.consultation_type::text AS consultation_type,
      CASE WHEN a.consultation_type = 'IN_PERSON' THEN concat_ws(' · ', c.name, c.city) ELSE NULL END AS location,
      a.status::text AS status
      FROM public.appointments a
      JOIN public.appointment_slots s ON s.id = a.slot_id
      JOIN public.app_users p ON p.id = a.patient_user_id AND p.role = 'PATIENT' AND p.status = 'ACTIVE'
      LEFT JOIN public.clinics c ON c.id = a.clinic_id`;
  }

  private readAppointmentFilter(status?: string): AppointmentFilter {
    const value = (status ?? "UPCOMING").trim().toUpperCase();
    if (!APPOINTMENT_FILTERS.includes(value as AppointmentFilter)) throw new BadRequestException({ code: "INVALID_APPOINTMENT_FILTER" });
    return value as AppointmentFilter;
  }

  private toAppointment(row: AppointmentDbRow) {
    return {
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name,
      initials: this.initials(row.patient_name),
      reason: row.reason,
      date: row.starts_at.toISOString(),
      startTime: row.starts_at.toISOString(),
      endTime: row.ends_at.toISOString(),
      consultationType: row.consultation_type,
      ...(row.location ? { location: row.location } : {}),
      status: row.status,
    };
  }

  private initials(name: string) {
    return name.split(/\s+/).map((part) => part[0] ?? "").slice(0, 2).join("").toUpperCase();
  }
}
