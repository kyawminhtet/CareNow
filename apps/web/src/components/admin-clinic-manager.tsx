"use client";

import { useState, useActionState } from "react";
import { MapPin, Pencil, Plus, X } from "lucide-react";
import type { AdminClinicsData, DataResult } from "@/lib/portal-data";
import { activateClinicAction, createClinicAction, deactivateClinicAction, updateClinicAction, type ClinicActionState } from "@/app/(admin)/admin/clinics/actions";
import { UnavailableState } from "@/components/unavailable-state";

const EMPTY: ClinicActionState = {};

export function AdminClinicManager({ result }: { result: DataResult<AdminClinicsData> }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  if (result.unavailable || !result.data) return <UnavailableState detail="Clinic records could not be loaded from the CareNow API." />;
  const clinics = result.data.items;
  return <>
    <div className="page-heading"><div><p className="step-hint">Active clinics appear in doctor assignment and in-person timeslot forms. Deactivated clinics remain in historical records.</p></div><button className="button" type="button" onClick={() => { setShowCreate((value) => !value); setEditingId(null); }}><Plus size={15} />{showCreate ? "Close form" : "Create clinic"}</button></div>
    {showCreate && <ClinicForm />}
    <section className="card admin-slots-card">
      <header className="card-header"><div><h2>Clinics</h2><span className="step-hint">Update clinic details or deactivate a location. Deactivation preserves assignments and appointment history.</span></div></header>
      {clinics.length ? <div className="table-wrap"><table className="admin-slot-table"><thead><tr><th>Clinic</th><th>Address</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {clinics.map((clinic) => editingId === clinic.id ? <tr key={clinic.id}><td colSpan={4}><ClinicForm clinic={clinic} onCancel={() => setEditingId(null)} /></td></tr> : <tr key={clinic.id}>
          <td><strong>{clinic.name}</strong></td><td>{clinic.address}<span className="slot-subline">{clinic.city}, {clinic.region}</span></td>
          <td><span className={`status-pill ${clinic.isActive ? "progress" : "waiting"}`}>{clinic.isActive ? "Active" : "Inactive"}</span></td>
          <td><div className="slot-actions">{clinic.isActive ? <><button className="button secondary small" type="button" onClick={() => { setEditingId(clinic.id); setShowCreate(false); }}><Pencil size={13} />Edit</button><DeactivateButton clinic={clinic} /></> : <ActivateButton clinic={clinic} />}</div></td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><div className="empty-icon"><MapPin size={19} /></div><strong>No clinics yet</strong><p>Create a clinic, assign it to a doctor, then select it when creating an in-person timeslot.</p></div>}
    </section>
  </>;
}

function ClinicForm({ clinic, onCancel }: { clinic?: AdminClinicsData["items"][number]; onCancel?: () => void }) {
  const actionCreator = clinic ? updateClinicAction.bind(null, clinic.id) : createClinicAction;
  const [state, action, pending] = useActionState(actionCreator, EMPTY);
  return <form action={action} className="card slot-form">
    <header className="card-header"><div><h2>{clinic ? "Edit clinic" : "Create clinic"}</h2><span className="step-hint">Enter the location details displayed to doctors and patients.</span></div>{onCancel && <button className="button secondary small" type="button" onClick={onCancel}><X size={13} />Cancel</button>}</header>
    <div className="slot-fields">
      <label className="form-field"><span>Clinic name</span><input name="name" maxLength={120} required defaultValue={clinic?.name} /></label>
      <label className="form-field"><span>Street address</span><input name="address" maxLength={300} required defaultValue={clinic?.address} /></label>
      <label className="form-field"><span>City / township</span><input name="city" maxLength={100} required defaultValue={clinic?.city} /></label>
    </div>
    {state.error && <p className="auth-error" role="alert">{state.error}</p>}{state.success && <p className="doctor-action-success" role="status">{state.success}</p>}
    <div className="slot-form-footer"><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : clinic ? "Save clinic" : "Create clinic"}</button></div>
  </form>;
}

function DeactivateButton({ clinic }: { clinic: AdminClinicsData["items"][number] }) {
  const [state, action, pending] = useActionState(deactivateClinicAction.bind(null, clinic.id), EMPTY);
  return <form action={action} onSubmit={(event) => { if (!window.confirm(`Deactivate ${clinic.name}? Existing assignments and appointments will remain in history.`)) event.preventDefault(); }}>
    <button className="button danger small" type="submit" disabled={pending}>{pending ? "Saving…" : "Deactivate"}</button>{state.error && <span className="slot-inline-error" role="alert">{state.error}</span>}{state.success && <span className="slot-inline-success" role="status">{state.success}</span>}
  </form>;
}

function ActivateButton({ clinic }: { clinic: AdminClinicsData["items"][number] }) {
  const [state, action, pending] = useActionState(activateClinicAction.bind(null, clinic.id), EMPTY);
  return <form action={action}><button className="button secondary small" type="submit" disabled={pending}>{pending ? "Saving…" : "Reactivate"}</button>{state.error && <span className="slot-inline-error" role="alert">{state.error}</span>}{state.success && <span className="slot-inline-success" role="status">{state.success}</span>}</form>;
}
