"use server";

import { requireRole } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminDoctorRegistrationState = { error?: string; invitedEmail?: string };

export async function inviteDoctorAction(_previous: AdminDoctorRegistrationState, formData: FormData): Promise<AdminDoctorRegistrationState> {
  await requireRole("ADMINISTRATOR");
  const email = readField(formData, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid doctor email address." };
  const services = formData.getAll("services").filter((value): value is string => value === "ONLINE" || value === "IN_PERSON");
  if (services.length === 0) return { error: "Select at least one consultation service." };
  if (formData.get("termsAccepted") !== "on") return { error: "Confirm the doctor information and consent before sending the invitation." };
  for (const name of ["licenseDocument", "qualificationDocument", "identityDocument"]) {
    const file = formData.get(name);
    if (!(file instanceof File) || file.size === 0) return { error: "Upload the license, qualification and identity documents." };
    if (file.size > 10 * 1024 * 1024) return { error: "Each verification document must be 10 MB or smaller." };
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return { error: "Use PDF, JPG or PNG files for verification documents." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "CareNow authentication is unavailable." };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Your administrator session expired. Sign in again." };
  try {
    const response = await fetch(`${getApiOrigin()}/v1/web/admin/doctors/invitations`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json" },
      body: formData,
      cache: "no-store",
    });
    if (response.status === 201 || response.status === 202) return { invitedEmail: email };
    if (response.status === 401 || response.status === 403) return { error: "Your account does not have permission to invite doctors." };
    if (response.status === 409) return { error: "An account or doctor registration already exists for this email or license." };
    if (response.status === 503) return { error: "Private document storage is not configured on the CareNow API." };
    if (response.status === 400 || response.status === 413 || response.status === 422) return { error: "Some registration details or documents need attention. Review the form and try again." };
    return { error: "We could not create the doctor invitation. Try again shortly." };
  } catch {
    return { error: "Doctor invitations are unavailable until the CareNow API is connected." };
  }
}

function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
