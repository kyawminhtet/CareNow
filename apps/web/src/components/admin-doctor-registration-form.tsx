"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileCheck2, MailCheck, ShieldCheck, Stethoscope } from "lucide-react";
import { inviteDoctorAction, type AdminDoctorRegistrationState } from "@/app/(admin)/admin/doctors/new/actions";

const steps = ["Account", "Professional", "Services", "Availability", "Documents & review"];

export function AdminDoctorRegistrationForm() {
  const [step, setStep] = useState(0);
  const [availabilityEnabled, setAvailabilityEnabled] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(inviteDoctorAction, {} as AdminDoctorRegistrationState);

  function continueStep() {
    const activeStep = formRef.current?.querySelector<HTMLElement>(".registration-fields:not([hidden])");
    if (!activeStep) return;
    const invalid = Array.from(activeStep.querySelectorAll<HTMLInputElement>("input")).find((input) => !input.checkValidity());
    if (invalid) { invalid.reportValidity(); return; }
    if (step === 2 && !activeStep.querySelector<HTMLInputElement>('input[name="services"]:checked')) {
      const serviceInput = activeStep.querySelector<HTMLInputElement>('input[name="services"]');
      serviceInput?.setCustomValidity("Select at least one consultation service.");
      serviceInput?.reportValidity();
      serviceInput?.setCustomValidity("");
      return;
    }
    if (step === 3 && activeStep.querySelector<HTMLInputElement>('input[name="initialAvailability"]:checked')) {
      if (!activeStep.querySelector<HTMLInputElement>('input[name="availabilityDays"]:checked')) {
        activeStep.querySelector<HTMLInputElement>('input[name="availabilityDays"]')?.focus();
        return;
      }
      const onlineService = formRef.current?.querySelector<HTMLInputElement>('input[name="services"][value="ONLINE"]:checked');
      if (!onlineService) {
        activeStep.querySelector<HTMLInputElement>('input[name="initialAvailability"]')?.focus();
        return;
      }
      const invalidTime = Array.from(activeStep.querySelectorAll<HTMLInputElement>('input[type="time"]')).find((input) => !input.checkValidity());
      if (invalidTime) { invalidTime.reportValidity(); return; }
    }
    setStep((current) => current + 1);
  }

  if (state.invitedEmail) return <section className="card registration-success">
    <div className="success-check"><MailCheck size={28} /></div><span className="role-badge admin">Invitation sent</span>
    <h1>Doctor account created</h1>
    <p>An account activation email was sent to <strong>{state.invitedEmail}</strong>. The account remains invited and the doctor remains pending verification until activation and review are complete.</p>
    <div className="record-keyline"><span>Account status</span><strong>Invited</strong></div><div className="record-keyline"><span>Verification</span><strong>Pending</strong></div>
    <Link className="button" href="/admin/doctors">Return to doctors</Link>
  </section>;

  return <>
    <div className="page-heading"><div><Link href="/admin/doctors" className="back-link"><ArrowLeft size={14} />Back to doctors</Link><h1 style={{ marginTop: 12 }}>Register a doctor</h1><p>Create an invitation and submit professional details for verification.</p></div><span className="role-badge admin">Administrator</span></div>
    <section className="card registration-card admin-registration-card">
      <div className="registration-heading"><div><span className="eyebrow-blue">Controlled account setup</span><h2>Doctor invitation wizard</h2><p>The doctor will choose a password using a secure email link. Clinical access stays locked until verification and activation.</p></div><div className="registration-icon"><Stethoscope size={22} /></div></div>
      <ol className="wizard-steps" aria-label="Registration progress">{steps.map((label, index) => <li key={label} className={index === step ? "current" : index < step ? "done" : ""}><span>{index < step ? <CheckCircle2 size={14} /> : index + 1}</span><strong>{label}</strong></li>)}</ol>
      {state.error && <div className="auth-error" role="alert">{state.error}</div>}
      <form ref={formRef} action={action} encType="multipart/form-data">
        <div className="registration-fields" hidden={step !== 0}>
          <h2>Account information</h2><p className="step-hint">An invitation link will be sent to this email so the doctor can activate the account and set a password.</p>
          <div className="field-grid"><RegistrationField id="fullName" label="Full name" placeholder="Dr. Olivia Patel" required={step === 0} /><RegistrationField id="email" label="Email" type="email" placeholder="doctor@example.com" required={step === 0} /><RegistrationField id="phone" label="Phone number" type="tel" placeholder="+95 …" required={step === 0} /></div>
        </div>
        <div className="registration-fields" hidden={step !== 1}>
          <h2>Professional details</h2><p className="step-hint">These details and uploaded documents enter the verification queue.</p>
          <div className="field-grid"><RegistrationField id="specialty" label="Specialty" placeholder="General Medicine" required={step === 1} /><RegistrationField id="licenseNumber" label="Medical license number" required={step === 1} /><RegistrationField id="licenseRegion" label="License issuing country or region" placeholder="Myanmar" required={step === 1} /><RegistrationField id="licenseExpiry" label="License expiry" type="date" required={step === 1} /><RegistrationField id="qualifications" label="Qualifications" placeholder="MBBS, MD" required={step === 1} /><RegistrationField id="experienceYears" label="Years of experience" type="number" min="0" required={step === 1} /><RegistrationField id="languages" label="Languages spoken" placeholder="English, Burmese" required={step === 1} /></div>
        </div>
        <div className="registration-fields" hidden={step !== 2}>
          <h2>Consultation services</h2><p className="step-hint">Select the services this doctor expects to offer. Clinic and availability setup can be completed after account invitation.</p>
          <label className="service-choice"><input type="checkbox" name="services" value="ONLINE" /><span className="service-choice-icon"><Stethoscope size={18} /></span><span><strong>Online consultations</strong><small>Secure video consultations.</small></span></label>
          <label className="service-choice"><input type="checkbox" name="services" value="IN_PERSON" /><span className="service-choice-icon teal"><FileCheck2 size={18} /></span><span><strong>In-person consultations</strong><small>In-person visits at an assigned clinic.</small></span></label>
        </div>
        <div className="registration-fields" hidden={step !== 3}>
          <h2>Initial availability</h2><p className="step-hint">Optionally set a recurring weekly online schedule now. In-person schedules need an assigned clinic and can be configured after invitation.</p>
          <label className="service-choice"><input type="checkbox" name="initialAvailability" value="on" checked={availabilityEnabled} onChange={(event) => setAvailabilityEnabled(event.currentTarget.checked)} /><span className="service-choice-icon"><CheckCircle2 size={18} /></span><span><strong>Set initial online hours</strong><small>These hours become availability rules and can be adjusted later.</small></span></label>
          <fieldset className="availability-days"><legend>Available days</legend>{[["0", "Sunday"], ["1", "Monday"], ["2", "Tuesday"], ["3", "Wednesday"], ["4", "Thursday"], ["5", "Friday"], ["6", "Saturday"]].map(([value, label]) => <label key={value}><input type="checkbox" name="availabilityDays" value={value} /><span>{label}</span></label>)}</fieldset>
          <div className="field-grid"><RegistrationField id="availabilityStart" label="Start time" type="time" required={availabilityEnabled} /><RegistrationField id="availabilityEnd" label="End time" type="time" required={availabilityEnabled} /><div className="form-field"><label htmlFor="slotMinutes">Appointment duration</label><select id="slotMinutes" name="slotMinutes" defaultValue="30"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></div></div>
        </div>
        <div className="registration-fields" hidden={step !== 4}>
          <h2>Verification documents</h2><p className="step-hint">Files are stored in private verification storage and are not exposed to patients.</p>
          <div className="field-grid"><UploadField id="licenseDocument" label="Medical license" required={step === 4} /><UploadField id="qualificationDocument" label="Qualification documents" required={step === 4} /><UploadField id="identityDocument" label="Identity document" required={step === 4} /></div>
          <label className="terms-check"><input type="checkbox" name="termsAccepted" required={step === 4} /><span>I confirm that the information was provided for doctor registration and verification.</span></label>
          <div className="security-callout"><ShieldCheck size={17} /><span>The account is created as Invited and the doctor profile as Pending. Invitation does not grant access to clinical tools or make the doctor bookable.</span></div>
        </div>
        <div className="wizard-controls">{step > 0 ? <button type="button" className="button secondary" onClick={() => setStep((current) => current - 1)}><ArrowLeft size={14} />Back</button> : <span />}{step < steps.length - 1 ? <button type="button" className="button" onClick={continueStep}>Continue<ArrowRight size={14} /></button> : <button className="button" type="submit" disabled={pending}>{pending ? "Creating invitation…" : <>Create doctor invitation<MailCheck size={15} /></>}</button>}</div>
      </form>
    </section>
  </>;
}

function RegistrationField({ id, label, type = "text", required = false, placeholder, min }: { id: string; label: string; type?: string; required?: boolean; placeholder?: string; min?: string }) {
  return <div className="form-field"><label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label><input id={id} name={id} type={type} required={required} placeholder={placeholder} min={min} /></div>;
}

function UploadField({ id, label, required }: { id: string; label: string; required: boolean }) {
  return <div className="form-field upload-field"><label htmlFor={id}>{label} {required && <span aria-hidden="true">*</span>}</label><input id={id} name={id} type="file" accept="application/pdf,image/jpeg,image/png" required={required} /><small>PDF, JPG or PNG, up to 10 MB</small></div>;
}
