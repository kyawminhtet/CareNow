"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, HeartHandshake, LockKeyhole, ShieldCheck, Stethoscope } from "lucide-react";
import { signInAction, type AuthActionState } from "./actions";

const initialState: AuthActionState = {};

export function SignInForm() {
  const [state, action, pending] = useActionState(signInAction, initialState);
  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="CareNow">
        <div className="brand"><span className="brand-mark"><HeartHandshake size={20} /></span>CareNow</div>
        <div className="auth-copy">
          <span className="eyebrow">Connected care, clearer days</span>
          <h1>Better care starts with a trusted connection.</h1>
          <p>One secure workspace for doctors and care teams to coordinate consultations and support every patient.</p>
        </div>
        <div className="auth-features">
          <span><ShieldCheck size={14} /> Verified care teams</span>
          <span><LockKeyhole size={14} /> Secure access</span>
          <span><Stethoscope size={14} /> Care that stays connected</span>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
            <h2>Welcome back</h2>
            <p>Sign in to your CareNow account</p>
            {state.error && <div role="alert" className="auth-error">{state.error}</div>}
            <form action={action}>
              <div className="form-field"><label htmlFor="email">Username (work email)</label><input autoComplete="username" id="email" name="email" type="email" placeholder="you@carenow.com" required /></div>
              <div className="form-field"><label htmlFor="password">Password</label><input autoComplete="current-password" id="password" name="password" type="password" placeholder="Enter your password" required /></div>
              <div className="form-options"><Link className="text-link" href="/forgot-password">Forgot password?</Link></div>
              <button className="button auth-submit" type="submit" disabled={pending}>{pending ? "Signing in…" : <>Sign in <ArrowRight size={15} /></>}</button>
            </form>
            <div className="auth-divider">secure team access</div>
            <div className="auth-foot">Are you a doctor?<Link className="text-link" href="/register/doctor">Start registration</Link></div>
            <div className="security-callout"><ShieldCheck size={17} /><span>CareNow verifies your account role and permissions after sign-in.</span></div>
        </div>
      </section>
    </main>
  );
}
