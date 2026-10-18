import { AdminAppointments } from "@/components/admin-appointments";
import { requireRole } from "@/lib/auth/server";
import { getAdminAppointments } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function value(param: string | string[] | undefined) { return Array.isArray(param) ? param[0] ?? "" : param ?? ""; }

export default async function AdminAppointmentsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("ADMINISTRATOR");
  const params = await searchParams;
  const filters = {
    status: value(params.status) || "ALL",
    type: value(params.type) || "ALL",
    doctorId: value(params.doctorId),
    from: value(params.from),
    to: value(params.to),
  };
  return <AdminAppointments result={await getAdminAppointments(filters)} filters={filters} />;
}
