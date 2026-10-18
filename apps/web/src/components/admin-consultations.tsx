import Link from "next/link";
import { Activity, CalendarDays, Clock3, MapPin, ShieldCheck, Video } from "lucide-react";
import type { AdminAppointmentInfo, AdminAppointmentsData, DataResult } from "@/lib/portal-data";
import { UnavailableState } from "@/components/unavailable-state";

const dateFormatter = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Yangon" });
const timeFormatter = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Yangon" });

function timeWindow(item: AdminAppointmentInfo, now: number) {
  if (item.status !== "SCHEDULED") return item.status === "COMPLETED" ? "Appointment completed" : item.status === "NO_SHOW" ? "Marked no-show" : "Appointment cancelled";
  const start = new Date(item.startsAt).valueOf();
  const end = new Date(item.endsAt).valueOf();
  if (now < start) return "Upcoming";
  if (now <= end) return "Within scheduled time";
  return "Scheduled time passed";
}

function statusClass(status: AdminAppointmentInfo["status"]) {
  if (status === "COMPLETED") return "complete";
  if (status === "CANCELLED" || status === "NO_SHOW") return "pending";
  return "";
}

function dateTime(value: string) {
  const date = new Date(value);
  return `${dateFormatter.format(date)} · ${timeFormatter.format(date)} MMT`;
}

export function AdminConsultations({ result, filters, now }: {
  result: DataResult<AdminAppointmentsData>;
  filters: { status: string; type: string; doctorId: string; from: string; to: string };
  now: string;
}) {
  if (result.unavailable || !result.data) return <>
    <div className="page-heading"><div><h1>Consultations</h1><p>Review consultation schedules and operational details.</p></div></div>
    <UnavailableState detail="Consultation information could not be loaded. Check the CareNow API and your administrator session, then try again." />
  </>;

  const items = result.data.items;
  const currentTime = new Date(now).valueOf();
  const withinSchedule = items.filter((item) => item.status === "SCHEDULED" && currentTime >= new Date(item.startsAt).valueOf() && currentTime <= new Date(item.endsAt).valueOf()).length;
  const online = items.filter((item) => item.consultationType === "ONLINE").length;
  const inPerson = items.filter((item) => item.consultationType === "IN_PERSON").length;

  return <>
    <div className="page-heading"><div><h1>Consultations</h1><p>Monitor appointment schedules by doctor, time, and consultation type.</p></div><span className="role-badge"><Activity size={13} /> Operational view</span></div>

    <section className="admin-consultation-metrics" aria-label="Consultation schedule summary">
      <article className="card admin-consultation-metric"><span className="admin-consultation-metric-icon blue"><CalendarDays size={17} /></span><div><strong>{items.length}</strong><span>Appointment records</span></div></article>
      <article className="card admin-consultation-metric"><span className="admin-consultation-metric-icon teal"><Clock3 size={17} /></span><div><strong>{withinSchedule}</strong><span>Within scheduled time</span></div></article>
      <article className="card admin-consultation-metric"><span className="admin-consultation-metric-icon blue"><Video size={17} /></span><div><strong>{online}</strong><span>Online</span></div></article>
      <article className="card admin-consultation-metric"><span className="admin-consultation-metric-icon teal"><MapPin size={17} /></span><div><strong>{inPerson}</strong><span>In-person</span></div></article>
    </section>

    <section className="card admin-appointments-filters admin-consultation-filters">
      <form method="get" className="admin-appointments-filter-form">
        <label className="form-field"><span>Appointment status</span><select name="status" defaultValue={filters.status}><option value="ALL">All statuses</option><option value="SCHEDULED">Scheduled</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option><option value="NO_SHOW">No show</option></select></label>
        <label className="form-field"><span>Consultation type</span><select name="type" defaultValue={filters.type}><option value="ALL">All types</option><option value="ONLINE">Online</option><option value="IN_PERSON">In-person</option></select></label>
        <label className="form-field"><span>Doctor</span><select name="doctorId" defaultValue={filters.doctorId}><option value="">All doctors</option>{result.data.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>
        <label className="form-field"><span>From (Yangon)</span><input type="date" name="from" defaultValue={filters.from} /></label>
        <label className="form-field"><span>To (Yangon)</span><input type="date" name="to" defaultValue={filters.to} /></label>
        <div className="admin-appointments-filter-actions"><button className="button" type="submit">Apply</button><Link className="button secondary" href="/admin/consultations">Reset</Link></div>
      </form>
    </section>

    <section className="card admin-appointments-table-card">
      <header className="card-header"><h2>Consultation schedule</h2><span className="role-badge">{items.length} shown</span></header>
      {items.length ? <div className="table-wrap"><table>
        <thead><tr><th>Scheduled time (MMT)</th><th>Patient reference</th><th>Doctor</th><th>Type</th><th>Clinic</th><th>Appointment status</th><th>Schedule window</th><th aria-label="Details" /></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td data-label="Scheduled time (MMT)"><strong>{dateTime(item.startsAt)}</strong><div className="admin-consultation-end">Until {timeFormatter.format(new Date(item.endsAt))} MMT</div></td>
          <td data-label="Patient reference">{item.patientReference}</td><td data-label="Doctor">{item.doctorName}</td>
          <td data-label="Type"><span className="admin-appointment-type">{item.consultationType === "ONLINE" ? <Video size={14} /> : <MapPin size={14} />}{item.consultationType === "ONLINE" ? "Online" : "In-person"}</span></td>
          <td data-label="Clinic">{item.consultationType === "IN_PERSON" ? item.clinicName ?? "Not assigned" : "Virtual"}</td>
          <td data-label="Appointment status"><span className={`status-pill ${statusClass(item.status)}`}>{item.status === "NO_SHOW" ? "No show" : item.status.charAt(0) + item.status.slice(1).toLowerCase()}</span></td>
          <td data-label="Schedule window"><span className="admin-consultation-window">{timeWindow(item, currentTime)}</span></td>
          <td data-label="Details"><Link className="table-action" href={`/admin/appointments/${encodeURIComponent(item.id)}`}>View</Link></td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><div className="empty-icon"><CalendarDays size={20} /></div><strong>No consultations match these filters</strong><p>Change the date range or filters to view other scheduled appointments.</p></div>}
    </section>

    <div className="security-callout"><ShieldCheck size={17} /><span>“Within scheduled time” describes the appointment window only. Live participant presence and call connection status are not currently recorded. Administrators cannot view clinical notes, visit reasons, prescriptions, messages, or video content.</span></div>
  </>;
}
