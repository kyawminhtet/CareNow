"use server";

import { revalidatePath } from "next/cache";
import { requireAccountRole } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DoctorPhotoActionState = { success?: string; error?: string };

export async function updateDoctorPersonalAction(_previous: DoctorPhotoActionState, formData: FormData): Promise<DoctorPhotoActionState> {
  await requireAccountRole("DOCTOR");
  const fullName = field(formData, "fullName");
  const phone = field(formData, "phone");
  if (fullName.length < 2 || fullName.length > 120 || phone.length < 6 || phone.length > 40) {
    return { error: "Enter a full name and a valid phone number." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  if (!session) return { error: "Your session expired. Sign in again." };
  try {
    const response = await fetch(`${getApiOrigin()}/v1/web/doctor/profile/personal`, {
      method: "PATCH", headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ fullName, phone }), cache: "no-store",
    });
    if (!response.ok) return { error: "We could not save your personal information. Review the details and try again." };
    revalidatePath("/doctor/profile"); revalidatePath("/doctor/dashboard");
    return { success: "Your personal information has been saved." };
  } catch { return { error: "The CareNow API is unavailable. Try again shortly." }; }
}

export async function updateDoctorProfileAction(_previous: DoctorPhotoActionState, formData: FormData): Promise<DoctorPhotoActionState> {
  await requireAccountRole("DOCTOR");
  const values = {
    specialty: field(formData, "specialty"),
    biography: field(formData, "biography"),
    qualifications: field(formData, "qualifications"),
    experienceYears: Number(field(formData, "experienceYears")),
    languages: field(formData, "languages").split(",").map((item) => item.trim()).filter(Boolean),
    services: formData.getAll("services").filter((item): item is string => item === "ONLINE" || item === "IN_PERSON"),
  };
  if (!values.specialty || !values.qualifications || !Number.isInteger(values.experienceYears) ||
    values.experienceYears < 0 || values.experienceYears > 100 || !values.languages.length || !values.services.length) {
    return { error: "Complete the required profile fields and select at least one consultation service." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  if (!session) return { error: "Your session expired. Sign in again." };
  try {
    const response = await fetch(`${getApiOrigin()}/v1/web/doctor/profile`, {
      method: "PATCH", headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(values), cache: "no-store",
    });
    if (!response.ok) return { error: response.status === 401 || response.status === 403 ? "Your doctor account cannot edit this profile." : "We could not save your profile. Review the details and try again." };
    revalidatePath("/doctor/profile"); revalidatePath("/doctor/dashboard");
    return { success: "Your profile information has been saved." };
  } catch { return { error: "The CareNow API is unavailable. Try again shortly." }; }
}

export async function uploadDoctorPhotoAction(_previous: DoctorPhotoActionState, formData: FormData): Promise<DoctorPhotoActionState> {
  await requireAccountRole("DOCTOR");
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a profile photo to upload." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { error: "Choose a JPEG, PNG, or WebP image." };
  if (file.size > 5 * 1024 * 1024) return { error: "The photo must be 5 MB or smaller." };
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  if (!session) return { error: "Your session expired. Sign in again." };
  const payload = new FormData();
  payload.append("photo", file, file.name);
  try {
    const response = await fetch(`${getApiOrigin()}/v1/web/doctor/profile/photo`, {
      method: "POST", headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json" }, body: payload, cache: "no-store",
    });
    if (!response.ok) return { error: response.status === 413 ? "The photo must be 5 MB or smaller." : "We could not upload the photo. Try again shortly." };
    revalidatePath("/doctor/profile"); revalidatePath("/doctor/dashboard");
    return { success: "Profile photo updated." };
  } catch { return { error: "The CareNow API is unavailable. Try again shortly." }; }
}

export async function removeDoctorPhotoAction(): Promise<DoctorPhotoActionState> {
  await requireAccountRole("DOCTOR");
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  if (!session) return { error: "Your session expired. Sign in again." };
  try {
    const response = await fetch(`${getApiOrigin()}/v1/web/doctor/profile/photo`, {
      method: "DELETE", headers: { authorization: `Bearer ${session.access_token}`, accept: "application/json" }, cache: "no-store",
    });
    if (!response.ok) return { error: "We could not remove the photo. Try again shortly." };
    revalidatePath("/doctor/profile"); revalidatePath("/doctor/dashboard");
    return { success: "Profile photo removed." };
  } catch { return { error: "The CareNow API is unavailable. Try again shortly." }; }
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
