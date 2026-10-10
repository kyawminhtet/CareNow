"use client";

import Link from "next/link";
import { useActionState } from "react";
import { HeartHandshake, LockKeyhole } from "lucide-react";
import { updatePasswordAction, type PasswordActionState } from "./actions";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, {} as PasswordActionState);
  return <main className="auth-page"><section className="auth-visual"><Link className="brand" href="/sign-in"><span className="brand-mark"><HeartHandshake size={19} /></span>CareNow</Link><div className="auth-copy"><span className="eyebrow">Account security</span><h1>Choose a new password.</h1><p>Reset your password to keep your CareNow account secure.</p></div></section><section className="auth-form-side"><div className="auth-card"><h2>Set a new password</h2><p>Use at least 8 characters. Your new password is stored with the identity provider.</p>
    {state.error && <div className="auth-error" role="alert">{state.error}</div>}
    <form action={action}><div className="form-field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div><div className="form-field"><label htmlFor="confirmation">Confirm password</label><input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={8} required /></div><button className="button auth-submit" type="submit" disabled={pending}>{pending ? "Updating…" : <><LockKeyhole size={14} />Update password</>}</button></form>
  </div></section></main>;
}
