"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileCheck2, HeartHandshake, ShieldCheck, Stethoscope } from "lucide-react";
import { registerDoctorAction, type RegistrationActionState } from "./actions";

const steps = ["Account", "Professional", "Services", "Documents & review"];

export function DoctorRegistrationForm() {
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(registerDoctorAction, {} as RegistrationActionState);
  function continueStep() {
    const activeStep = formRef.current?.querySelector<HTMLElement>(".registration-fields:not([hidden])");
    if (!activeStep) return;
    const invalidControl = Array.from(activeStep.querySelectorAll<HTMLInputElement>("input")).find((input) => !input.checkValidity());
    if (invalidControl) { invalidControl.reportValidity(); return; }
    if (step === 2 && !activeStep.querySelector<HTMLInputElement>('input[name="services"]:checked')) {
      activeStep.querySelector<HTMLInputElement>('input[name="services"]')?.setCustomValidity("Select at least one service.");
      activeStep.querySelector<HTMLInputElement>('input[name="services"]')?.reportValidity();
      activeStep.querySelector<HTMLInputElement>('input[name="services"]')?.setCustomValidity("");
      return;
    }
    setStep((current) => current + 1);
  }
  if (state.submitted) return <main className="registration-page"><div className="registration-brand"><Link className="brand" href="/"><span className="brand-mark"><HeartHandshake size={19} /></span>CareNow</Link></div><section className="card registration-success"><div className="success-check"><CheckCircle2 size={29} /></div><span className="role-badge">Registration received</span><h1>Check your email to continue</h1><p>Your professional registration was submitted to CareNow. Follow the email verification link to confirm your account. Clinical access remains locked until your documents are reviewed and your account is activated.</p><Link className="button" href="/sign-in">Return to sign in</Link></section></main>;

  return <main className="registration-page">
    <div className="registration-brand"><Link className="brand" href="/"><span className="brand-mark"><HeartHandshake size={19} /></span>CareNow</Link><span>Doctor registration</span></div>
    <section className="card registration-card">
      <div className="registration-heading"><div><span className="eyebrow-blue">Join the CareNow network</span><h1>Create your doctor account</h1><p>Share your professional details for verification. Your clinical workspace opens after approval.</p></div><div className="registration-icon"><Stethoscope size={22} /></div></div>
      <ol className="wizard-steps" aria-label="Registration progress">{steps.map((label, index) => <li key={label} className={index === step ? "current" : index < step ? "done" : ""}><span>{index < step ? <CheckCircle2 size={14} /> : index + 1}</span><strong>{label}</strong></li>)}</ol>
      {state.error && <div className="auth-error" role="alert">{state.error}</div>}
      <form ref={formRef} action={action}>
        <div className="registration-fields" hidden={step !== 0}>
          <h2>Account information</h2><p className="step-hint">Use an email address you can access. CareNow will send an email verification link.</p>
          <div className="field-grid"><FormField id="fullName" label="Full name" placeholder="Dr. Olivia Patel" required={step === 0} /><FormField id="email" label="Email" type="email" placeholder="you@example.com" required={step === 0} /><FormField id="phone" label="Phone number" type="tel" placeholder="+95 …" required={step === 0} /><FormField id="password" label="Password" type="password" placeholder="At least 8 characters" required={step === 0} autoComplete="new-password" minLength={8} /></div>
        </div>
        <div className="registration-fields" hidden={step !== 1}>
          <h2>Professional details</h2><p className="step-hint">CareNow verifies your submitted information before enabling appointments.</p>
          <div className="field-grid"><FormField id="specialty" label="Specialty" placeholder="General Medicine" required={step === 1} /><FormField id="licenseNumber" label="Medical license number" required={step === 1} /><FormField id="licenseRegion" label="License issuing country or region" placeholder="Myanmar" required={step === 1} /><FormField id="licenseExpiry" label="License expiry" type="date" required={step === 1} /><FormField id="qualifications" label="Qualifications" placeholder="MBBS, MD" required={step === 1} /><FormField id="experienceYears" label="Years of experience" type="number" min="0" required={step === 1} /><FormField id="languages" label="Languages spoken" placeholder="English, Burmese" required={step === 1} /></div>
        </div>
        <div className="registration-fields" hidden={step !== 2}>
          <h2>Consultation services</h2><p className="step-hint">Select every service you offer. You can update services after verification.</p>
          <label className="service-choice"><input type="checkbox" name="services" value="ONLINE" /><span className="service-choice-icon"><Stethoscope size={18} /></span><span><strong>Online consultations</strong><small>Meet patients through a secure video consultation.</small></span></label>
          <label className="service-choice"><input type="checkbox" name="services" value="IN_PERSON" /><span className="service-choice-icon teal"><FileCheck2 size={18} /></span><span><strong>In-person consultations</strong><small>See patients at a CareNow clinic.</small></span></label>
        </div>
        <div className="registration-fields" hidden={step !== 3}>
          <h2>Verification documents</h2><p className="step-hint">Documents are uploaded to private storage and reviewed by authorized CareNow staff.</p>
          <div className="field-grid"><UploadField id="licenseDocument" label="Medical license" required={step === 3} /><UploadField id="qualificationDocument" label="Qualification documents" required={step === 3} /><UploadField id="identityDocument" label="Identity document" required={step === 3} /></div>
          <label className="terms-check"><input type="checkbox" name="termsAccepted" required={step === 3} /><span>I confirm the information is accurate and agree to the <Link href="/terms">registration terms</Link> and <Link href="/privacy">privacy policy</Link>.</span></label>
          <div className="security-callout"><ShieldCheck size={17} /><span>Verification files are private. Administrator access is limited to operational verification tasks; patient clinical records are not part of this review.</span></div>
        </div>
        <div className="wizard-controls">{step > 0 ? <button type="button" className="button secondary" onClick={() => setStep((current) => current - 1)}><ArrowLeft size={14} />Back</button> : <span />}{step < steps.length - 1 ? <button type="button" className="button" onClick={continueStep}>Continue<ArrowRight size={14} /></button> : <button className="button" type="submit" disabled={pending}>{pending ? "Submitting securely…" : <>Submit for verification<FileCheck2 size={15} /></>}</button>}</div>
      </form>
      <div className="auth-foot registration-foot">Already registered? <Link className="text-link" href="/sign-in">Sign in</Link></div>
    </section>
  </main>;
}

function FormField({ id, label, type = "text", required = false, placeholder, autoComplete, min, minLength }: { id: string; label: string; type?: string; required?: boolean; placeholder?: string; autoComplete?: string; min?: string; minLength?: number }) {
  return <div className="form-field"><label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label><input id={id} name={id} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} min={min} minLength={minLength} /></div>;
}

function UploadField({ id, label, required }: { id: string; label: string; required: boolean }) {
  return <div className="form-field upload-field"><label htmlFor={id}>{label} {required && <span aria-hidden="true">*</span>}</label><input id={id} name={id} type="file" accept="application/pdf,image/jpeg,image/png" required={required} /><small>PDF, JPG or PNG</small></div>;
}
