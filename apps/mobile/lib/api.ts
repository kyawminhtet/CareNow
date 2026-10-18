import { supabase } from "./supabase";
import Constants from "expo-constants";
import * as Device from "expo-device";

const configuredBaseUrl = process.env.EXPO_PUBLIC_CARENOW_API_URL || "http://localhost:4000/v1";
const baseUrl = (() => {
  const configured = new URL(configuredBaseUrl);
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(configured.hostname);
  const expoHost = Constants.expoConfig?.hostUri;
  if (Device.isDevice && localHost && expoHost) {
    try {
      configured.hostname = new URL(`http://${expoHost}`).hostname;
    } catch {
      // Keep the configured URL when Expo does not expose a usable LAN host.
    }
  }
  return configured.toString().replace(/\/$/, "");
})();
export type Doctor = { id: string; name: string; specialty: string; biography: string; experienceYears: number | null; qualifications: string | null; languages: string[]; services: string[]; clinicNames: string[]; nextAvailableAt: string | null; profilePhotoUrl?: string | null };
export type Specialty = { id: string; name: string; photoUrl: string | null };
export type Slot = { id: string; startsAt: string; endsAt: string; clinicId: string | null; clinicName: string | null };
export type Appointment = { id: string; doctorId: string; status: string; consultationType: "ONLINE" | "IN_PERSON"; startsAt: string; endsAt: string; doctorName: string; specialty: string; clinicName: string | null; clinicAddress: string | null; clinicCity: string | null; reasonForVisit?: string | null };
export type ChatConversation = { id: string; appointmentId: string; appointmentStatus: string; consultationType: "ONLINE" | "IN_PERSON"; startsAt: string; endsAt: string; patientName: string; doctorName: string; doctorPhotoUrl: string | null; specialty: string; clinicName: string | null; lastMessageAt: string | null; lastMessage: string | null; unreadCount: number; participantRole: "PATIENT" | "DOCTOR"; availableAt: string; readOnlyAt: string; canSend: boolean; readOnly: boolean };
export type ChatMessage = { id: string; senderName: string; content: string; createdAt: string; readAt: string | null; isMine: boolean };

export const doctorDisplayName = (name: string) => `Dr. ${name.trim().replace(/^(?:dr\.?\s*)+/i, "").trim()}`;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}), ...init.headers },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = payload?.code || payload?.message || "REQUEST_FAILED";
      throw new Error(typeof code === "string" ? code : "REQUEST_FAILED");
    }
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("CARENOW_API_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const dateTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Yangon" }).format(new Date(value));
export const localISODate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
