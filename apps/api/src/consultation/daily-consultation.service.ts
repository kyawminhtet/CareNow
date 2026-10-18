import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type ConsultationRole = "DOCTOR" | "PATIENT";
type AppointmentRow = {
  id: string;
  status: string;
  consultation_type: string;
  starts_at: Date;
  ends_at: Date;
  patient_name: string;
  doctor_name: string;
};
type DailyRoom = { name?: string; url?: string };
type DailyToken = { token?: string };

const EARLY_JOIN_MS = 15 * 60 * 1000;
const AFTER_END_MS = 90 * 60 * 1000;
const TOKEN_LIFETIME_SECONDS = 20 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DailyConsultationService {
  constructor(private readonly prisma: PrismaService) {}

  async issueJoinToken(appointmentId: string, userId: string, role: ConsultationRole) {
    if (!UUID_PATTERN.test(appointmentId)) throw new BadRequestException({ code: "INVALID_APPOINTMENT_ID" });
    const appointment = await this.findAuthorizedAppointment(appointmentId, userId, role);
    if (!appointment) throw new NotFoundException({ code: "CONSULTATION_APPOINTMENT_NOT_FOUND" });
    if (appointment.consultation_type !== "ONLINE") throw new ConflictException({ code: "ONLINE_CONSULTATION_REQUIRED" });
    if (appointment.status !== "SCHEDULED") throw new ConflictException({ code: "CONSULTATION_NOT_SCHEDULED" });

    const now = Date.now();
    const opensAt = appointment.starts_at.getTime() - EARLY_JOIN_MS;
    const closesAt = appointment.ends_at.getTime() + AFTER_END_MS;
    if (now < opensAt) throw new ConflictException({ code: "CONSULTATION_NOT_OPEN_YET", availableAt: new Date(opensAt).toISOString() });
    if (now > closesAt) throw new ConflictException({ code: "CONSULTATION_WINDOW_CLOSED" });

    const { apiKey, domain } = this.dailyConfiguration();
    const roomName = `carenow-${appointment.id.replaceAll("-", "")}`;
    const roomExpiresAt = Math.floor(closesAt / 1000);
    const room = await this.ensureRoom({ apiKey, domain, roomName, opensAt: Math.floor(opensAt / 1000), expiresAt: roomExpiresAt });
    const expiresAtSeconds = Math.min(Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS, roomExpiresAt);
    const token = await this.createMeetingToken({
      apiKey,
      roomName,
      userId,
      userName: role === "DOCTOR" ? appointment.doctor_name : appointment.patient_name,
      role,
      notBefore: Math.max(Math.floor(now / 1000) - 5, Math.floor(opensAt / 1000)),
      expiresAt: expiresAtSeconds,
    });

    return {
      appointmentId: appointment.id,
      roomUrl: room.url,
      token,
      userName: role === "DOCTOR" ? appointment.doctor_name : appointment.patient_name,
      role,
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    };
  }

  private async findAuthorizedAppointment(appointmentId: string, userId: string, role: ConsultationRole) {
    const rows = role === "DOCTOR"
      ? await this.prisma.$queryRaw<AppointmentRow[]>(Prisma.sql`
          SELECT a.id::text AS id, a.status::text AS status, a.consultation_type::text AS consultation_type,
            s.starts_at, s.ends_at, patient.display_name AS patient_name, doctor.display_name AS doctor_name
          FROM public.appointments a
          JOIN public.appointment_slots s ON s.id = a.slot_id
          JOIN public.app_users patient ON patient.id = a.patient_user_id AND patient.role = 'PATIENT' AND patient.status = 'ACTIVE'
          JOIN public.app_users doctor ON doctor.id = a.doctor_user_id AND doctor.role = 'DOCTOR' AND doctor.status = 'ACTIVE'
          JOIN public.doctor_profiles dp ON dp.app_user_id = doctor.id AND dp.verification_status = 'VERIFIED'
          WHERE a.id = ${appointmentId}::uuid AND a.doctor_user_id = ${userId}::uuid LIMIT 1`)
      : await this.prisma.$queryRaw<AppointmentRow[]>(Prisma.sql`
          SELECT a.id::text AS id, a.status::text AS status, a.consultation_type::text AS consultation_type,
            s.starts_at, s.ends_at, patient.display_name AS patient_name, doctor.display_name AS doctor_name
          FROM public.appointments a
          JOIN public.appointment_slots s ON s.id = a.slot_id
          JOIN public.app_users patient ON patient.id = a.patient_user_id AND patient.role = 'PATIENT' AND patient.status = 'ACTIVE'
          JOIN public.app_users doctor ON doctor.id = a.doctor_user_id AND doctor.role = 'DOCTOR' AND doctor.status = 'ACTIVE'
          JOIN public.doctor_profiles dp ON dp.app_user_id = doctor.id AND dp.verification_status = 'VERIFIED'
          WHERE a.id = ${appointmentId}::uuid AND a.patient_user_id = ${userId}::uuid LIMIT 1`);
    return rows[0] ?? null;
  }

  private dailyConfiguration() {
    const apiKey = process.env.DAILY_API_KEY?.trim();
    let domain = process.env.DAILY_DOMAIN?.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
    if (domain && /^[a-z0-9-]+$/.test(domain)) domain = `${domain}.daily.co`;
    if (!apiKey || !domain || !/^[a-z0-9-]+\.daily\.co$/.test(domain)) {
      throw new ServiceUnavailableException({ code: "DAILY_NOT_CONFIGURED" });
    }
    return { apiKey, domain };
  }

  private async ensureRoom(input: { apiKey: string; domain: string; roomName: string; opensAt: number; expiresAt: number }) {
    const path = `/rooms/${encodeURIComponent(input.roomName)}`;
    try {
      return this.validRoom(await this.dailyRequest<DailyRoom>(`${path}`, input.apiKey), input);
    } catch (error) {
      if (!(error instanceof DailyHttpError) || error.status !== 404) throw this.providerUnavailable(error);
    }

    try {
      const room = await this.dailyRequest<DailyRoom>("/rooms", input.apiKey, {
        method: "POST",
        body: JSON.stringify({
          name: input.roomName,
          privacy: "private",
          properties: {
            nbf: input.opensAt,
            exp: input.expiresAt,
            max_participants: 2,
            enable_prejoin_ui: true,
            enable_chat: false,
            enable_knocking: false,
            enable_screenshare: true,
            eject_at_room_exp: true,
          },
        }),
      });
      return this.validRoom(room, input);
    } catch (error) {
      // Another caller may have created this appointment room after our GET.
      try {
        return this.validRoom(await this.dailyRequest<DailyRoom>(path, input.apiKey), input);
      } catch {
        throw this.providerUnavailable(error);
      }
    }
  }

  private async createMeetingToken(input: {
    apiKey: string; roomName: string; userId: string; userName: string;
    role: ConsultationRole; notBefore: number; expiresAt: number;
  }) {
    try {
      const result = await this.dailyRequest<DailyToken>("/meeting-tokens", input.apiKey, {
        method: "POST",
        body: JSON.stringify({ properties: {
          room_name: input.roomName,
          user_id: input.userId,
          user_name: input.userName.slice(0, 120),
          is_owner: input.role === "DOCTOR",
          nbf: input.notBefore,
          exp: input.expiresAt,
          eject_at_token_exp: false,
          enable_screenshare: input.role === "DOCTOR",
          enable_prejoin_ui: true,
          enable_recording_ui: false,
          start_cloud_recording: false,
        } }),
      });
      if (!result.token) throw new Error("Daily token response omitted the token");
      return result.token;
    } catch (error) {
      throw this.providerUnavailable(error);
    }
  }

  private async dailyRequest<T>(path: string, apiKey: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`https://api.daily.co/v1${path}`, {
        ...init,
        signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", accept: "application/json", ...init.headers },
      });
      if (!response.ok) throw new DailyHttpError(response.status, `Daily returned HTTP ${response.status}`);
      return await response.json() as T;
    } catch (error) {
      if (error instanceof DailyHttpError) throw error;
      throw new DailyHttpError(0, error instanceof Error ? error.message : "Daily request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  private validRoom(room: DailyRoom, input: { domain: string; roomName: string }) {
    let url: URL;
    try { url = new URL(room.url ?? ""); } catch { throw this.providerUnavailable(new Error("Daily room URL is missing")); }
    if (url.protocol !== "https:" || url.hostname !== input.domain || room.name !== input.roomName) {
      throw this.providerUnavailable(new Error("Daily returned an unexpected room identity"));
    }
    return { name: room.name, url: url.toString() };
  }

  private providerUnavailable(_error: unknown) {
    return new ServiceUnavailableException({ code: "DAILY_PROVIDER_UNAVAILABLE" });
  }
}

class DailyHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
