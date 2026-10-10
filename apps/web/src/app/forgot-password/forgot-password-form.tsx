"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, HeartHandshake, MailCheck } from "lucide-react";
import { recoveryAction, type AuthActionState } from "@/app/sign-in/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(recoveryAction, {} as AuthActionState);
  return <main className="auth-page">
    <section className="auth-visual"><div className="brand"><span className="brand-mark"><HeartHandshake size={19} /></span>CareNow</div><div className="auth-copy"><span className="eyebrow">Account security</span><h1>Get back to your care team.</h1><p>Recover access with a secure link sent to the email on your CareNow account.</p></div><div className="auth-features"><span><MailCheck size={14} /> Private recovery link</span></div></section>
    <section className="auth-form-side"><div className="auth-card"><h2>Reset your password</h2><p>Enter your account email and we will send a secure recovery link.</p>
      {state.error && <div role="alert" className="auth-error">{state.error}</div>}
      {state.success ? <div className="security-callout" role="status"><MailCheck size={18} /><span>If an account exists for that email, a recovery link is on its way. Check your inbox.</span></div> : <form action={action}><div className="form-field"><label htmlFor="email">Account email</label><input id="email" name="email" type="email" autoComplete="email" placeholder="you@carenow.com" required /></div><button className="button auth-submit" disabled={pending}>{pending ? "Sending…" : "Send recovery link"}</button></form>}
      <div className="auth-foot" style={{ marginTop: 22 }}><Link className="text-link" href="/sign-in"><ArrowLeft size={13} /> Back to sign in</Link></div>
    </div></section>
  </main>;
}
