import { AdminDashboard } from "@/components/dashboard-ui";
import { getAdminDashboard } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  return <AdminDashboard result={await getAdminDashboard()} />;
}
