"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AvailabilityActionState = { success?: string; error?: string };

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export async function setAvailabilityAction(_previous: AvailabilityActionState, formData: FormData): Promise<AvailabilityActionState> {
  await requireRole("DOCTOR");
  const slotMinutes = Number(formData.get("slotMinutes"));
  if (![15, 30, 45, 60].includes(slotMinutes)) return { error: "Choose a valid appointment duration." };

  const days: Array<{ weekday: number; startTime: string; endTime: string }> = [];
  for (let weekday = 0; weekday < dayNames.length; weekday += 1) {
    if (formData.get(`day-${weekday}`) !== "on") continue;
    const startTime = field(formData, `start-${weekday}`);
    const endTime = field(formData, `end-${weekday}`);
    if (!validTime(startTime) || !validTime(endTime) || startTime >= endTime) {
      return { error: `Choose valid start and end times for ${dayNames[weekday]}.` };
    }
    days.push({ weekday, startTime, endTime });
  }
  if (days.length === 0) return { error: "Select at least one available day." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "CareNow authentication is unavailable." };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Your doctor session expired. Sign in again." };

  try {
    const response = await fetch(`${getApiOrigin()}/v1/web/doctor/availability`, {
      method: "PUT",
      headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ days, slotMinutes }),
      cache: "no-store",
    });
    if (response.ok) {
      revalidatePath("/doctor/availability");
      revalidatePath("/doctor/dashboard");
      return { success: "Your weekly availability has been saved." };
    }
    if (response.status === 401 || response.status === 403) return { error: "Only active, verified doctors with online consultations enabled can set availability." };
    if (response.status === 400) return { error: "Review the selected days, times, and appointment duration." };
    return { error: "We could not save your availability. Try again shortly." };
  } catch {
    return { error: "Availability cannot be saved until the CareNow API is connected." };
  }
}

function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
