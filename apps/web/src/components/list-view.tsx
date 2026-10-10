"use client";

import { useMemo, useState } from "react";
import { Search, ClipboardList, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ListRow } from "@/lib/portal-data";
import { UnavailableState } from "@/components/unavailable-state";

export function ListView({ title, description, basePath, result, actionLabel }: {
  title: string;
  description: string;
  basePath: string;
  result: { data: ListRow[]; unavailable: false } | { data: null; unavailable: true };
  actionLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => (result.data ?? []).filter((row) => `${row.label} ${row.detail} ${row.status} ${row.reference ?? ""}`.toLowerCase().includes(query.toLowerCase())), [result.data, query]);
  return <>
    <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{actionLabel && <button type="button" className="button">{actionLabel}</button>}</div>
    <div className="page-toolbar"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}…`} aria-label={`Search ${title}`} /></label></div>
    {result.unavailable || !result.data ? <UnavailableState detail="This list needs an authenticated CareNow API response. Your access is checked again for every request." /> :
      <section className="card">
        {rows.length ? <div className="list-view">{rows.map((row) => <Link key={row.id} className="list-row" href={`${basePath}/${encodeURIComponent(row.id)}`}>
          <div className="empty-icon"><ClipboardList size={19} /></div><div className="list-main"><strong>{row.label}</strong><span>{row.detail}</span></div><span className="list-status">{row.status}</span><span className="list-date">{row.updatedAt}</span><ChevronRight size={16} className="list-chevron" />
        </Link>)}</div> : <div className="empty-state"><strong>{query ? "No matching records" : "Nothing here yet"}</strong><p>{query ? "Try a different search term." : "New activity will appear here when it is available to your account."}</p></div>}
      </section>}
  </>;
}
