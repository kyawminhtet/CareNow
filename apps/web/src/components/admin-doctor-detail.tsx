"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, FileCheck2, LockKeyhole, Save, ShieldCheck, UserRoundX } from "lucide-react";
import type { AdminDoctorProfile } from "@/lib/portal-data";
import {
  deactivateDoctorAction,
  updateDoctorAccountAction,
  updateDoctorProfileAction,
  updateDoctorVerificationAction,
  type DoctorAdminActionState,
} from "@/app/(admin)/admin/doctors/actions";

export function AdminDoctorDetail({ doctor }: { doctor: AdminDoctorProfile }) {
  const [profileState, profileAction, profilePending] = useActionState(updateDoctorProfileAction.bind(null, doctor.id), {} as DoctorAdminActionState);
  const [verificationState, verificationAction, verificationPending] = useActionState(updateDoctorVerificationAction.bind(null, doctor.id), {} as DoctorAdminActionState);
  const [accountState, accountAction, accountPending] = useActionState(updateDoctorAccountAction.bind(null, doctor.id), {} as DoctorAdminActionState);
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(deactivateDoctorAction.bind(null, doctor.id), {} as DoctorAdminActionState);

  return <>
    <div className="page-heading"><div><Link href="/admin/doctors" className="back-link"><ArrowLeft size={14} />Back to doctors</Link><h1 style={{ marginTop: 12 }}>{doctor.displayName}</h1><p>{doctor.email ?? "Email unavailable"} · {doctor.specialty}</p></div><div className="doctor-state-badges"><span className="list-status">{doctor.accountStatus}</span><span className={`role-badge${doctor.verificationStatus === "VERIFIED" ? "" : " admin"}`}>{doctor.verificationStatus}</span></div></div>

    <section className="admin-doctor-layout">
      <article className="card admin-doctor-profile-card">
        <header className="card-header"><div><h2>Professional profile</h2><span className="secondary-text">Edit information and services on file.</span></div></header>
        <form action={profileAction} className="doctor-edit-form">
          <div className="field-grid">
            <Field name="fullName" label="Full name" defaultValue={doctor.displayName} required />
            <Field name="phone" label="Phone number" defaultValue={doctor.phone ?? ""} required />
            <Field name="specialty" label="Specialty" defaultValue={doctor.specialty} required />
            <Field name="licenseNumber" label="License number" defaultValue={doctor.licenseNumber} required />
            <Field name="licenseRegion" label="License region" defaultValue={doctor.licenseRegion} required />
            <Field name="licenseExpiry" label="License expiry" type="date" defaultValue={doctor.licenseExpiry} required />
            <Field name="qualifications" label="Qualifications" defaultValue={doctor.qualifications} required />
            <Field name="experienceYears" label="Years of experience" type="number" min="0" defaultValue={String(doctor.experienceYears)} required />
            <Field name="languages" label="Languages (comma separated)" defaultValue={doctor.languages.join(", ")} required />
          </div>
          <fieldset className="doctor-services-edit"><legend>Consultation services</legend>
            <label><input type="checkbox" name="services" value="ONLINE" defaultChecked={doctor.services.includes("ONLINE")} />Online</label>
            <label><input type="checkbox" name="services" value="IN_PERSON" defaultChecked={doctor.services.includes("IN_PERSON")} />In-person</label>
          </fieldset>
          <ActionMessage state={profileState} />
          <button className="button" type="submit" disabled={profilePending}>{profilePending ? "Saving…" : <><Save size={14} />Save profile</>}</button>
        </form>
      </article>

      <div className="admin-doctor-side-stack">
        <article className="card">
          <header className="card-header"><div><h2>Verification review</h2><span className="secondary-text">Approve the submitted credentials after reviewing the documents.</span></div><ShieldCheck size={17} /></header>
          <div className="doctor-documents">{doctor.documents.length ? doctor.documents.map((document) => <div className="doctor-document" key={document.id}>
            <div className="empty-icon"><FileCheck2 size={17} /></div><div><strong>{document.type.replaceAll("_", " ")}</strong><span>{document.status} · {new Date(document.uploadedAt).toLocaleDateString("en", { timeZone: "Asia/Yangon" })}</span></div>
            <a className="button secondary small" href={document.signedUrl} target="_blank" rel="noreferrer">View</a>
          </div>) : <div className="empty-state"><strong>No documents</strong><p>This doctor has not uploaded verification documents.</p></div>}</div>
          <form action={verificationAction} className="doctor-review-form">
            <label htmlFor="verification-reason">Reason or information request</label><textarea id="verification-reason" name="reason" rows={3} maxLength={1000} placeholder="Explain what needs review or update." />
            <ActionMessage state={verificationState} />
            <div className="doctor-action-buttons">
              {doctor.verificationStatus === "PENDING" ? <button className="button teal" name="action" value="APPROVE" disabled={verificationPending}>{verificationPending ? "Approving…" : "Approve"}</button> : <span className="status-pill verified">{doctor.verificationStatus === "VERIFIED" ? "Approved" : doctor.verificationStatus}</span>}
              <button className="button secondary" name="action" value="REQUEST_INFORMATION" disabled={verificationPending}>Request information</button>
              <button className="button danger" name="action" value="REJECT" disabled={verificationPending}>Reject</button>
            </div>
          </form>
        </article>

        <article className="card">
          <header className="card-header"><div><h2>Account access</h2><span className="secondary-text">Access and verification are managed separately.</span></div><LockKeyhole size={17} /></header>
          <form action={accountAction} className="doctor-access-actions">
            <ActionMessage state={accountState} />
            <div className="doctor-action-buttons">
              {doctor.accountStatus === "ACTIVE" ? <span className="status-pill verified">Active</span> : <button className="button teal" name="status" value="ACTIVE" disabled={accountPending}>{accountPending ? "Activating…" : "Activate"}</button>}
              <button className="button secondary" name="status" value="SUSPENDED" disabled={accountPending}>Suspend</button>
              <button className="button danger" name="status" value="INACTIVE" disabled={accountPending}>Deactivate</button>
            </div>
          </form>
          <form action={deactivateAction} className="doctor-remove-form">
            <p>Remove this doctor from active operations while keeping verification documents and history for audit purposes.</p>
            <ActionMessage state={deactivateState} />
            <button className="button danger" type="submit" disabled={deactivatePending}><UserRoundX size={14} />{deactivatePending ? "Deactivating…" : "Deactivate doctor"}</button>
          </form>
        </article>
      </div>
    </section>
  </>;
}

function Field({ name, label, defaultValue, type = "text", required = false, min }: { name: string; label: string; defaultValue: string; type?: string; required?: boolean; min?: string }) {
  return <div className="form-field"><label htmlFor={`doctor-${name}`}>{label}</label><input id={`doctor-${name}`} name={name} type={type} defaultValue={defaultValue} required={required} min={min} /></div>;
}

function ActionMessage({ state }: { state: DoctorAdminActionState }) {
  if (state.error) return <p className="auth-error" role="alert">{state.error}</p>;
  if (state.success) return <p className="doctor-action-success" role="status">{state.success}</p>;
  return null;
}
