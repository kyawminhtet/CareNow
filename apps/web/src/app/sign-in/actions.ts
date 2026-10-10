"use server";

import { redirect } from "next/navigation";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthActionState = { error?: string; success?: boolean };

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function destinationForAccessToken(accessToken: string): Promise<string | null> {
  const response = await fetch(`${getApiOrigin()}/v1/auth/session`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("user" in payload)) return null;
  const user = payload.user;
  if (typeof user !== "object" || user === null || !("role" in user) || !("accountStatus" in user)) return null;
  const role = user.role;
  const accountStatus = user.accountStatus;
  if (role === "DOCTOR" && accountStatus === "INVITED") {
    const activation = await fetch(`${getApiOrigin()}/v1/auth/activate-invited-doctor`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      cache: "no-store",
    });
    if (!activation.ok) return "/account/status";
    return "/doctor/verification";
  }
  if (accountStatus !== "ACTIVE") return "/account/status";
  if (role === "DOCTOR") {
    if (!("verificationStatus" in user) || user.verificationStatus !== "VERIFIED") return "/doctor/verification";
    return "/doctor/dashboard";
  }
  if (role === "ADMINISTRATOR") return "/admin/dashboard";
  return null;
}

export async function signInAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  if (!email || !email.includes("@")) return { error: "Enter a valid work email." };
  if (!password) return { error: "Enter your password." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Sign-in is not configured yet. Set the public Supabase URL and publishable key." };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "We could not sign you in. Check your details and try again." };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Your sign-in session could not be created. Try again." };
  try {
    const destination = await destinationForAccessToken(session.access_token);
    if (destination) redirect(destination);
    return { error: "Your account is not active for the CareNow web portal." };
  } catch (cause) {
    if (cause instanceof Error && cause.message === "NEXT_REDIRECT") throw cause;
    try { getApiOrigin(); } catch { return { error: "The CareNow API is not configured yet." }; }
    return { error: "CareNow could not verify your account. Try again shortly." };
  }
}

export async function recoveryAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = field(formData, "email").toLowerCase();
  if (!email || !email.includes("@")) return { error: "Enter a valid account email." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Password recovery is not configured yet." };
  const redirectTo = `${process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "http://localhost:3000"}/auth/callback?next=/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { error: "We could not send the recovery email right now. Try again shortly." };
  return { success: true };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in");
}
