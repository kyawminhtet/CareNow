import type { ReactNode } from "react";
import { requireAccountRole } from "@/lib/auth/server";
import { PortalShell } from "@/components/portal-shell";
import { getUnreadCount } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default async function DoctorLayout({ children }: { children: ReactNode }) {
  const session = await requireAccountRole("DOCTOR");
  const count = session.verificationStatus === "VERIFIED" ? await getUnreadCount() : null;
  return <PortalShell role="DOCTOR" session={session} unreadCount={count && !count.unavailable ? count.data : 0}>{children}</PortalShell>;
}
