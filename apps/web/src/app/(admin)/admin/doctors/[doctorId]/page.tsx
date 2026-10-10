import { notFound } from "next/navigation";
import { AdminDoctorDetail } from "@/components/admin-doctor-detail";
import { UnavailableState } from "@/components/unavailable-state";
import { getAdminDoctor } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default async function AdminDoctorPage({ params }: { params: Promise<{ doctorId: string }> }) {
  const { doctorId } = await params;
  const result = await getAdminDoctor(doctorId);
  if (result.unavailable || !result.data) return <><div className="page-heading"><div><h1>Doctor profile</h1><p>CareNow verifies administrator access before returning this profile.</p></div></div><UnavailableState /></>;
  return <AdminDoctorDetail doctor={result.data} />;
}
