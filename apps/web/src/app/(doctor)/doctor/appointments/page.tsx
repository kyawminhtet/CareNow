import { DoctorAppointments } from "@/components/doctor-workspace";
import { getDoctorAppointments } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const filters = ["UPCOMING", "COMPLETED", "CANCELLED", "ALL"] as const;
type Filter = (typeof filters)[number];

export default async function DoctorAppointmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole("DOCTOR");
  const requested = (await searchParams).status?.toUpperCase();
  const status: Filter = filters.includes(requested as Filter) ? requested as Filter : "UPCOMING";
  return <DoctorAppointments result={await getDoctorAppointments(status)} status={status} />;
}
