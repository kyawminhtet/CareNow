import { AdminConsultations } from "@/components/admin-consultations";
import { requireRole } from "@/lib/auth/server";
import { getAdminAppointments } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function value(param: string | string[] | undefined) { return Array.isArray(param) ? param[0] ?? "" : param ?? ""; }

function yangonDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function AdminConsultationsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("ADMINISTRATOR");
  const params = await searchParams;
  const today = yangonDate(new Date());
  const nextWeek = new Date(`${today}T00:00:00+06:30`);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const filters = {
    status: value(params.status) || "SCHEDULED",
    type: value(params.type) || "ALL",
    doctorId: value(params.doctorId),
    from: value(params.from) || today,
    to: value(params.to) || yangonDate(nextWeek),
  };
  const result = await getAdminAppointments(filters);
  return <AdminConsultations result={result} filters={filters} now={new Date().toISOString()} />;
}
