"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export function UnavailableState({ title = "CareNow services are unavailable", detail = "We could not load this information from the CareNow API. Check your connection and try again." }: { title?: string; detail?: string }) {
  return <div className="card empty-state" role="status"><div className="empty-icon"><AlertCircle size={21} /></div><strong>{title}</strong><p>{detail}</p><button className="button secondary small" type="button" onClick={() => window.location.reload()}><RefreshCw size={13} />Try again</button></div>;
}
