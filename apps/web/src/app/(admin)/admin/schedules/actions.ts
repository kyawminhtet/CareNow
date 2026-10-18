"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ScheduleActionState = { success?: string; error?: string };
export type WeeklyScheduleInput = { doctorId: string; startDate: string; endDate: string; weekdays: number[]; startTime: string; endTime: string; slotMinutes: number };
export type WeeklyPreviewItem = { startsAt: string; endsAt: string; conflict: boolean };
export type WeeklyPreviewState = { input?: WeeklyScheduleInput; items?: WeeklyPreviewItem[]; total?: number; consultationType?: "ONLINE" | "IN_PERSON"; clinicName?: string | null; error?: string };

export async function createSlotAction(_previous: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const values = readValues(formData);
  if ("error" in values) return values;
  return sendRequest("POST", "/v1/web/admin/schedules", values, "Timeslot created.");
}

export async function updateSlotAction(slotId: string, _previous: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const values = readValues(formData);
  if ("error" in values) return values;
  const status = formData.get("status");
  if (status !== "OPEN" && status !== "BLOCKED") return { error: "Choose a valid timeslot status." };
  return sendRequest("PATCH", `/v1/web/admin/schedules/${encodeURIComponent(slotId)}`, { ...values, status }, "Timeslot updated.");
}

export async function deleteSlotAction(slotId: string, _previous: ScheduleActionState, _formData: FormData): Promise<ScheduleActionState> {
  return sendRequest("DELETE", `/v1/web/admin/schedules/${encodeURIComponent(slotId)}`, undefined, "Timeslot deleted.");
}

export async function previewWeeklyScheduleAction(_previous: WeeklyPreviewState, formData: FormData): Promise<WeeklyPreviewState> {
  const input = readWeeklyInput(formData);
  if ("error" in input) return input;
  await requireRole("ADMINISTRATOR");
  const response = await sendWeeklyRequest("/v1/web/admin/schedules/weekly/preview", input);
  if ("error" in response) return response;
  return { input, ...response };
}

export async function createWeeklySlotsAction(_previous: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const serialized = field(formData, "weeklyInput");
  let input: unknown;
  try { input = JSON.parse(serialized); } catch { return { error: "Preview the weekly schedule again before creating slots." }; }
  await requireRole("ADMINISTRATOR");
  const result = await sendWeeklyRequest("/v1/web/admin/schedules/weekly", input);
  if ("error" in result) return result;
  revalidatePath("/admin/schedules");
  revalidatePath("/admin/dashboard");
  return { success: `Created ${result.total} timeslots.` };
}

function readWeeklyInput(formData: FormData): WeeklyScheduleInput | { error: string } {
  const doctorId = field(formData, "doctorId");
  const startDate = field(formData, "startDate");
  const endDate = field(formData, "endDate");
  const startTime = field(formData, "startTime");
  const endTime = field(formData, "endTime");
  const weekdays = formData.getAll("weekdays").map(Number);
  const slotMinutes = Number(field(formData, "slotMinutes"));
  if (!doctorId || !startDate || !endDate || weekdays.length === 0 || !startTime || !endTime) return { error: "Choose a doctor, date range, working days and hours." };
  if (![15, 30, 45, 60].includes(slotMinutes)) return { error: "Choose a valid appointment duration." };
  return { doctorId, startDate, endDate, weekdays, startTime, endTime, slotMinutes };
}

async function sendWeeklyRequest(path: string, body: unknown): Promise<WeeklyPreviewState | { total: number } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "CareNow authentication is unavailable." };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Your administrator session expired. Sign in again." };
  try {
    const response = await fetch(`${getApiOrigin()}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (response.ok) {
      const result = await response.json() as Record<string, unknown>;
      if (path.endsWith("/preview") && Array.isArray(result.items) && typeof result.total === "number" &&
          (result.consultationType === "ONLINE" || result.consultationType === "IN_PERSON")) {
        return { items: result.items as WeeklyPreviewItem[], total: result.total, consultationType: result.consultationType,
          clinicName: typeof result.clinicName === "string" ? result.clinicName : null };
      }
      if (!path.endsWith("/preview") && typeof result.total === "number") return { total: result.total };
      return { error: "The CareNow API returned an invalid schedule preview." };
    }
    if (response.status === 401 || response.status === 403) return { error: "Only an active administrator can manage timeslots." };
    if (response.status === 404) return { error: "The selected active doctor could not be found." };
    if (response.status === 409) return { error: "One or more timeslots now overlap existing slots. Preview the schedule again." };
    if (response.status === 400) return { error: "Review the date range, working hours, duration, and the doctor's active clinic assignment." };
    return { error: "Weekly timeslot generation is unavailable. Try again shortly." };
  } catch {
    return { error: "Weekly timeslot generation is unavailable until the CareNow API is connected." };
  }
}

function readValues(formData: FormData) {
  const doctorId = field(formData, "doctorId");
  const consultationType = field(formData, "consultationType");
  const clinicId = field(formData, "clinicId") || null;
  const startsAt = toYangonIso(field(formData, "startsAt"));
  const endsAt = toYangonIso(field(formData, "endsAt"));
  if (!doctorId) return { error: "Select a doctor." };
  if (consultationType !== "ONLINE" && consultationType !== "IN_PERSON") return { error: "Choose a consultation type." };
  if (consultationType === "IN_PERSON" && !clinicId) return { error: "Select the assigned clinic for an in-person timeslot." };
  if (consultationType === "ONLINE" && clinicId) return { error: "Online timeslots do not use a clinic." };
  if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return { error: "Enter valid future start and end times." };
  return { doctorId, consultationType, clinicId, startsAt, endsAt };
}

function toYangonIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute) return null;
  return new Date(local.getTime() - (6 * 60 + 30) * 60_000).toISOString();
}

async function sendRequest(method: "POST" | "PATCH" | "DELETE", path: string, body: unknown, success: string): Promise<ScheduleActionState> {
  await requireRole("ADMINISTRATOR");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "CareNow authentication is unavailable." };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Your administrator session expired. Sign in again." };
  try {
    const response = await fetch(`${getApiOrigin()}${path}`, {
      method,
      headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
    if (response.ok) {
      revalidatePath("/admin/schedules");
      revalidatePath("/admin/dashboard");
      return { success };
    }
    if (response.status === 401 || response.status === 403) return { error: "Only an active administrator can manage timeslots." };
    if (response.status === 404) return { error: "The selected doctor or timeslot could not be found." };
    if (response.status === 409) return { error: "This timeslot overlaps another slot or is already booked. Refresh and review the schedule." };
    if (response.status === 400) return { error: "Review the doctor, clinic, consultation type and time range." };
    return { error: "We could not save the timeslot. Try again shortly." };
  } catch {
    return { error: "Timeslot management is unavailable until the CareNow API is connected." };
  }
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
