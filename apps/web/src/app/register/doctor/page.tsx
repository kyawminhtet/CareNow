import { DoctorRegistrationForm } from "./registration-form";
import { getPublicSpecialties } from "@/lib/portal-data";

export default async function DoctorRegistrationPage() { return <DoctorRegistrationForm specialties={await getPublicSpecialties()} />; }
