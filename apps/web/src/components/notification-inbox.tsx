import { Bell, CheckCheck, Clock3, LockKeyhole } from "lucide-react";
import type { ApplicationRole } from "@carenow/contracts";
import type { DataResult, PortalNotification } from "@/lib/portal-data";
import { markAllNotificationsReadAction, markNotificationReadAction, openNotificationAction } from "@/app/notifications/actions";
import { UnavailableState } from "@/components/unavailable-state";

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recent";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationInbox({ role, result }: { role: ApplicationRole; result: DataResult<PortalNotification[]> }) {
  const notifications = result.data ?? [];
  const unread = notifications.filter((item) => item.readAt === null).length;
  return <>
    <div className="page-heading"><div><h1>Notifications</h1><p>{role === "DOCTOR" ? "Your appointments, messages and care updates." : "Operational updates for the CareNow platform."}</p></div>
      {!result.unavailable && unread > 0 && <form action={markAllNotificationsReadAction}><button className="button secondary" type="submit"><CheckCheck size={14} />Mark all as read</button></form>}
    </div>
    <div className="notice-card card inbox-privacy"><LockKeyhole size={17} /><div><h3>Secure, role-based updates</h3><p>{role === "ADMINISTRATOR" ? "Administrator notifications contain operational details only. Clinical records and private patient content are excluded." : "Only notifications for your account appear here. Opening an update checks your access again."}</p></div></div>
    {result.unavailable ? <UnavailableState title="Notifications could not be loaded" detail="Your inbox will be available when your connection to CareNow is restored." /> : notifications.length ? <section className="card notification-list" aria-label="Notification inbox">{notifications.map((item) => <article className={`notification-row${item.readAt === null ? " unread" : ""}`} key={item.id}>
      <span className="notification-icon"><Bell size={16} /></span>
      <div className="notification-copy"><div className="notification-title-line"><h2>{item.title}</h2>{item.readAt === null && <span className="unread-label">Unread</span>}</div><p>{item.body}</p><span className="notification-time"><Clock3 size={12} />{relativeTime(item.createdAt)}</span></div>
      <div className="notification-actions"><form action={openNotificationAction}><input type="hidden" name="notificationId" value={item.id} /><button type="submit" className="link-button">Open update</button></form>{item.readAt === null && <form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={item.id} /><button type="submit" className="link-button muted-link">Mark read</button></form>}</div>
    </article>)}</section> : <section className="card empty-state"><div className="empty-icon"><Bell size={20} /></div><strong>You are all caught up</strong><p>New CareNow updates will appear here.</p></section>}
    <p className="inbox-footnote">{role === "DOCTOR" ? "These updates are available when you return to the CareNow portal. Browser push notifications are not enabled." : "Updates remain in this inbox until you read them. Administrator notifications do not include clinical information."}</p>
    <span className="sr-only" aria-live="polite">{unread} unread notifications</span>
  </>;
}
