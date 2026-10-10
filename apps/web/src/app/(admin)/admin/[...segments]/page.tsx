import { notFound } from "next/navigation";
import { SectionPage, RecordPage } from "@/components/section-pages";
import { getAuthorizedList, getAuthorizedRecord, getNotifications } from "@/lib/portal-data";
import { NotificationInbox } from "@/components/notification-inbox";

const sections: Record<string, { title: string; description: string; createLabel?: string }> = {
  doctors: { title: "Doctors", description: "Review doctor accounts and verification status.", createLabel: "Register doctor" },
  schedules: { title: "Schedules", description: "Manage doctor availability and slot conflicts." },
  patients: { title: "Patients", description: "Operational patient references and account status." },
  appointments: { title: "Appointments", description: "Filter appointment operations by date, type, doctor and status." },
  consultations: { title: "Consultations", description: "Monitor consultation progress and connection status." },
  reports: { title: "Reports", description: "Aggregate platform activity and operational reports." },
  "audit-logs": { title: "Audit logs", description: "Review access and operational changes." },
  settings: { title: "Settings", description: "Manage platform settings and account controls." },
  notifications: { title: "Notifications", description: "Operational CareNow updates for administrators." },
};

export default async function AdminSectionPage({ params }: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await params;
  const section = segments[0];
  const config = sections[section];
  if (!config) notFound();
  const basePath = `/admin/${section}`;
  if (section === "notifications") return <NotificationInbox role="ADMINISTRATOR" result={await getNotifications()} />;
  if (segments.length > 1 && segments[1] !== "new") {
    return <RecordPage title={config.title} basePath={basePath} result={await getAuthorizedRecord(`/v1/web/admin/${section}/${encodeURIComponent(segments[1])}`)} />;
  }
  return <SectionPage title={config.title} description={config.description} createLabel={config.createLabel} basePath={basePath}
    result={await getAuthorizedList(`/v1/web/admin/${section}`)} />;
}
