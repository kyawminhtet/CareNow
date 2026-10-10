import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import type { DataResult, ListRow } from "@/lib/portal-data";
import { UnavailableState } from "@/components/unavailable-state";

export function SectionPage({ title, description, basePath, result, createLabel }: {
  title: string;
  description: string;
  basePath: string;
  result: DataResult<ListRow[]>;
  createLabel?: string;
}) {
  return <>
    <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{createLabel && <Link className="button" href={`${basePath}/new`}>{createLabel}</Link>}</div>
    {result.unavailable || !result.data ? <UnavailableState detail="This screen loads role-authorized data from the CareNow API. The request is not available yet." /> :
      <section className="card">
        {result.data.length ? <div className="list-view">{result.data.map((row) => <Link className="list-row" key={row.id} href={`${basePath}/${encodeURIComponent(row.id)}`}>
          <div className="empty-icon"><FileText size={18} /></div><div className="list-main"><strong>{row.label}</strong><span>{row.detail}</span></div><span className="list-status">{row.status}</span><span className="list-date">{row.updatedAt}</span></Link>)}</div> : <div className="empty-state"><div className="empty-icon"><FileText size={20} /></div><strong>No {title.toLowerCase()} yet</strong><p>New activity will appear here when it is available to your account.</p></div>}
      </section>}
  </>;
}

export function RecordPage({ title, basePath, result }: { title: string; basePath: string; result: DataResult<ListRow> }) {
  if (result.unavailable || !result.data) return <><div className="page-heading"><div><h1>{title}</h1><p>CareNow checks your role and record access before returning details.</p></div></div><UnavailableState /></>;
  const item = result.data;
  return <>
    <div className="page-heading"><div><Link href={basePath} className="back-link"><ArrowLeft size={14} />Back to {title}</Link><h1 style={{ marginTop: 12 }}>{item.label}</h1><p>{item.detail}</p></div></div>
    <section className="card record-card"><div className="record-keyline"><span>Status</span><span className="list-status">{item.status}</span></div><div className="record-keyline"><span>Last updated</span><strong>{item.updatedAt}</strong></div>{item.reference && <div className="record-keyline"><span>Reference</span><strong>{item.reference}</strong></div>}</section>
    <div className="security-callout"><ShieldCheck size={17} /><span>Only information authorized for your role is returned to this screen.</span></div>
  </>;
}
