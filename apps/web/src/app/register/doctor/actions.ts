"use server";

import { getApiOrigin } from "@/lib/config";

export type RegistrationActionState = { error?: string; submitted?: boolean };

function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function registerDoctorAction(_previous: RegistrationActionState, formData: FormData): Promise<RegistrationActionState> {
  const requiredFields = ["fullName", "email", "phone", "password", "specialtyId", "licenseNumber", "licenseRegion", "licenseExpiry", "qualifications", "experienceYears", "languages"];
  if (requiredFields.some((key) => !readField(formData, key))) return { error: "Complete the required registration fields." };
  if (!readField(formData, "email").includes("@")) return { error: "Enter a valid email address." };
  if (readField(formData, "password").length < 8) return { error: "Choose a password with at least 8 characters." };
  if (!/^\d+$/.test(readField(formData, "experienceYears"))) return { error: "Enter your years of professional experience as a whole number." };
  if (!formData.getAll("services").some((value) => value === "ONLINE" || value === "IN_PERSON")) return { error: "Select at least one consultation service." };
  if (formData.get("termsAccepted") !== "on") return { error: "Accept the registration terms to continue." };

  const documents = ["licenseDocument", "qualificationDocument", "identityDocument"];
  for (const key of documents) {
    const file = formData.get(key);
    if (!(file instanceof File) || file.size === 0) return { error: "Upload your license, qualification and identity documents." };
    if (file.size > 10 * 1024 * 1024) return { error: "Each verification document must be 10 MB or smaller." };
    if (!(["application/pdf", "image/jpeg", "image/png"].includes(file.type))) return { error: "Use PDF, JPG or PNG files for verification documents." };
  }

  try {
    const apiForm = new FormData();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" || value instanceof File) apiForm.append(key, value);
    }
    const response = await fetch(`${getApiOrigin()}/v1/public/doctor-registrations`, {
      method: "POST",
      body: apiForm,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (response.status === 201 || response.status === 202) return { submitted: true };
    if (response.status === 409) return { error: "An account or registration already exists for this email. Sign in or recover your password." };
    if (response.status === 400 || response.status === 422) return { error: "Some registration details need attention. Review the form and try again." };
    return { error: "We could not submit your registration. Try again shortly." };
  } catch {
    return { error: "Doctor registration is unavailable until the CareNow API is connected." };
  }
}
