import { DoctorDashboard } from "@/components/dashboard-ui";
import { getDoctorDashboard } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function DoctorDashboardPage() {
  await requireRole("DOCTOR");
  return <DoctorDashboard result={await getDoctorDashboard()} />;
}
