import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, ShieldAlert } from "lucide-react";
import { getAuthorizedSession } from "@/lib/auth/server";
import { PortalShell } from "@/components/portal-shell";

export const dynamic = "force-dynamic";

export default async function AccountStatusPage() {
  const result = await getAuthorizedSession();
  if (result.kind !== "ready") redirect("/sign-in");
  const session = result.session;
  const suspended = session.accountStatus === "SUSPENDED";
  return <PortalShell session={session} role={session.role}><section className="card status-page-card">
    <div className={`empty-icon${suspended ? " danger" : ""}`}>{suspended ? <ShieldAlert size={22} /> : <Clock3 size={22} />}</div>
    <h1>{suspended ? "Your account is suspended" : session.accountStatus === "INVITED" ? "Finish account activation" : "Your account is inactive"}</h1>
    <p>{suspended ? "Your CareNow account cannot access the portal right now. Contact your CareNow administrator for help." : "Your account is not active for the CareNow web portal yet. Follow the secure activation link or contact your administrator."}</p>
    <Link className="button secondary" href="/sign-in">Return to sign in</Link>
  </section></PortalShell>;
}
