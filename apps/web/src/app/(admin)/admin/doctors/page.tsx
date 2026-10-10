import { SectionPage } from "@/components/section-pages";
import { getAuthorizedList } from "@/lib/portal-data";

export const dynamic = "force-dynamic";

export default async function AdminDoctorsPage() {
  return <SectionPage
    title="Doctors"
    description="Manage doctor profiles, verification, invitations, and account access."
    createLabel="Register doctor"
    basePath="/admin/doctors"
    result={await getAuthorizedList("/v1/web/admin/doctors")}
  />;
}
