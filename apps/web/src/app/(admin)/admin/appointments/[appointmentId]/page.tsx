import { AdminAppointmentDetail } from "@/components/admin-appointments";
import { requireRole } from "@/lib/auth/server";
import { getAdminAppointment } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default async function AdminAppointmentPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  await requireRole("ADMINISTRATOR");
  const { appointmentId } = await params;
  return <AdminAppointmentDetail result={await getAdminAppointment(appointmentId)} />;
}
