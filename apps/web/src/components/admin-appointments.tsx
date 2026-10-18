import Link from "next/link";
import { CalendarDays, Clock3, MapPin, ShieldCheck, Video } from "lucide-react";
import type { AdminAppointmentInfo, AdminAppointmentsData, DataResult } from "@/lib/portal-data";
import { UnavailableState } from "@/components/unavailable-state";

const dateFormatter = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Yangon" });
const timeFormatter = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Yangon" });

function dateTime(value: string) {
  const date = new Date(value);
  return `${dateFormatter.format(date)} · ${timeFormatter.format(date)} MMT`;
}

function statusClass(status: AdminAppointmentInfo["status"]) {
  if (status === "COMPLETED") return "complete";
  if (status === "CANCELLED" || status === "NO_SHOW") return "pending";
  return "";
}

function statusLabel(status: AdminAppointmentInfo["status"]) {
  return status === "NO_SHOW" ? "No show" : status.charAt(0) + status.slice(1).toLowerCase();
}

export function AdminAppointments({ result, filters }: {
  result: DataResult<AdminAppointmentsData>;
  filters: { status: string; type: string; doctorId: string; from: string; to: string };
}) {
  return <>
    <div className="page-heading"><div><h1>Appointments</h1><p>Review appointment schedules and operational status. Clinical information stays restricted.</p></div></div>
    {result.unavailable || !result.data ? <UnavailableState detail="Appointment information could not be loaded. Check the CareNow API and your administrator session, then try again." /> : <>
      <section className="card admin-appointments-filters">
        <form method="get" className="admin-appointments-filter-form">
          <label className="form-field"><span>Status</span><select name="status" defaultValue={filters.status}><option value="ALL">All statuses</option><option value="SCHEDULED">Scheduled</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option><option value="NO_SHOW">No show</option></select></label>
          <label className="form-field"><span>Consultation type</span><select name="type" defaultValue={filters.type}><option value="ALL">All types</option><option value="ONLINE">Online</option><option value="IN_PERSON">In-person</option></select></label>
          <label className="form-field"><span>Doctor</span><select name="doctorId" defaultValue={filters.doctorId}><option value="">All doctors</option>{result.data.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>
          <label className="form-field"><span>From date (Yangon)</span><input type="date" name="from" defaultValue={filters.from} /></label>
          <label className="form-field"><span>To date (Yangon)</span><input type="date" name="to" defaultValue={filters.to} /></label>
          <div className="admin-appointments-filter-actions"><button className="button" type="submit">Apply filters</button><Link className="button secondary" href="/admin/appointments">Clear</Link></div>
        </form>
      </section>

      <section className="card admin-appointments-table-card">
        <header className="card-header"><h2>Appointment records</h2><span className="role-badge">{result.data.items.length} shown</span></header>
        {result.data.items.length ? <div className="table-wrap"><table>
          <thead><tr><th>Date &amp; time (MMT)</th><th>Patient reference</th><th>Doctor</th><th>Type</th><th>Clinic</th><th>Status</th><th aria-label="Details" /></tr></thead>
          <tbody>{result.data.items.map((item) => <tr key={item.id}>
            <td data-label="Date & time (MMT)"><strong>{dateTime(item.startsAt)}</strong></td>
            <td data-label="Patient reference">{item.patientReference}</td>
            <td data-label="Doctor">{item.doctorName}</td>
            <td data-label="Type"><span className="admin-appointment-type">{item.consultationType === "ONLINE" ? <Video size={14} /> : <MapPin size={14} />}{item.consultationType === "ONLINE" ? "Online" : "In-person"}</span></td>
            <td data-label="Clinic">{item.clinicName ?? "—"}</td>
            <td data-label="Status"><span className={`status-pill ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
            <td data-label="Details"><Link className="table-action" href={`/admin/appointments/${encodeURIComponent(item.id)}`}>View</Link></td>
          </tr>)}</tbody>
        </table></div> : <div className="empty-state"><div className="empty-icon"><CalendarDays size={20} /></div><strong>No appointments match these filters</strong><p>Change the filters or clear them to see more records.</p></div>}
      </section>
      <div className="security-callout"><ShieldCheck size={17} /><span>Administrators can view scheduling and operational details only. Patient clinical information and private consultations are restricted.</span></div>
    </>}
  </>;
}

export function AdminAppointmentDetail({ result }: { result: DataResult<AdminAppointmentInfo> }) {
  if (result.unavailable || !result.data) return <><div className="page-heading"><div><h1>Appointment details</h1><p>Operational appointment information.</p></div></div><UnavailableState detail="This appointment could not be loaded or is unavailable to your administrator account." /></>;
  const item = result.data;
  return <>
    <div className="page-heading"><div><Link className="back-link" href="/admin/appointments">← Back to appointments</Link><h1 style={{ marginTop: 10 }}>Appointment details</h1><p>{dateTime(item.startsAt)}</p></div><span className={`status-pill ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></div>
    <section className="card admin-appointment-detail">
      <div className="record-keyline"><span>Appointment reference</span><strong>{item.id}</strong></div>
      <div className="record-keyline"><span>Patient reference</span><strong>{item.patientReference}</strong></div>
      <div className="record-keyline"><span>Assigned doctor</span><strong>{item.doctorName}</strong></div>
      <div className="record-keyline"><span>Consultation type</span><strong>{item.consultationType === "ONLINE" ? "Online consultation" : "In-person visit"}</strong></div>
      <div className="record-keyline"><span>Scheduled start</span><strong><Clock3 size={14} />{dateTime(item.startsAt)}</strong></div>
      <div className="record-keyline"><span>Scheduled end</span><strong>{timeFormatter.format(new Date(item.endsAt))} MMT</strong></div>
      {item.consultationType === "IN_PERSON" ? <div className="record-keyline"><span>Clinic</span><strong>{[item.clinicName, item.clinicAddress, item.clinicCity].filter(Boolean).join(" · ") || "Not assigned"}</strong></div> : null}
      <div className="record-keyline"><span>Booked</span><strong>{dateTime(item.createdAt)}</strong></div>
    </section>
    <div className="security-callout"><ShieldCheck size={17} /><span>Patient identity details, visit reasons, clinical notes, prescriptions, private messages, and video content are not available in the administrator view.</span></div>
  </>;
}
