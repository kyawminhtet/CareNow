"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SpecialtyActionState = { success?: string; error?: string };

export async function createSpecialtyAction(_previous: SpecialtyActionState, formData: FormData) {
  const name = readName(formData);
  if (!name) return { error: "Enter a specialty name between 2 and 100 characters." };
  return send("POST", "/v1/web/admin/specialties", { name }, "Specialty created.");
}

export async function updateSpecialtyAction(id: string, _previous: SpecialtyActionState, formData: FormData) {
  const name = readName(formData);
  const active = formData.get("isActive");
  if (!name) return { error: "Enter a specialty name between 2 and 100 characters." };
  return send("PUT", `/v1/web/admin/specialties/${encodeURIComponent(id)}`, { name, isActive: active === "on" }, "Specialty updated.");
}

export async function deleteSpecialtyAction(id: string, _previous: SpecialtyActionState, _formData: FormData) {
  return send("DELETE", `/v1/web/admin/specialties/${encodeURIComponent(id)}`, undefined, "Specialty deleted.");
}

export async function uploadSpecialtyPhotoAction(id: string, _previous: SpecialtyActionState, formData: FormData): Promise<SpecialtyActionState> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a specialty photo to upload." };
  if (file.size > 5 * 1024 * 1024) return { error: "The photo must be 5 MB or smaller." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { error: "Use a JPG, PNG or WebP image." };
  const upload = new FormData();
  upload.append("photo", file);
  return send("POST", `/v1/web/admin/specialties/${encodeURIComponent(id)}/photo`, upload, "Specialty photo updated.");
}

export async function removeSpecialtyPhotoAction(id: string, _previous: SpecialtyActionState, _formData: FormData): Promise<SpecialtyActionState> {
  return send("DELETE", `/v1/web/admin/specialties/${encodeURIComponent(id)}/photo`, undefined, "Specialty photo removed.");
}

function readName(formData: FormData) {
  const value = formData.get("name");
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name.length >= 2 && name.length <= 100 ? name : "";
}

async function send(method: "POST" | "PUT" | "DELETE", path: string, body: unknown, success: string): Promise<SpecialtyActionState> {
  await requireRole("ADMINISTRATOR");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "CareNow authentication is unavailable." };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Your administrator session expired. Sign in again." };
  try {
    const response = await fetch(`${getApiOrigin()}${path}`, {
      method,
      headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json", ...(body === undefined || body instanceof FormData ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }), cache: "no-store",
    });
    if (response.ok) {
      revalidatePath("/admin/specialties");
      revalidatePath("/admin/doctors/new");
      revalidatePath("/register/doctor");
      return { success };
    }
    if (response.status === 401 || response.status === 403) return { error: "Only an active administrator can manage specialties." };
    if (response.status === 404) return { error: "This specialty could not be found. Refresh and try again." };
    if (response.status === 409) {
      const result = await response.json().catch(() => null) as { code?: string; parameters?: { doctorCount?: number } } | null;
      if (result?.code === "SPECIALTY_IN_USE") return { error: `This specialty is used by ${result.parameters?.doctorCount ?? "one or more"} doctor profiles. Deactivate it instead of deleting it.` };
      return { error: "A specialty with this name already exists." };
    }
    if (response.status === 400 || response.status === 413 || response.status === 422) return { error: "Check the specialty details and image file, then try again." };
    if (response.status === 503) return { error: "Specialty photo storage is not configured. Check the API Supabase service role key." };
    return { error: "We could not save the specialty. Try again shortly." };
  } catch {
    return { error: "Specialty management is unavailable until the CareNow API is connected." };
  }
}
