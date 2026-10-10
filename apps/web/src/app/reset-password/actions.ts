"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PasswordActionState = { error?: string };

export async function updatePasswordAction(_previous: PasswordActionState, formData: FormData): Promise<PasswordActionState> {
  const password = formData.get("password");
  const confirmation = formData.get("confirmation");
  if (typeof password !== "string" || password.length < 8) return { error: "Choose a password with at least 8 characters." };
  if (password !== confirmation) return { error: "The passwords do not match." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Password recovery is not configured yet." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "This recovery link is expired or could not be used. Request a new link." };
  await supabase.auth.signOut();
  redirect("/sign-in?password=updated");
}
