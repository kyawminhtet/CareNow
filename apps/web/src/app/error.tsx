"use client";

import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="center-state"><section className="card state-card"><div className="empty-icon"><AlertTriangle size={21} /></div><h1>CareNow could not load this page</h1><p>The secure web session or CareNow API is unavailable. Try again when your connection is restored.</p><button type="button" className="button" onClick={() => reset()}>Try again</button></section></main>;
}
