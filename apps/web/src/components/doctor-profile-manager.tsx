"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, LoaderCircle, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { removeDoctorPhotoAction, updateDoctorPersonalAction, updateDoctorProfileAction, uploadDoctorPhotoAction, type DoctorPhotoActionState } from "@/app/(doctor)/doctor/profile/actions";

export function DoctorProfileManager({ profile }: { profile: { displayName: string; email: string; phone: string; specialty: string; biography: string; qualifications: string; experienceYears: number; languages: string[]; services: string[]; licenseNumber: string; licenseRegion: string; licenseExpiry: string; profilePhotoUrl: string | null } }) {
  const [personalState, personalAction, savingPersonal] = useActionState(updateDoctorPersonalAction, {} as DoctorPhotoActionState);
  const [profileState, profileAction, saving] = useActionState(updateDoctorProfileAction, {} as DoctorPhotoActionState);
  const [uploadState, uploadAction, uploading] = useActionState(uploadDoctorPhotoAction, {} as DoctorPhotoActionState);
  const [removeState, removeAction, removing] = useActionState(removeDoctorPhotoAction, {} as DoctorPhotoActionState);
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const state = uploadState.error || uploadState.success ? uploadState : removeState;
  return <>
    <div className="page-heading"><div><h1>Profile</h1><p>Manage the professional details and photo patients see when they browse doctors.</p></div></div>
    <section className="card doctor-profile-manager">
      <div className="doctor-profile-photo-wrap">
        {profile.profilePhotoUrl ? <img className="doctor-profile-photo" src={profile.profilePhotoUrl} alt={`${profile.displayName} profile`} /> : <div className="doctor-profile-photo doctor-profile-photo-empty"><UserRound size={44} /></div>}
        <div><strong>{profile.displayName}</strong><span>{profile.specialty}</span><span className="secondary-text">Public profile photo</span></div>
      </div>
      <div className="doctor-profile-photo-actions">
        <form action={uploadAction}>
          <input ref={input} name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="doctor-photo-input" aria-label="Choose a profile photo" onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")} />
          <button className="button" type="button" onClick={() => input.current?.click()}><Camera size={15} />Choose photo</button>
          <button className="button secondary" type="submit" disabled={uploading}>{uploading ? <LoaderCircle className="spin" size={15} /> : null}{uploading ? "Uploading…" : "Upload photo"}</button>
          {fileName && <span className="secondary-text doctor-photo-filename">{fileName}</span>}
        </form>
        {profile.profilePhotoUrl && <form action={removeAction}><button className="button danger" type="submit" disabled={removing}><Trash2 size={14} />{removing ? "Removing…" : "Remove photo"}</button></form>}
      </div>
      <p className="secondary-text doctor-photo-guidance">Use a clear headshot in JPEG, PNG, or WebP format. Maximum file size: 5 MB.</p>
      {state.error && <p className="auth-error" role="alert">{state.error}</p>}{state.success && <p className="doctor-action-success" role="status">{state.success}</p>}
    </section>
    <form action={personalAction} className="card doctor-profile-edit-form">
      <header><div><h2>Personal information</h2><p>Update the name and phone number used for your CareNow account.</p></div></header>
      <div className="doctor-profile-fields">
        <Field name="fullName" label="Full name" defaultValue={profile.displayName} required />
        <Field name="phone" label="Phone number" defaultValue={profile.phone} required />
        <div className="form-field"><label htmlFor="doctor-profile-email">Sign-in email</label><input id="doctor-profile-email" type="email" value={profile.email} readOnly /><small>Email changes require confirmation and are managed through your account sign-in settings.</small></div>
      </div>
      {personalState.error && <p className="auth-error" role="alert">{personalState.error}</p>}{personalState.success && <p className="doctor-action-success" role="status">{personalState.success}</p>}
      <button className="button" type="submit" disabled={savingPersonal}>{savingPersonal ? <LoaderCircle className="spin" size={15} /> : <Save size={14} />}{savingPersonal ? "Saving…" : "Save personal information"}</button>
    </form>
    <form action={profileAction} className="card doctor-profile-edit-form">
      <header><div><h2>Professional information</h2><p>Update the details patients see on your doctor profile.</p></div></header>
      <div className="doctor-profile-fields">
        <Field name="specialty" label="Specialty" defaultValue={profile.specialty} required />
        <Field name="qualifications" label="Qualifications" defaultValue={profile.qualifications} required />
        <Field name="experienceYears" label="Years of experience" type="number" defaultValue={String(profile.experienceYears)} min="0" max="100" required />
        <Field name="languages" label="Languages (comma separated)" defaultValue={profile.languages.join(", ")} required />
        <div className="form-field doctor-profile-biography"><label htmlFor="doctor-biography">Professional biography</label><textarea id="doctor-biography" name="biography" rows={5} maxLength={2000} defaultValue={profile.biography} placeholder="Introduce your experience and approach to care." /></div>
      </div>
      <fieldset className="doctor-profile-services"><legend>Consultation services</legend>
        <label><input type="checkbox" name="services" value="ONLINE" defaultChecked={profile.services.includes("ONLINE")} />Online consultation</label>
        <label><input type="checkbox" name="services" value="IN_PERSON" defaultChecked={profile.services.includes("IN_PERSON")} />In-person consultation</label>
      </fieldset>
      <div className="doctor-license-note"><ShieldCheck size={17} /><span>Medical license details are verified records. Contact your administrator to update your license number, region, or expiry date.</span></div>
      <p className="secondary-text">License on file: {profile.licenseNumber} · {profile.licenseRegion}{profile.licenseExpiry ? ` · Expires ${profile.licenseExpiry}` : ""}</p>
      {profileState.error && <p className="auth-error" role="alert">{profileState.error}</p>}{profileState.success && <p className="doctor-action-success" role="status">{profileState.success}</p>}
      <button className="button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={14} />}{saving ? "Saving…" : "Save profile"}</button>
    </form>
  </>;
}

function Field({ name, label, defaultValue, type = "text", required = false, min, max }: { name: string; label: string; defaultValue: string; type?: string; required?: boolean; min?: string; max?: string }) {
  return <div className="form-field"><label htmlFor={`doctor-profile-${name}`}>{label}</label><input id={`doctor-profile-${name}`} name={name} type={type} defaultValue={defaultValue} required={required} min={min} max={max} /></div>;
}
