import Link from "next/link";
import { AdminClinicAssignmentManager } from "@/components/admin-clinic-assignment-manager";
import { getAdminClinicAssignments } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AdminClinicAssignmentsPage() {
  await requireRole("ADMINISTRATOR");
  return <>
    <div className="page-heading"><div><h1>Assigned clinics</h1><p>Manage the clinics where doctors offer in-person consultations.</p></div><div className="slot-actions"><Link className="button secondary" href="/admin/clinics">Manage clinic locations</Link><Link className="button secondary" href="/admin/schedules">Doctor timeslots</Link></div></div>
    <AdminClinicAssignmentManager result={await getAdminClinicAssignments()} />
  </>;
}
