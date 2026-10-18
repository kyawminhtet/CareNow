import { AdminSpecialtyManager } from "@/components/admin-specialty-manager";
import { getAdminSpecialties } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AdminSpecialtiesPage() {
  await requireRole("ADMINISTRATOR");
  return <><div className="page-heading"><div><h1>Specialties</h1><p>Manage the options shown when a doctor registers.</p></div></div><AdminSpecialtyManager result={await getAdminSpecialties()} /></>;
}
