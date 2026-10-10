import { AdminScheduleManager } from "@/components/admin-schedule-manager";
import { getAdminSchedule } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AdminSchedulesPage() {
  await requireRole("ADMINISTRATOR");
  return <AdminScheduleManager result={await getAdminSchedule()} />;
}
