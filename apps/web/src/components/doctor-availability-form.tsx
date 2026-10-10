"use client";

import { useActionState } from "react";
import { CalendarClock, Clock3, ShieldCheck } from "lucide-react";
import type { DataResult, DoctorAvailabilityRule } from "@/lib/portal-data";
import { setAvailabilityAction, type AvailabilityActionState } from "@/app/(doctor)/doctor/availability/actions";
import { UnavailableState } from "@/components/unavailable-state";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function DoctorAvailabilityForm({ result }: { result: DataResult<DoctorAvailabilityRule[]> }) {
  const [state, action, pending] = useActionState(setAvailabilityAction, {} as AvailabilityActionState);
  if (result.unavailable || !result.data) return <>
    <div className="page-heading"><div><h1>Availability</h1><p>Set your recurring weekly online consultation hours.</p></div></div>
    <UnavailableState detail="We could not load your saved availability. Check the CareNow API connection and try again." />
  </>;

  const byDay = new Map<number, DoctorAvailabilityRule>();
  for (const rule of result.data) if (!byDay.has(rule.weekday)) byDay.set(rule.weekday, rule);
  const defaultSlot = result.data[0]?.slotMinutes ?? 30;
  return <>
    <div className="page-heading"><div><h1>Set availability</h1><p>Choose recurring weekly hours for online consultations. Times use Yangon time (MMT).</p></div></div>
    <section className="availability-layout">
      <form action={action} className="card availability-editor">
        <header className="card-header"><div><h2>Weekly online schedule</h2><span className="step-hint">Each selected day becomes an availability rule for patient booking.</span></div><CalendarClock size={18} /></header>
        <div className="availability-week">
          {days.map((label, weekday) => {
            const saved = byDay.get(weekday);
            return <div className={`availability-day${saved ? " selected" : ""}`} key={label}>
              <label className="availability-day-toggle"><input type="checkbox" name={`day-${weekday}`} defaultChecked={Boolean(saved)} /><strong>{label}</strong></label>
              <label className="availability-time"><span>From</span><input type="time" name={`start-${weekday}`} defaultValue={saved?.startTime ?? "09:00"} /></label>
              <label className="availability-time"><span>To</span><input type="time" name={`end-${weekday}`} defaultValue={saved?.endTime ?? "17:00"} /></label>
            </div>;
          })}
        </div>
        <div className="availability-footer">
          <label className="form-field"><span>Appointment duration</span><select name="slotMinutes" defaultValue={String(defaultSlot)}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
          <div className="availability-timezone"><Clock3 size={15} />All hours are saved in Yangon local time.</div>
        </div>
        {state.error && <p className="auth-error" role="alert">{state.error}</p>}
        {state.success && <p className="doctor-action-success" role="status">{state.success}</p>}
        <div className="availability-submit"><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save availability"}</button></div>
      </form>
      <aside className="card availability-help"><ShieldCheck size={20} /><h2>Availability and booking</h2><p>Your schedule controls the recurring hours that patients can request. Existing appointments remain in place when you update your weekly hours.</p><p>In-person hours can be configured after your clinic is assigned.</p></aside>
    </section>
  </>;
}
