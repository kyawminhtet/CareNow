"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClinicAssignmentActionState = { success?: string; error?: string };

export async function createClinicAssignmentAction(_previous: ClinicAssignmentActionState, formData: FormData): Promise<ClinicAssignmentActionState> {
  const doctorId = field(formData, "doctorId");
  const clinicId = field(formData, "clinicId");
  if (!doctorId || !clinicId) return { error: "Select a doctor and clinic." };
  return send("POST", "/v1/web/admin/doctor-clinics", { doctorId, clinicId, isPrimary: formData.get("isPrimary") === "true" }, "Clinic assigned to doctor.");
}

export async function primaryClinicAction(doctorId: string, clinicId: string, isPrimary: boolean, _previous: ClinicAssignmentActionState, _formData: FormData): Promise<ClinicAssignmentActionState> {
  return send("PATCH", `/v1/web/admin/doctor-clinics/${encodeURIComponent(doctorId)}/${encodeURIComponent(clinicId)}`, { isPrimary }, isPrimary ? "Primary clinic updated." : "Primary clinic cleared.");
}

export async function deleteClinicAssignmentAction(doctorId: string, clinicId: string, _previous: ClinicAssignmentActionState, _formData: FormData): Promise<ClinicAssignmentActionState> {
  return send("DELETE", `/v1/web/admin/doctor-clinics/${encodeURIComponent(doctorId)}/${encodeURIComponent(clinicId)}`, undefined, "Clinic assignment removed.");
}

async function send(method: "POST" | "PATCH" | "DELETE", path: string, body: unknown, success: string): Promise<ClinicAssignmentActionState> {
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
      revalidatePath("/admin/schedules/clinics");
      revalidatePath("/admin/schedules");
      return { success };
    }
    if (response.status === 401 || response.status === 403) return { error: "Only an active administrator can manage clinic assignments." };
    if (response.status === 404) return { error: "The doctor or clinic could not be found. Refresh and try again." };
    if (response.status === 409) return { error: "This clinic is already assigned, or schedules still use it. Remove its availability rules and unbooked slots first." };
    if (response.status === 400) return { error: "Review the selected doctor and clinic." };
    return { error: "We could not save the clinic assignment. Try again shortly." };
  } catch {
    return { error: "Clinic assignment management is unavailable until the CareNow API is connected." };
  }
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
