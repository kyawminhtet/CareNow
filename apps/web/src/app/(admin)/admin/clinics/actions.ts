"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClinicActionState = { success?: string; error?: string };
type ClinicFields = { name: string; address: string; city: string };

export async function createClinicAction(_previous: ClinicActionState, formData: FormData): Promise<ClinicActionState> {
  const fields = readFields(formData);
  if ("error" in fields) return fields;
  return send("POST", "/v1/web/admin/clinics", fields, "Clinic created.");
}

export async function updateClinicAction(clinicId: string, _previous: ClinicActionState, formData: FormData): Promise<ClinicActionState> {
  const fields = readFields(formData);
  if ("error" in fields) return fields;
  return send("PUT", `/v1/web/admin/clinics/${encodeURIComponent(clinicId)}`, fields, "Clinic details updated.");
}

export async function deactivateClinicAction(clinicId: string, _previous: ClinicActionState, _formData: FormData): Promise<ClinicActionState> {
  return send("DELETE", `/v1/web/admin/clinics/${encodeURIComponent(clinicId)}`, undefined, "Clinic deactivated.");
}

export async function activateClinicAction(clinicId: string, _previous: ClinicActionState, _formData: FormData): Promise<ClinicActionState> {
  return send("PATCH", `/v1/web/admin/clinics/${encodeURIComponent(clinicId)}/activate`, undefined, "Clinic reactivated.");
}

function readFields(formData: FormData): ClinicFields | ClinicActionState {
  const fields = { name: field(formData, "name"), address: field(formData, "address"), city: field(formData, "city") };
  if (!fields.name || !fields.address || !fields.city) return { error: "Enter the clinic name, address and city." };
  if (fields.name.length > 120 || fields.address.length > 300 || fields.city.length > 100) return { error: "One or more clinic fields exceed the allowed length." };
  return fields;
}

async function send(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body: unknown, success: string): Promise<ClinicActionState> {
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
      revalidatePath("/admin/clinics");
      revalidatePath("/admin/schedules/clinics");
      revalidatePath("/admin/schedules");
      return { success };
    }
    if (response.status === 401 || response.status === 403) return { error: "Only an active administrator can manage clinics." };
    if (response.status === 404) return { error: "This clinic could not be found. Refresh and try again." };
    if (response.status === 400) return { error: "Review the clinic name, address and city." };
    return { error: "We could not save the clinic. Try again shortly." };
  } catch {
    return { error: "Clinic management is unavailable until the CareNow API is connected." };
  }
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
