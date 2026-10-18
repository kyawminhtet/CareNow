"use client";

import { useState } from "react";
import { useActionState } from "react";
import { CalendarDays, Clock3, MapPin, Pencil, Plus, Trash2, Video } from "lucide-react";
import type { AdminScheduleData, AdminScheduleSlot, DataResult } from "@/lib/portal-data";
import { createSlotAction, deleteSlotAction, updateSlotAction, type ScheduleActionState } from "@/app/(admin)/admin/schedules/actions";
import { UnavailableState } from "@/components/unavailable-state";
import { AdminWeeklyScheduleGenerator } from "@/components/admin-weekly-schedule-generator";

const EMPTY: ScheduleActionState = {};

export function AdminScheduleManager({ result }: { result: DataResult<AdminScheduleData> }) {
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  if (result.unavailable || !result.data) return <>
    <div className="page-heading"><div><h1>Doctor timeslots</h1><p>Create and manage appointment times on behalf of doctors.</p></div></div>
    <UnavailableState detail="Timeslots could not be loaded from the CareNow API." />
  </>;

  const data = result.data;
  const visibleSlots = doctorFilter === "all" ? data.items : data.items.filter((slot) => slot.doctorId === doctorFilter);
  return <>
    <div className="page-heading"><div><h1>Doctor timeslots</h1><p>Create, review, update, block or delete appointment times on behalf of active, verified doctors.</p></div><div className="slot-actions"><button className="button secondary" type="button" onClick={() => { setShowWeekly((value) => !value); setShowCreate(false); setEditingId(null); }}>{showWeekly ? "Close weekly generator" : "Generate weekly slots"}</button><button className="button" type="button" onClick={() => { setShowCreate((value) => !value); setShowWeekly(false); setEditingId(null); }}><Plus size={15} />{showCreate ? "Close form" : "Create timeslot"}</button></div></div>
    {showCreate && <CreateSlotForm data={data} />}
    {showWeekly && <AdminWeeklyScheduleGenerator data={data} />}
    <section className="card admin-slots-card">
      <header className="card-header"><div><h2>Available and blocked timeslots</h2><span className="step-hint">Times are displayed in Yangon time (MMT). Booked timeslots are protected from edits and deletion.</span></div>
        <label className="slot-filter"><span>Doctor</span><select value={doctorFilter} onChange={(event) => setDoctorFilter(event.currentTarget.value)}><option value="all">All doctors</option>{data.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>
      </header>
      {visibleSlots.length ? <div className="table-wrap"><table className="admin-slot-table"><thead><tr><th>Doctor</th><th>Date &amp; time</th><th>Consultation</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {visibleSlots.map((slot) => <tr key={slot.id}>
          {editingId === slot.id ? <td colSpan={5}><EditSlotForm slot={slot} data={data} onCancel={() => setEditingId(null)} /></td> : <>
            <td><strong>{slot.doctorName}</strong></td>
            <td><strong>{formatDate(slot.startsAt)}</strong><span className="slot-subline">{formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}</span></td>
            <td><span className="slot-type"><span className={`slot-type-icon${slot.consultationType === "IN_PERSON" ? " in-person" : ""}`}>{slot.consultationType === "ONLINE" ? <Video size={14} /> : <MapPin size={14} />}</span>{slot.consultationType === "ONLINE" ? "Online" : `In person${slot.clinicName ? ` · ${slot.clinicName}` : ""}`}</span></td>
            <td><SlotStatus status={slot.status} /></td>
            <td><div className="slot-actions">{slot.status !== "BOOKED" && <button className="button secondary small" type="button" onClick={() => setEditingId(slot.id)}><Pencil size={13} />Edit</button>}{slot.status !== "BOOKED" && <DeleteSlotButton slot={slot} />}</div></td>
          </>}
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><div className="empty-icon"><CalendarDays size={19} /></div><strong>No timeslots found</strong><p>Create a slot for an active, verified doctor to start managing their schedule.</p></div>}
    </section>
    <p className="slot-limit-note"><Clock3 size={14} />Showing up to 500 timeslots. Use the doctor filter to narrow this list.</p>
  </>;
}

function CreateSlotForm({ data }: { data: AdminScheduleData }) {
  const [state, action, pending] = useActionState(createSlotAction, EMPTY);
  const [doctorId, setDoctorId] = useState(data.doctors[0]?.id ?? "");
  const clinics = data.clinics.filter((clinic) => clinic.doctorId === doctorId);
  const doctor = data.doctors.find((item) => item.id === doctorId);
  const canCreateSlot = doctor?.services.includes("ONLINE") || clinics.length > 0;
  return <form action={action} className="card slot-form">
    <header className="card-header"><div><h2>Create timeslot</h2><span className="step-hint">The administrator action is audited and the slot is assigned to the selected doctor.</span></div></header>
    <SlotFields key={doctorId} data={data} doctorId={doctorId} setDoctorId={setDoctorId} clinics={clinics} />
    {state.error && <p className="auth-error" role="alert">{state.error}</p>}{state.success && <p className="doctor-action-success" role="status">{state.success}</p>}
    <div className="slot-form-footer"><button className="button" type="submit" disabled={pending || !canCreateSlot}>{pending ? "Creating…" : "Create timeslot"}</button></div>
  </form>;
}

function EditSlotForm({ slot, data, onCancel }: { slot: AdminScheduleSlot; data: AdminScheduleData; onCancel: () => void }) {
  const [state, action, pending] = useActionState(updateSlotAction.bind(null, slot.id), EMPTY);
  const [doctorId, setDoctorId] = useState(slot.doctorId);
  const clinics = data.clinics.filter((clinic) => clinic.doctorId === doctorId);
  return <form action={action} className="slot-edit-form">
    <div className="slot-edit-heading"><strong>Edit timeslot</strong><button type="button" className="text-link" onClick={onCancel}>Cancel</button></div>
    <SlotFields key={doctorId} data={data} doctorId={doctorId} setDoctorId={setDoctorId} clinics={clinics} initialClinicId={doctorId === slot.doctorId ? slot.clinicId ?? "" : undefined} initialConsultationType={doctorId === slot.doctorId ? slot.consultationType : undefined} startsAt={slot.startsAt} endsAt={slot.endsAt} status={slot.status === "BLOCKED" ? "BLOCKED" : "OPEN"} />
    {state.error && <p className="auth-error" role="alert">{state.error}</p>}{state.success && <p className="doctor-action-success" role="status">{state.success}</p>}
    <div className="slot-form-footer"><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div>
  </form>;
}

function SlotFields({ data, doctorId, setDoctorId, clinics, initialClinicId, initialConsultationType, startsAt, endsAt, status }: {
  data: AdminScheduleData; doctorId: string; setDoctorId: (id: string) => void;
  clinics: AdminScheduleData["clinics"]; initialClinicId?: string;
  initialConsultationType?: "ONLINE" | "IN_PERSON";
  startsAt?: string; endsAt?: string; status?: "OPEN" | "BLOCKED";
}) {
  const doctor = data.doctors.find((item) => item.id === doctorId);
  const canOfferOnline = doctor?.services.includes("ONLINE") ?? false;
  const canOfferInPerson = doctor?.services.includes("IN_PERSON") ?? false;
  const defaultType = canOfferInPerson && clinics.length > 0 ? "IN_PERSON" : canOfferOnline ? "ONLINE" : "IN_PERSON";
  const consultationType = initialConsultationType ?? defaultType;
  const clinicId = consultationType === "IN_PERSON" ? initialClinicId ?? clinics.find((clinic) => clinic.isPrimary)?.clinicId ?? clinics[0]?.clinicId ?? "" : "";
  return <div className="slot-fields">
    <label className="form-field"><span>Doctor</span><select name="doctorId" value={doctorId} onChange={(event) => setDoctorId(event.currentTarget.value)} required><option value="">Select doctor</option>{data.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.specialty}</option>)}</select></label>
    <input type="hidden" name="clinicId" value={clinicId} />
    <input type="hidden" name="consultationType" value={consultationType} />
    <label className="form-field"><span>Start (Yangon time)</span><input name="startsAt" type="datetime-local" defaultValue={startsAt ? toYangonLocal(startsAt) : undefined} required /></label>
    <label className="form-field"><span>End (Yangon time)</span><input name="endsAt" type="datetime-local" defaultValue={endsAt ? toYangonLocal(endsAt) : undefined} required /></label>
    {status && <label className="form-field"><span>Availability</span><select name="status" defaultValue={status}><option value="OPEN">Open for booking</option><option value="BLOCKED">Blocked</option></select></label>}
  </div>;
}

function DeleteSlotButton({ slot }: { slot: AdminScheduleSlot }) {
  const [state, action, pending] = useActionState(deleteSlotAction.bind(null, slot.id), EMPTY);
  return <form action={action} onSubmit={(event) => { if (!window.confirm(`Delete this timeslot for ${slot.doctorName}?`)) event.preventDefault(); }}><button className="button danger small" type="submit" disabled={pending} aria-label={`Delete timeslot for ${slot.doctorName}`}><Trash2 size={13} />{pending ? "Deleting…" : "Delete"}</button>{state.error && <span className="slot-inline-error" role="alert">{state.error}</span>}</form>;
}

function SlotStatus({ status }: { status: AdminScheduleSlot["status"] }) {
  const label = status === "OPEN" ? "Open" : status === "BLOCKED" ? "Blocked" : "Booked";
  const className = status === "OPEN" ? "progress" : status === "BLOCKED" ? "waiting" : "complete";
  return <span className={`status-pill ${className}`}>{label}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Yangon" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Yangon" }).format(new Date(value));
}

function toYangonLocal(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Yangon" }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}
