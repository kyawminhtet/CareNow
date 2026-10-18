import { notFound } from "next/navigation";
import { SectionPage, RecordPage } from "@/components/section-pages";
import { getAuthorizedList, getAuthorizedRecord, getNotifications } from "@/lib/portal-data";
import { NotificationInbox } from "@/components/notification-inbox";
import { redirect } from "next/navigation";
import { requireAccountRole } from "@/lib/auth/server";
import { DoctorProfileManager } from "@/components/doctor-profile-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApiOrigin } from "@/lib/config";

const sections: Record<string, { title: string; description: string; createLabel?: string }> = {
  appointments: { title: "Appointments", description: "Review upcoming, completed and cancelled appointments." },
  patients: { title: "Patients", description: "Patients connected to your authorized care." },
  messages: { title: "Messages", description: "Private conversations with your patients." },
  availability: { title: "Availability", description: "Manage consultation hours, slots and blocked periods.", createLabel: "Set availability" },
  consultations: { title: "Consultations", description: "Continue online and in-person consultations." },
  profile: { title: "Profile", description: "Your professional information, services and account details." },
  notifications: { title: "Notifications", description: "Your secure CareNow updates." },
};

export default async function DoctorSectionPage({ params }: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await params;
  const section = segments[0];
  const config = sections[section];
  if (!config) notFound();
  const session = await requireAccountRole("DOCTOR");
  if (session.verificationStatus !== "VERIFIED" && section !== "profile") redirect("/doctor/verification");
  const basePath = `/doctor/${section}`;
  if (section === "notifications") return <NotificationInbox role="DOCTOR" result={await getNotifications()} />;
  if (section === "profile") {
    const supabase = await createSupabaseServerClient();
    const { data: { session: authSession } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    let profile = {
      displayName: session.displayName, email: authSession?.user.email ?? "", phone: "", specialty: "Doctor", biography: "", qualifications: "", experienceYears: 0,
      languages: [] as string[], services: [] as string[], licenseNumber: "", licenseRegion: "", licenseExpiry: "", profilePhotoUrl: null as string | null,
    };
    if (authSession) {
      try {
        const response = await fetch(`${getApiOrigin()}/v1/web/doctor/profile`, { headers: { authorization: `Bearer ${authSession.access_token}`, accept: "application/json" }, cache: "no-store" });
        if (response.ok) profile = { ...profile, ...await response.json() as typeof profile };
      } catch { /* retain safe profile fallback while API is unavailable */ }
    }
    return <DoctorProfileManager profile={profile} />;
  }
  if (segments.length > 1 && segments[1] !== "new") {
    return <RecordPage title={config.title} basePath={basePath} result={await getAuthorizedRecord(`/v1/web/doctor/${section}/${encodeURIComponent(segments[1])}`)} />;
  }
  return <SectionPage title={config.title} description={config.description} createLabel={config.createLabel} basePath={basePath}
    result={await getAuthorizedList(`/v1/web/doctor/${section}`)} />;
}
