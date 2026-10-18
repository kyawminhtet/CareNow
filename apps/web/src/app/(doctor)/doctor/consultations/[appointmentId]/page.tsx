import Link from "next/link";
import { ArrowLeft, ShieldCheck, Video } from "lucide-react";
import { UnavailableState } from "@/components/unavailable-state";
import { getDoctorDailyJoinGrant } from "@/lib/portal-data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  DAILY_NOT_CONFIGURED: "Daily is not configured yet. Add DAILY_API_KEY and DAILY_DOMAIN to apps/api/.env, then restart the API.",
  DAILY_PROVIDER_UNAVAILABLE: "Daily could not prepare this private call. Check the API key and Daily subdomain, then try again.",
  CONSULTATION_NOT_OPEN_YET: "The video room opens 15 minutes before the appointment.",
  CONSULTATION_WINDOW_CLOSED: "The video room is closed for this appointment.",
  CONSULTATION_NOT_SCHEDULED: "This appointment is no longer scheduled.",
  ONLINE_CONSULTATION_REQUIRED: "Video calls are only available for online appointments.",
  CONSULTATION_APPOINTMENT_NOT_FOUND: "This appointment is not available to your doctor account.",
};

export default async function DoctorConsultationPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  await requireRole("DOCTOR");
  const { appointmentId } = await params;
  const { grant, error } = await getDoctorDailyJoinGrant(appointmentId);

  if (!grant) return <>
    <div className="page-heading"><div><Link href="/doctor/appointments" className="back-link"><ArrowLeft size={14} /> Back to appointments</Link><h1 style={{ marginTop: 10 }}>Online consultation</h1></div></div>
    <UnavailableState detail={messages[error ?? ""] ?? "CareNow could not prepare this appointment's video call."} />
  </>;

  const dailyUrl = new URL(grant.roomUrl);
  dailyUrl.searchParams.set("t", grant.token);
  return <>
    <div className="page-heading"><div><Link href="/doctor/appointments" className="back-link"><ArrowLeft size={14} /> Back to appointments</Link><h1 style={{ marginTop: 10 }}>Online consultation</h1><p>Join securely as {grant.userName}. The patient joins with a separate appointment-bound token.</p></div><span className="role-badge"><Video size={13} style={{ marginRight: 5 }} />Private Daily room</span></div>
    <section className="card doctor-daily-call-card">
      <iframe className="doctor-daily-call-frame" src={dailyUrl.toString()} title="CareNow secure video consultation" allow="camera; microphone; fullscreen; display-capture; autoplay" referrerPolicy="no-referrer" />
    </section>
    <div className="security-callout"><ShieldCheck size={17} /><span>Only the patient and doctor assigned to this scheduled online appointment can obtain a join token. Recording is disabled.</span></div>
  </>;
}
