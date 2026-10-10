"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizedSession } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function authenticatedRequest(path: string, method: "POST" | "PATCH") {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return fetch(`${getApiOrigin()}${path}`, {
    method,
    headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json" },
    cache: "no-store",
  });
}

function notificationId(formData: FormData): string | null {
  const value = formData.get("notificationId");
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) return null;
  return value;
}

function inboxPath(role: string): string {
  return role === "DOCTOR" ? "/doctor/notifications" : "/admin/notifications";
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const id = notificationId(formData);
  const session = await getAuthorizedSession();
  if (!id || session.kind !== "ready") return;
  try {
    const response = await authenticatedRequest(`/v1/notifications/${encodeURIComponent(id)}/read`, "PATCH");
    if (response?.ok) revalidatePath(inboxPath(session.session.role));
  } catch {
    revalidatePath(inboxPath(session.session.role));
  }
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await getAuthorizedSession();
  if (session.kind !== "ready") return;
  try {
    const response = await authenticatedRequest("/v1/notifications/read-all", "PATCH");
    if (response?.ok) revalidatePath(inboxPath(session.session.role));
  } catch {
    revalidatePath(inboxPath(session.session.role));
  }
}

export async function openNotificationAction(formData: FormData): Promise<void> {
  const id = notificationId(formData);
  const session = await getAuthorizedSession();
  if (!id || session.kind !== "ready") redirect("/sign-in");
  const role = session.session.role;
  const inbox = inboxPath(role);
  try {
    const response = await authenticatedRequest(`/v1/notifications/${encodeURIComponent(id)}/open`, "POST");
    if (!response?.ok) redirect(`${inbox}?target=unavailable`);
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || !("targetType" in payload) || !("targetId" in payload)) redirect(`${inbox}?target=unavailable`);
    const targetType = payload.targetType;
    const targetId = payload.targetId;
    if (typeof targetType !== "string" || typeof targetId !== "string" || !/^[0-9a-f-]{36}$/i.test(targetId)) redirect(`${inbox}?target=unavailable`);
    const targetPath = role === "DOCTOR" ? {
      APPOINTMENT: `/doctor/appointments/${targetId}`,
      CONSULTATION: `/doctor/consultations/${targetId}`,
      MESSAGE: `/doctor/messages/${targetId}`,
      VERIFICATION: "/doctor/verification",
      ACCOUNT: "/doctor/profile",
      AVAILABILITY: "/doctor/availability",
    }[targetType] : {
      APPOINTMENT: "/admin/appointments",
      DOCTOR_VERIFICATION: `/admin/doctors/${targetId}`,
      SCHEDULE: "/admin/schedules",
      REPORT: "/admin/reports",
      SETTINGS: "/admin/settings",
      OPERATIONAL_ISSUE: "/admin/consultations",
    }[targetType];
    if (targetPath) redirect(targetPath);
  } catch (cause) {
    if (cause instanceof Error && cause.message === "NEXT_REDIRECT") throw cause;
  }
  redirect(`${inbox}?target=unavailable`);
}
