import { AdminDoctorRegistrationForm } from "@/components/admin-doctor-registration-form";
import { getPublicSpecialties } from "@/lib/portal-data";

export default async function AdminDoctorRegistrationPage() {
  return <AdminDoctorRegistrationForm specialties={await getPublicSpecialties()} />;
}
