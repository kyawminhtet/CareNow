"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ScheduleActionState = { success?: string; error?: string };

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
