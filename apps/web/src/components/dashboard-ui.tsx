import Link from "next/link";
import { Activity, ArrowRight, CalendarCheck, CalendarClock, CheckCircle2, Clock3, MapPin, UserPlus, Video } from "lucide-react";
import type { AppointmentRow, AdminDashboardData, DoctorDashboardData } from "@/lib/portal-data";
import { UnavailableState } from "@/components/unavailable-state";

function typeLabel(type: AppointmentRow["consultationType"]): string {
  return type === "ONLINE" ? "Online consultation" : "In-person consultation";
}

function appointmentTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Yangon" }).format(date);
}

function appointmentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "Asia/Yangon" }).format(date);
}

function StatusPill({ status }: { status: AppointmentRow["status"] }) {
  const classes = { SCHEDULED: "", CANCELLED: "waiting", COMPLETED: "complete", NO_SHOW: "waiting" };
  const labels = { SCHEDULED: "Scheduled", CANCELLED: "Cancelled", COMPLETED: "Completed", NO_SHOW: "No show" };
  return <span className={`status-pill ${classes[status]}`}>{labels[status]}</span>;
}

export function DoctorDashboard({ result }: { result: { data: DoctorDashboardData; unavailable: false } | { data: null; unavailable: true } }) {
  if (result.unavailable || !result.data) return <>
    <div className="page-heading"><div><h1>Your dashboard</h1><p>Today’s schedule and upcoming consultations.</p></div></div>
    <UnavailableState detail="The CareNow API is not connected or could not provide your authorized dashboard data." />
  </>;
  const data = result.data;
  return <>
    <div className="page-heading"><div><h1>Good morning</h1><p>Here’s your schedule and upcoming consultations.</p></div><Link href="/doctor/appointments" className="button secondary"><CalendarCheck size={15} />Appointments</Link></div>
    <section className="stat-grid" aria-label="Schedule summary">
      <Stat icon={<CalendarClock size={20} />} value={data.upcomingCount} label="Upcoming appointments" />
      <Stat icon={<Video size={20} />} tone="teal" value={data.onlineCount} label="Online consultations" />
      <Stat icon={<MapPin size={20} />} tone="orange" value={data.inPersonCount} label="In-person consultations" />
      <Stat icon={<CheckCircle2 size={20} />} tone="purple" value={data.completedThisWeek} label="Completed this week" />
    </section>
    <section className="content-grid">
      <article className="card">
        <header className="card-header"><h2>Upcoming appointments</h2><Link href="/doctor/appointments">View schedule <ArrowRight size={12} /></Link></header>
        {data.appointments.length ? <div className="schedule-list">{data.appointments.map((appointment) => <div className="schedule-row" key={appointment.id}>
          <div className="schedule-time">{appointmentTime(appointment.startTime)}<span>{appointmentDate(appointment.date)}</span></div>
          <div className="patient"><div className="avatar" aria-hidden="true">{appointment.initials}</div><div><strong>{appointment.patientName}</strong><span>{appointment.reason}</span></div></div>
          <div className="type-cell"><strong>{appointment.consultationType === "ONLINE" ? "Online" : "In person"}</strong>{appointment.location ?? "Video consultation"}</div>
          {appointment.consultationType === "ONLINE" ? <Link href={`/doctor/consultations/${encodeURIComponent(appointment.id)}`} className="button small">Open consultation</Link> : <Link href={`/doctor/appointments/${encodeURIComponent(appointment.id)}`} className="button secondary small">Appointment</Link>}
        </div>)}</div> : <div className="empty-state"><strong>No upcoming appointments</strong><p>New bookings will appear here.</p></div>}
      </article>
      <div className="side-stack">
        <article className="card"><header className="card-header"><h2>Today at a glance</h2></header><div className="summary-list">
          <div className="summary-line"><span className="summary-label"><Video size={15} />Online appointments</span><strong>{data.onlineCount}</strong></div>
          <div className="summary-line"><span className="summary-label"><MapPin size={15} />In-person appointments</span><strong>{data.inPersonCount}</strong></div>
          <div className="summary-line"><span className="summary-label"><Activity size={15} />Completed this week</span><strong>{data.completedThisWeek}</strong></div>
        </div></article>
        <div className="card notice-card"><Clock3 size={19} /><div><h3>Patient access is protected</h3><p>Patient details appear only for care you are authorized to provide. Keep private notes in the consultation workspace.</p></div></div>
      </div>
    </section>
  </>;
}

