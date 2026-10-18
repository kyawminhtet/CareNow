"use client";

import { useActionState } from "react";
import { MapPin, Plus, Star, Trash2 } from "lucide-react";
import type { AdminClinicAssignmentData, DataResult } from "@/lib/portal-data";
import { createClinicAssignmentAction, deleteClinicAssignmentAction, primaryClinicAction, type ClinicAssignmentActionState } from "@/app/(admin)/admin/schedules/clinics/actions";
import { UnavailableState } from "@/components/unavailable-state";

const EMPTY: ClinicAssignmentActionState = {};

export function AdminClinicAssignmentManager({ result }: { result: DataResult<AdminClinicAssignmentData> }) {
  if (result.unavailable || !result.data) return <UnavailableState detail="Clinic assignments could not be loaded from the CareNow API." />;
  const { doctors, clinics, assignments } = result.data;
  const assigned = new Set(assignments.map((item) => `${item.doctorId}:${item.clinicId}`));
  return <>
    <CreateAssignmentForm doctors={doctors} clinics={clinics} assigned={assigned} />
    <section className="card admin-slots-card">
      <header className="card-header"><div><h2>Doctor clinic assignments</h2><span className="step-hint">A doctor can have multiple clinics and one primary clinic. Existing schedule data is protected when removing an assignment.</span></div></header>
      {assignments.length ? <div className="table-wrap"><table className="admin-slot-table"><thead><tr><th>Doctor</th><th>Clinic</th><th>Location</th><th>Primary</th><th>Actions</th></tr></thead><tbody>
        {assignments.map((item) => <tr key={`${item.doctorId}:${item.clinicId}`}>
          <td><strong>{item.doctorName}</strong><span className="slot-subline">{item.specialty}</span></td>
          <td><strong>{item.clinicName}</strong></td>
          <td>{item.address}<span className="slot-subline">{item.city}, {item.region}</span></td>
          <td>{item.isPrimary ? <span className="status-pill progress"><Star size={12} /> Primary</span> : <PrimaryButton doctorId={item.doctorId} clinicId={item.clinicId} />}</td>
          <td><DeleteAssignmentButton doctorId={item.doctorId} clinicId={item.clinicId} doctorName={item.doctorName} clinicName={item.clinicName} /></td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><div className="empty-icon"><MapPin size={19} /></div><strong>No clinic assignments</strong><p>Assign an active clinic to a doctor who offers in-person consultations.</p></div>}
    </section>
  </>;
}

function CreateAssignmentForm({ doctors, clinics, assigned }: { doctors: AdminClinicAssignmentData["doctors"]; clinics: AdminClinicAssignmentData["clinics"]; assigned: Set<string> }) {
  const [state, action, pending] = useActionState(createClinicAssignmentAction, EMPTY);
  const available = doctors.flatMap((doctor) => clinics.filter((clinic) => !assigned.has(`${doctor.id}:${clinic.id}`)).map((clinic) => ({ doctor, clinic })));
  return <form action={action} className="card slot-form">
    <header className="card-header"><div><h2>Assign a clinic</h2><span className="step-hint">Only active doctors with an in-person service and active clinics are listed.</span></div></header>
    <div className="slot-fields">
      <label className="form-field"><span>Doctor</span><select name="doctorId" required defaultValue=""><option value="" disabled>Select doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.specialty}</option>)}</select></label>
      <label className="form-field"><span>Clinic</span><select name="clinicId" required defaultValue=""><option value="" disabled>Select clinic</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name} · {clinic.city}</option>)}</select></label>
      <label className="form-field"><span>Primary clinic</span><select name="isPrimary" defaultValue="false"><option value="false">No</option><option value="true">Yes</option></select></label>
    </div>
    {state.error && <p className="auth-error" role="alert">{state.error}</p>}{state.success && <p className="doctor-action-success" role="status">{state.success}</p>}
    {doctors.length === 0 && <p className="step-hint">No active doctors offering in-person consultations are available.</p>}{clinics.length === 0 && <p className="step-hint">No active clinics are available. Add or activate clinic records in Supabase first.</p>}
    {available.length === 0 && doctors.length > 0 && clinics.length > 0 && <p className="step-hint">Every doctor and clinic combination is already assigned.</p>}
    <div className="slot-form-footer"><button className="button" type="submit" disabled={pending || available.length === 0}><Plus size={15} />{pending ? "Assigning…" : "Assign clinic"}</button></div>
  </form>;
}

function PrimaryButton({ doctorId, clinicId }: { doctorId: string; clinicId: string }) {
  const [state, action, pending] = useActionState(primaryClinicAction.bind(null, doctorId, clinicId, true), EMPTY);
  return <form action={action}><button className="button secondary small" type="submit" disabled={pending}>{pending ? "Saving…" : "Set primary"}</button>{state.error && <span className="slot-inline-error" role="alert">{state.error}</span>}{state.success && <span className="slot-inline-success" role="status">{state.success}</span>}</form>;
}

function DeleteAssignmentButton({ doctorId, clinicId, doctorName, clinicName }: { doctorId: string; clinicId: string; doctorName: string; clinicName: string }) {
  const [state, action, pending] = useActionState(deleteClinicAssignmentAction.bind(null, doctorId, clinicId), EMPTY);
  return <form action={action} onSubmit={(event) => { if (!window.confirm(`Remove ${clinicName} from ${doctorName}? Existing schedule references must be cleared first.`)) event.preventDefault(); }}>
    <button className="button danger small" type="submit" disabled={pending}><Trash2 size={13} />{pending ? "Removing…" : "Remove"}</button>{state.error && <span className="slot-inline-error" role="alert">{state.error}</span>}{state.success && <span className="slot-inline-success" role="status">{state.success}</span>}
  </form>;
}
