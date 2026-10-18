import { DoctorPatients } from "@/components/doctor-workspace";
import { getDoctorPatients } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function DoctorPatientsPage() {
  await requireRole("DOCTOR");
  return <DoctorPatients result={await getDoctorPatients()} />;
}
