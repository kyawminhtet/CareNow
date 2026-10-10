import { redirect } from "next/navigation";
import { getAuthorizedSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await getAuthorizedSession();
  if (result.kind !== "ready") redirect("/sign-in");
  if (result.session.accountStatus !== "ACTIVE") redirect("/account/status");
  if (result.session.role === "DOCTOR") {
    if (result.session.verificationStatus !== "VERIFIED") redirect("/doctor/verification");
    redirect("/doctor/dashboard");
  }
  redirect("/admin/dashboard");
}
