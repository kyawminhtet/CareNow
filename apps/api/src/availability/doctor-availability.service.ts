import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type AvailabilityDayInput = { weekday: number; startTime: string; endTime: string };

@Injectable()
export class DoctorAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getWeeklySchedule(doctorUserId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      weekday: number;
      startTime: string;
      endTime: string;
      slotMinutes: number;
    }>>`
      SELECT id::text, weekday::int, to_char(local_start, 'HH24:MI') AS "startTime",
             to_char(local_end, 'HH24:MI') AS "endTime", slot_minutes::int AS "slotMinutes"
        FROM public.availability_rules
       WHERE doctor_user_id = ${doctorUserId}::uuid
         AND consultation_type = 'ONLINE'::public.consultation_type
         AND clinic_id IS NULL
         AND is_active = true
         AND effective_from <= CURRENT_DATE
         AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
       ORDER BY weekday, local_start
    `;
    return { items: rows };
  }

  async setWeeklySchedule(doctorUserId: string, body: unknown) {
    const input = this.readInput(body);
    const onlineService = await this.prisma.doctorService.findFirst({
      where: { doctorUserId, consultationType: "ONLINE", isActive: true },
      select: { id: true },
    });
    if (!onlineService) throw new ForbiddenException({ code: "ONLINE_SERVICE_NOT_ENABLED" });

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE public.availability_rules
           SET is_active = false
         WHERE doctor_user_id = ${doctorUserId}::uuid
           AND consultation_type = 'ONLINE'::public.consultation_type
           AND clinic_id IS NULL
           AND is_active = true
      `;

      for (const day of input.days) {
        await tx.$executeRaw`
          INSERT INTO public.availability_rules
            (doctor_user_id, consultation_type, clinic_id, weekday, local_start, local_end,
             effective_from, slot_minutes, is_active)
          VALUES (${doctorUserId}::uuid, 'ONLINE'::public.consultation_type, NULL,
            ${day.weekday}::smallint, ${day.startTime}::time, ${day.endTime}::time,
            CURRENT_DATE, ${input.slotMinutes}::smallint, true)
        `;
      }

      await tx.$executeRaw`
        INSERT INTO public.audit_events (actor_user_id, action, target_type, target_id, metadata)
        VALUES (${doctorUserId}::uuid, 'DOCTOR_AVAILABILITY_UPDATED', 'DOCTOR', ${doctorUserId}::uuid,
          ${JSON.stringify({ dayCount: input.days.length, slotMinutes: input.slotMinutes })}::jsonb)
      `;
    });

    return { updated: true, ...await this.getWeeklySchedule(doctorUserId) };
  }

  private readInput(value: unknown): { days: AvailabilityDayInput[]; slotMinutes: number } {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new BadRequestException({ code: "INVALID_REQUEST_BODY" });
    }
    const input = value as Record<string, unknown>;
    const slotMinutes = input.slotMinutes;
    if (typeof slotMinutes !== "number" || ![15, 30, 45, 60].includes(slotMinutes)) {
      throw new BadRequestException({ code: "INVALID_SLOT_DURATION" });
    }
    if (!Array.isArray(input.days) || input.days.length === 0 || input.days.length > 7) {
      throw new BadRequestException({ code: "AVAILABILITY_DAYS_REQUIRED" });
    }
    const days = input.days.map((candidate): AvailabilityDayInput => {
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        throw new BadRequestException({ code: "INVALID_AVAILABILITY_DAY" });
      }
      const day = candidate as Record<string, unknown>;
      if (typeof day.weekday !== "number" || !Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6 ||
        typeof day.startTime !== "string" || typeof day.endTime !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.endTime) ||
        day.startTime >= day.endTime) {
        throw new BadRequestException({ code: "INVALID_AVAILABILITY_DAY" });
      }
      return { weekday: day.weekday, startTime: day.startTime, endTime: day.endTime };
    });
    if (new Set(days.map((day) => day.weekday)).size !== days.length) {
      throw new BadRequestException({ code: "DUPLICATE_AVAILABILITY_DAY" });
    }
    return { days, slotMinutes };
  }
}
