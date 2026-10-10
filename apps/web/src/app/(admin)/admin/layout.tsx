import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/server";
import { PortalShell } from "@/components/portal-shell";
import { getUnreadCount } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireRole("ADMINISTRATOR");
  const count = await getUnreadCount();
  return <PortalShell role="ADMINISTRATOR" session={session} unreadCount={!count.unavailable ? count.data : 0}>{children}</PortalShell>;
}
