import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/sign-in");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");
  return <ResetPasswordForm />;
}
