import { DoctorAvailabilityForm } from "@/components/doctor-availability-form";
import { getDoctorAvailability } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function DoctorAvailabilityPage() {
  await requireRole("DOCTOR");
  const result = await getDoctorAvailability();
  return <DoctorAvailabilityForm result={result} />;
}