export function AdminDashboard({ result }: { result: { data: AdminDashboardData; unavailable: false } | { data: null; unavailable: true } }) {
  if (result.unavailable || !result.data) return <>
    <div className="page-heading"><div><h1>Administrator dashboard</h1><p>Platform activity and operational status.</p></div></div>
    <UnavailableState detail="The CareNow API is not connected or could not provide your authorized operational data." />
  </>;
  const data = result.data;
  return <>
    <div className="page-heading"><div><h1>Administrator dashboard</h1><p>Platform activity and operational status.</p></div><Link href="/admin/doctors/new" className="button"><UserPlus size={15} />Register doctor</Link></div>
    <section className="stat-grid admin-stat-grid" aria-label="Platform activity summary">
      <Stat icon={<Clock3 size={20} />} tone="orange" value={data.pendingVerifications} label="Pending verification" />
      <Stat icon={<CalendarCheck size={20} />} value={data.scheduledToday} label="Scheduled today" />
      <Stat icon={<CalendarClock size={20} />} tone="teal" value={data.waiting} label="Waiting" />
      <Stat icon={<Activity size={20} />} tone="purple" value={data.inProgress} label="In progress" />
      <Stat icon={<CheckCircle2 size={20} />} value={data.completed} label="Completed today" />
    </section>
    <section className="content-grid admin-content-grid">
      <article className="card"><header className="card-header"><h2>Doctor verification queue</h2><Link href="/admin/doctors">Review queue <ArrowRight size={12} /></Link></header>
        {data.verifications.length ? <div className="queue-list">{data.verifications.map((doctor) => <div className="queue-row" key={doctor.id}>
          <div className="patient"><div className="avatar" aria-hidden="true">{doctor.initials}</div><div><strong>{doctor.name}</strong><span>{doctor.specialty}</span></div></div>
          <span className="secondary-text">Submitted {appointmentDate(doctor.submittedAt)}</span>
          <div className="queue-actions"><Link className="button small teal" href={`/admin/doctors/${encodeURIComponent(doctor.id)}`}>Review</Link></div>
        </div>)}</div> : <div className="empty-state"><strong>No pending reviews</strong><p>New doctor submissions will appear here.</p></div>}
      </article>
      <article className="card"><header className="card-header"><h2>Recent appointments</h2><Link href="/admin/appointments">View all</Link></header>
        {data.appointments.length ? <div className="table-wrap"><table><thead><tr><th>Date &amp; time</th><th>Patient ref.</th><th>Doctor</th><th>Type</th><th>Status</th></tr></thead><tbody>{data.appointments.map((appointment) => <tr key={appointment.id}><td><strong>{appointmentDate(appointment.date)}, {appointmentTime(appointment.startTime)}</strong></td><td>{appointment.patientReference}</td><td>{appointment.doctorName}</td><td>{typeLabel(appointment.consultationType)}</td><td><StatusPill status={appointment.status} /></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No recent appointments</strong><p>Operational activity will appear here.</p></div>}
        <div className="secure-note"><strong><ShieldLockIcon /> Clinical information restricted</strong>Patient clinical records, prescriptions, private messages and consultation content are not available in the administrator workspace.</div>
      </article>
    </section>
    <section className="card admin-monitor-card">
      <header className="card-header"><div><h2>Live operational monitor</h2><span className="step-hint">Current consultation and clinic check-in status from recorded events.</span></div><span className="role-badge">Operational view</span></header>
      <div className="operational-status"><div><span className="connection-dot" /><strong>{data.waiting} waiting</strong></div><div><span className="connection-dot active" /><strong>{data.inProgress} in progress</strong></div><span className="operational-note">Live consultation and check-in events are not yet available in the current database schema.</span></div>
      <div className="secure-note"><strong><ShieldLockIcon /> Clinical information restricted</strong>Administrator monitoring shows operational state only and never includes clinical notes, prescriptions, private messages, or video content.</div>
    </section>
  </>;
}

function ShieldLockIcon() { return <span aria-hidden="true">🔒</span>; }

function Stat({ icon, value, label, tone = "" }: { icon: React.ReactNode; value: number; label: string; tone?: string }) {
  return <article className="card stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><strong>{value.toLocaleString("en")}</strong><span>{label}</span></div></article>;
}
