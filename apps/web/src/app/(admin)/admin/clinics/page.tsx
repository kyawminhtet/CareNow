import Link from "next/link";
import { AdminClinicManager } from "@/components/admin-clinic-manager";
import { getAdminClinics } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AdminClinicsPage() {
  await requireRole("ADMINISTRATOR");
  return <>
    <div className="page-heading"><div><h1>Clinic management</h1><p>Create and maintain clinic locations used for in-person care.</p></div><Link className="button secondary" href="/admin/schedules/clinics">Assign clinics to doctors</Link></div>
    <AdminClinicManager result={await getAdminClinics()} />
  </>;
}
