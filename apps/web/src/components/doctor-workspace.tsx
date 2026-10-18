"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock3, MapPin, Search, Users, Video } from "lucide-react";
import type { AppointmentRow, DataResult, DoctorPatientDetail, DoctorPatientRow } from "@/lib/portal-data";
import { UnavailableState } from "@/components/unavailable-state";

type AppointmentFilter = "UPCOMING" | "COMPLETED" | "CANCELLED" | "ALL";
const appointmentFilters: Array<{ value: AppointmentFilter; label: string }> = [
  { value: "UPCOMING", label: "Upcoming" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ALL", label: "All appointments" },
];

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Yangon" }).format(date);
}

function dateOnly(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Yangon" }).format(new Date(value)) : "—";
}

function statusClass(status: AppointmentRow["status"]) {
  if (status === "COMPLETED") return "complete";
  if (status === "CANCELLED" || status === "NO_SHOW") return "waiting";
  return "";
}

function statusLabel(status: AppointmentRow["status"]) {
  return status === "NO_SHOW" ? "No show" : status.charAt(0) + status.slice(1).toLowerCase();
}

export function DoctorAppointments({ result, status }: { result: DataResult<AppointmentRow[]>; status: AppointmentFilter }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => result.data?.filter((row) => `${row.patientName} ${row.reason} ${row.location ?? ""}`.toLowerCase().includes(query.toLowerCase())) ?? [], [result, query]);
  return <>
    <div className="page-heading"><div><h1>Appointments</h1><p>Review appointments booked with you and the patient details needed for each visit.</p></div><span className="role-badge">{result.data?.length ?? 0} shown</span></div>
    {result.unavailable ? <UnavailableState detail="Your appointment list could not be loaded. CareNow limits this list to appointments assigned to your verified account." /> : <section className="card doctor-workspace-card">
      <div className="doctor-workspace-toolbar">
        <nav className="doctor-filter-tabs" aria-label="Appointment status filter">{appointmentFilters.map((filter) => <Link key={filter.value} href={`/doctor/appointments?status=${filter.value}`} className={status === filter.value ? "active" : ""} aria-current={status === filter.value ? "page" : undefined}>{filter.label}</Link>)}</nav>
        <label className="search-field"><Search size={15} /><input aria-label="Search appointments" placeholder="Search patient or visit reason" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
      </div>
      {rows.length ? <div className="table-wrap"><table className="doctor-appointments-table"><thead><tr><th>Date &amp; time (Yangon)</th><th>Patient</th><th>Consultation</th><th>Reason for visit</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((appointment) => <tr key={appointment.id}>
        <td><strong>{dateTime(appointment.startTime)}</strong><span className="doctor-table-subline">Until {new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Yangon" }).format(new Date(appointment.endTime))}</span></td>
        <td><Link href={`/doctor/patients/${encodeURIComponent(appointment.patientId)}`} className="doctor-patient-link"><span className="avatar" aria-hidden="true">{appointment.initials}</span><span><strong>{appointment.patientName}</strong><small>Patient profile</small></span></Link></td>
        <td><span className={`doctor-visit-type ${appointment.consultationType === "IN_PERSON" ? "in-person" : "online"}`}>{appointment.consultationType === "ONLINE" ? <Video size={14} /> : <MapPin size={14} />}{appointment.consultationType === "ONLINE" ? "Online" : "In person"}</span>{appointment.location && <span className="doctor-table-subline">{appointment.location}</span>}</td>
        <td className="doctor-reason-cell">{appointment.reason}</td>
        <td><span className={`status-pill ${statusClass(appointment.status)}`}>{statusLabel(appointment.status)}</span></td>
        <td>{appointment.status === "SCHEDULED" && appointment.consultationType === "ONLINE"
          ? <Link className="button small" href={`/doctor/consultations/${encodeURIComponent(appointment.id)}`}>Join video</Link>
          : <Link className="doctor-appointment-action" href={`/doctor/patients/${encodeURIComponent(appointment.patientId)}`}>View patient</Link>}</td>
      </tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-icon"><CalendarDays size={20} /></div><strong>{query ? "No matching appointments" : `No ${status === "ALL" ? "" : status.toLowerCase() + " "}appointments`}</strong><p>{query ? "Try another patient name or search term." : "Appointments assigned to you will appear here."}</p></div>}
    </section>}
  </>;
}

export function DoctorPatients({ result }: { result: DataResult<DoctorPatientRow[]> }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => result.data?.filter((patient) => patient.name.toLowerCase().includes(query.toLowerCase())) ?? [], [result, query]);
  return <>
    <div className="page-heading"><div><h1>Patients</h1><p>Patients with an appointment history connected to your care.</p></div><span className="role-badge">{result.data?.length ?? 0} patients</span></div>
    {result.unavailable ? <UnavailableState detail="Your patient list could not be loaded. Only patients with appointments assigned to your verified account are included." /> : <section className="card doctor-workspace-card">
      <div className="doctor-workspace-toolbar"><span className="doctor-list-intro"><Users size={16} /> Your authorized patient list</span><label className="search-field"><Search size={15} /><input aria-label="Search patients" placeholder="Search patients" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label></div>
      {rows.length ? <div className="table-wrap"><table className="doctor-patients-table"><thead><tr><th>Patient</th><th>Appointments with you</th><th>Last completed visit</th><th>Next appointment</th><th aria-label="Open profile" /></tr></thead><tbody>{rows.map((patient) => <tr key={patient.id}>
        <td><Link href={`/doctor/patients/${encodeURIComponent(patient.id)}`} className="doctor-patient-link"><span className="avatar" aria-hidden="true">{patient.initials}</span><span><strong>{patient.name}</strong><small>View appointment history</small></span></Link></td>
        <td><span className="doctor-count"><CalendarDays size={14} />{patient.appointmentsCount}</span></td>
        <td>{dateOnly(patient.lastVisitAt)}</td>
        <td>{patient.nextAppointmentAt ? <span className="doctor-next-visit"><Clock3 size={14} />{dateTime(patient.nextAppointmentAt)}</span> : <span className="secondary-text">No upcoming visit</span>}</td>
        <td><Link className="doctor-open-patient" href={`/doctor/patients/${encodeURIComponent(patient.id)}`} aria-label={`Open ${patient.name}'s profile`}><ChevronRight size={17} /></Link></td>
      </tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-icon"><Users size={20} /></div><strong>{query ? "No matching patients" : "No patients yet"}</strong><p>{query ? "Try a different patient name." : "Patients with completed or upcoming appointments will appear here."}</p></div>}
    </section>}
  </>;
}

export function DoctorPatientRecord({ result }: { result: DataResult<DoctorPatientDetail> }) {
  if (result.unavailable || !result.data) return <><div className="page-heading"><div><Link className="back-link" href="/doctor/patients">← Back to patients</Link><h1>Patient details</h1></div></div><UnavailableState detail="This patient is not available in your authorized care list, or the CareNow API could not load the record." /></>;
  const { patient, appointments } = result.data;
  return <>
    <div className="page-heading"><div><Link className="back-link" href="/doctor/patients">← Back to patients</Link><h1 style={{ marginTop: 10 }}>{patient.name}</h1><p>Appointment history for your care relationship.</p></div><span className="role-badge">Authorized patient</span></div>
    <section className="content-grid doctor-patient-detail-grid">
      <article className="card doctor-patient-profile"><div className="avatar" aria-hidden="true">{patient.initials}</div><div><h2>{patient.name}</h2><p>Patient</p></div>{patient.phone && <div className="doctor-contact-line"><span>Phone</span><strong>{patient.phone}</strong></div>}<div className="doctor-contact-line"><span>Appointments with you</span><strong>{appointments.length}</strong></div></article>
      <article className="card doctor-workspace-card"><header className="card-header"><h2>Related appointments</h2></header>
        {appointments.length ? <div className="doctor-patient-history">{appointments.map((appointment) => <div className="doctor-history-row" key={appointment.id}>
          <div className="doctor-history-icon">{appointment.consultationType === "ONLINE" ? <Video size={17} /> : <MapPin size={17} />}</div>
          <div className="doctor-history-main"><strong>{dateTime(appointment.startTime)}</strong><span>{appointment.consultationType === "ONLINE" ? "Online consultation" : `In-person visit${appointment.location ? ` · ${appointment.location}` : ""}`}</span><small>Reason: {appointment.reason}</small></div>
          <span className={`status-pill ${statusClass(appointment.status)}`}>{statusLabel(appointment.status)}</span>
        </div>)}</div> : <div className="empty-state"><strong>No appointments available</strong><p>There are no appointments in your authorized care history.</p></div>}
      </article>
    </section>
    <div className="security-callout"><Users size={17} /><span>Patient details and appointment history are shown only for appointments assigned to your doctor account.</span></div>
  </>;
}
