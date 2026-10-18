import { DoctorPatientRecord } from "@/components/doctor-workspace";
import { getDoctorPatient } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function DoctorPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  await requireRole("DOCTOR");
  const { patientId } = await params;
  return <DoctorPatientRecord result={await getDoctorPatient(patientId)} />;
}
