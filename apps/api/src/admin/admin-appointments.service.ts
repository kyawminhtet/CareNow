import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const STATUSES = ["SCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;
const TYPES = ["ONLINE", "IN_PERSON"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type AppointmentFilters = { status?: string; type?: string; doctorId?: string; from?: string; to?: string };
type AppointmentDbRow = {
  id: string;
  patient_reference: string;
  doctor_id: string;
  doctor_name: string;
  starts_at: Date;
  ends_at: Date;
  consultation_type: "ONLINE" | "IN_PERSON";
  clinic_name: string | null;
  clinic_address: string | null;
  clinic_city: string | null;
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  created_at: Date;
};

@Injectable()
export class AdminAppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: AppointmentFilters) {
    const query = this.readFilters(filters);
    const [rows, doctorRows] = await Promise.all([
      this.prisma.$queryRaw<AppointmentDbRow[]>(Prisma.sql`
        SELECT ${this.selectColumns()}
          FROM public.appointments a
          JOIN public.appointment_slots s ON s.id = a.slot_id
          JOIN public.app_users doctor ON doctor.id = a.doctor_user_id AND doctor.role = 'DOCTOR'
          LEFT JOIN public.clinics clinic ON clinic.id = a.clinic_id
         WHERE (${query.status}::text IS NULL OR a.status::text = ${query.status})
           AND (${query.type}::text IS NULL OR a.consultation_type::text = ${query.type})
           AND (${query.doctorId}::uuid IS NULL OR a.doctor_user_id = ${query.doctorId}::uuid)
           AND (${query.from}::date IS NULL OR s.starts_at >= (${query.from}::date::timestamp AT TIME ZONE 'Asia/Yangon'))
           AND (${query.to}::date IS NULL OR s.starts_at < ((${query.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Yangon'))
         ORDER BY s.starts_at DESC
         LIMIT 500
      `),
      this.prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
        SELECT DISTINCT doctor.id::text AS id, doctor.display_name AS name
          FROM public.appointments a
          JOIN public.app_users doctor ON doctor.id = a.doctor_user_id AND doctor.role = 'DOCTOR'
         ORDER BY doctor.display_name ASC
      `),
    ]);
    return { items: rows.map((row) => this.toItem(row)), doctors: doctorRows };
  }

  async get(appointmentId: string) {
    if (!UUID.test(appointmentId)) throw new BadRequestException({ code: "INVALID_APPOINTMENT_ID" });
    const rows = await this.prisma.$queryRaw<AppointmentDbRow[]>(Prisma.sql`
      SELECT ${this.selectColumns()}
        FROM public.appointments a
        JOIN public.appointment_slots s ON s.id = a.slot_id
        JOIN public.app_users doctor ON doctor.id = a.doctor_user_id AND doctor.role = 'DOCTOR'
        LEFT JOIN public.clinics clinic ON clinic.id = a.clinic_id
       WHERE a.id = ${appointmentId}::uuid
       LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException({ code: "APPOINTMENT_NOT_FOUND" });
    return { item: this.toItem(rows[0]) };
  }

  private selectColumns() {
    return Prisma.sql`a.id::text AS id,
      'PT-' || upper(substr(a.patient_user_id::text, 1, 8)) AS patient_reference,
      doctor.id::text AS doctor_id, doctor.display_name AS doctor_name,
      s.starts_at, s.ends_at, a.consultation_type::text AS consultation_type,
      clinic.name AS clinic_name, clinic.address AS clinic_address, clinic.city AS clinic_city,
      a.status::text AS status, a.created_at`;
  }

  private readFilters(filters: AppointmentFilters) {
    const status = filters.status?.trim().toUpperCase() ?? "ALL";
    const type = filters.type?.trim().toUpperCase() ?? "ALL";
    const doctorId = filters.doctorId?.trim() || null;
    const from = this.date(filters.from, "FROM");
    const to = this.date(filters.to, "TO");
    if (status !== "ALL" && !STATUSES.includes(status as (typeof STATUSES)[number])) {
      throw new BadRequestException({ code: "INVALID_APPOINTMENT_STATUS_FILTER" });
    }
    if (type !== "ALL" && !TYPES.includes(type as (typeof TYPES)[number])) {
      throw new BadRequestException({ code: "INVALID_CONSULTATION_TYPE_FILTER" });
    }
    if (doctorId && !UUID.test(doctorId)) throw new BadRequestException({ code: "INVALID_DOCTOR_ID" });
    if (from && to && from > to) throw new BadRequestException({ code: "INVALID_APPOINTMENT_DATE_RANGE" });
    return { status: status === "ALL" ? null : status, type: type === "ALL" ? null : type, doctorId, from, to };
  }

  private date(value: string | undefined, suffix: string) {
    if (!value) return null;
    if (!DATE.test(value)) throw new BadRequestException({ code: `INVALID_APPOINTMENT_DATE_${suffix}` });
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException({ code: `INVALID_APPOINTMENT_DATE_${suffix}` });
    }
    return value;
  }

  private toItem(row: AppointmentDbRow) {
    return {
      id: row.id,
      patientReference: row.patient_reference,
      doctorId: row.doctor_id,
      doctorName: row.doctor_name,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
      consultationType: row.consultation_type,
      clinicName: row.clinic_name,
      clinicAddress: row.clinic_address,
      clinicCity: row.clinic_city,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    };
  }
}
