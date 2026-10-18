"use client";

import { useActionState } from "react";
import { CalendarDays } from "lucide-react";
import type { AdminScheduleData } from "@/lib/portal-data";
import { createWeeklySlotsAction, previewWeeklyScheduleAction, type ScheduleActionState, type WeeklyPreviewState } from "@/app/(admin)/admin/schedules/actions";

const EMPTY_PREVIEW: WeeklyPreviewState = {};
const EMPTY_CREATE: ScheduleActionState = {};
const WEEKDAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]] as const;

export function AdminWeeklyScheduleGenerator({ data }: { data: AdminScheduleData }) {
  const [preview, previewAction, previewPending] = useActionState(previewWeeklyScheduleAction, EMPTY_PREVIEW);
  const [created, createAction, createPending] = useActionState(createWeeklySlotsAction, EMPTY_CREATE);
  const conflicts = preview.items?.filter((item) => item.conflict) ?? [];
  const doctors = data.doctors;

  return <section className="card weekly-generator">
    <header className="card-header"><div><h2>Generate weekly timeslots</h2><span className="step-hint">Choose recurring working hours, review every generated slot, then create the batch.</span></div><CalendarDays size={19} /></header>
    <form action={previewAction}>
      <div className="slot-fields weekly-generator-fields">
        <label className="form-field"><span>Doctor</span><select name="doctorId" required defaultValue=""><option value="" disabled>Select doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.specialty}</option>)}</select></label>
        <label className="form-field"><span>Start date</span><input type="date" name="startDate" required /></label>
        <label className="form-field"><span>End date</span><input type="date" name="endDate" required /></label>
        <label className="form-field"><span>Daily start (Yangon time)</span><input type="time" name="startTime" defaultValue="09:00" required /></label>
        <label className="form-field"><span>Daily end (Yangon time)</span><input type="time" name="endTime" defaultValue="17:00" required /></label>
        <label className="form-field"><span>Appointment duration</span><select name="slotMinutes" defaultValue="30"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
      </div>
      <fieldset className="availability-days weekly-days"><legend>Working days</legend>{WEEKDAYS.map(([value, label]) => <label key={value}><input type="checkbox" name="weekdays" value={value} defaultChecked={value >= 1 && value <= 5} /><span>{label}</span></label>)}</fieldset>
      {preview.error && <p className="auth-error" role="alert">{preview.error}</p>}
      <div className="slot-form-footer"><button className="button" type="submit" disabled={previewPending || doctors.length === 0}>{previewPending ? "Preparing preview…" : "Preview timeslots"}</button></div>
    </form>
    {created.error && <p className="auth-error" role="alert">{created.error}</p>}{created.success && <p className="doctor-action-success" role="status">{created.success}</p>}
    {preview.items && preview.input && <div className="weekly-review">
      <div className="weekly-review-heading"><div><h3>Review schedule</h3><p>{preview.total} slots · {preview.consultationType === "IN_PERSON" ? `In person at ${preview.clinicName ?? "the primary clinic"}` : "Online"} · Yangon time</p></div><span className={`status-pill ${conflicts.length ? "waiting" : "progress"}`}>{conflicts.length ? `${conflicts.length} conflicts` : "No conflicts"}</span></div>
      <div className="table-wrap weekly-review-table"><table><thead><tr><th>Date</th><th>Time</th><th>Result</th></tr></thead><tbody>{preview.items.map((item) => <tr key={item.startsAt}>
        <td>{formatDate(item.startsAt)}</td><td>{formatTime(item.startsAt)}–{formatTime(item.endsAt)}</td><td>{item.conflict ? <span className="status-pill waiting">Overlaps existing slot</span> : <span className="status-pill progress">Ready</span>}</td>
      </tr>)}</tbody></table></div>
      {conflicts.length > 0 && <p className="step-hint">Resolve the overlapping timeslots first, then preview the schedule again. The batch will not be partially created.</p>}
      <form action={createAction} className="slot-form-footer"><input type="hidden" name="weeklyInput" value={JSON.stringify(preview.input)} /><button className="button" type="submit" disabled={createPending || conflicts.length > 0 || Boolean(created.success)}>{createPending ? "Creating slots…" : created.success ? "Timeslots created" : `Create ${preview.total} timeslots`}</button></form>
    </div>}
  </section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Yangon" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Yangon" }).format(new Date(value));
}
