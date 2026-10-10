"use server";

import { requireRole } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type DoctorAdminActionState = { success?: string; error?: string };

export async function updateDoctorProfileAction(doctorId: string, _previous: DoctorAdminActionState, formData: FormData): Promise<DoctorAdminActionState> {
  const values = {
    fullName: field(formData, "fullName"), specialty: field(formData, "specialty"), licenseNumber: field(formData, "licenseNumber"),
    licenseRegion: field(formData, "licenseRegion"), licenseExpiry: field(formData, "licenseExpiry"), phone: field(formData, "phone"),
    qualifications: field(formData, "qualifications"), experienceYears: Number(field(formData, "experienceYears")),
    languages: field(formData, "languages").split(",").map((value) => value.trim()).filter(Boolean),
    services: formData.getAll("services").filter((value): value is string => value === "ONLINE" || value === "IN_PERSON"),
  };
  if (Object.values(values).some((value) => value === "") || !values.languages.length || !values.services.length) {
    return { error: "Complete every required profile field and select at least one service." };
  }
  return apiMutation(doctorId, "PATCH", values, "Profile updated.");
}

export async function updateDoctorVerificationAction(doctorId: string, _previous: DoctorAdminActionState, formData: FormData): Promise<DoctorAdminActionState> {
  const action = field(formData, "action");
  const reason = field(formData, "reason");
  if (!["APPROVE", "REJECT", "REQUEST_INFORMATION"].includes(action)) return { error: "Choose a valid verification action." };
  if (action !== "APPROVE" && reason.length < 5) return { error: "Enter a reason with at least five characters." };
  return apiMutation(doctorId, "PATCH", { action, reason }, action === "APPROVE" ? "Doctor verification approved." : action === "REJECT" ? "Doctor verification rejected." : "Information request sent.", "verification");
}

export async function updateDoctorAccountAction(doctorId: string, _previous: DoctorAdminActionState, formData: FormData): Promise<DoctorAdminActionState> {
  const status = field(formData, "status");
  if (!["ACTIVE", "SUSPENDED", "INACTIVE"].includes(status)) return { error: "Choose a valid account status." };
  return apiMutation(doctorId, "PATCH", { status }, `Account status changed to ${status.toLowerCase()}.`, "account-status");
}

export async function deactivateDoctorAction(doctorId: string, _previous: DoctorAdminActionState, _formData: FormData): Promise<DoctorAdminActionState> {
  return apiMutation(doctorId, "DELETE", undefined, "Doctor account deactivated.");
}

async function apiMutation(doctorId: string, method: "PATCH" | "DELETE", body: unknown, success: string, suffix = ""): Promise<DoctorAdminActionState> {
  await requireRole("ADMINISTRATOR");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "CareNow authentication is unavailable." };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Your administrator session expired. Sign in again." };
  const route = `/v1/web/admin/doctors/${encodeURIComponent(doctorId)}${suffix ? `/${suffix}` : ""}`;
  try {
    const response = await fetch(`${getApiOrigin()}${route}`, {
      method,
      headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
    if (response.ok) {
      revalidatePath("/admin/dashboard");
      revalidatePath("/admin/doctors");
      revalidatePath(`/admin/doctors/${encodeURIComponent(doctorId)}`);
      return { success };
    }
    if (response.status === 401 || response.status === 403) return { error: "Your account does not have permission to manage doctors." };
    if (response.status === 404) return { error: "This doctor account could not be found." };
    if (response.status === 409) return { error: "The change conflicts with existing doctor records." };
    return { error: "We could not save the doctor changes. Review the details and try again." };
  } catch {
    return { error: "Doctor management is unavailable until the CareNow API is connected." };
  }
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
