"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, ClipboardList, HeartHandshake, LayoutDashboard, LogOut, MapPin, MessageSquare, Search, Settings, Shield, Stethoscope, Users, UserRound, Video, Clock3, ScrollText, Tags } from "lucide-react";
import type { ApplicationRole, AuthorizedSession } from "@carenow/contracts";
import { formatYangonDate } from "@/lib/date-format";
import { signOutAction } from "@/app/sign-in/actions";

type NavLink = { label: string; href: string; icon: typeof LayoutDashboard };
const doctorLinks: NavLink[] = [
  { label: "Dashboard", href: "/doctor/dashboard", icon: LayoutDashboard },
  { label: "Appointments", href: "/doctor/appointments", icon: CalendarDays },
  { label: "Patients", href: "/doctor/patients", icon: Users },
  { label: "Messages", href: "/doctor/messages", icon: MessageSquare },
  { label: "Availability", href: "/doctor/availability", icon: Clock3 },
  { label: "Consultations", href: "/doctor/consultations", icon: Video },
  { label: "Profile", href: "/doctor/profile", icon: UserRound },
];
const adminLinks: NavLink[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Doctors", href: "/admin/doctors", icon: Stethoscope },
  { label: "Specialties", href: "/admin/specialties", icon: Tags },
  { label: "Schedules", href: "/admin/schedules", icon: CalendarDays },
  { label: "Clinics", href: "/admin/clinics", icon: MapPin },
  { label: "Patients", href: "/admin/patients", icon: Users },
  { label: "Appointments", href: "/admin/appointments", icon: ClipboardList },
  { label: "Consultations", href: "/admin/consultations", icon: Video },
  { label: "Reports", href: "/admin/reports", icon: Search },
  { label: "Audit logs", href: "/admin/audit-logs", icon: ScrollText },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function PortalShell({ session, role, unreadCount = 0, children }: {
  session: AuthorizedSession;
  role: ApplicationRole;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = role === "ADMINISTRATOR";
  const links = session.accountStatus !== "ACTIVE" ? [] : isAdmin ? adminLinks : session.verificationStatus === "VERIFIED" ? doctorLinks : [
    { label: "Verification", href: "/doctor/verification", icon: Shield },
    { label: "Profile", href: "/doctor/profile", icon: UserRound },
  ];
  const initials = session.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href={isAdmin ? "/admin/dashboard" : "/doctor/dashboard"} aria-label="CareNow home"><span className="brand-mark"><HeartHandshake size={19} /></span>CareNow</Link>
        <nav aria-label={`${isAdmin ? "Administrator" : "Doctor"} navigation`}>
          <div className="nav-label">Workspace</div>
          <div className="nav-list">
            {links.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return <Link key={href} className={`nav-item${active ? " active" : ""}`} href={href} aria-current={active ? "page" : undefined}><Icon size={16} strokeWidth={2} /><span>{label}</span></Link>;
            })}
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">Account</div>
          <div className="profile-chip"><div className="avatar" aria-hidden="true">{initials || "CN"}</div><div><strong>{session.displayName}</strong><span>{isAdmin ? "Administrator" : "Verified doctor"}</span></div></div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-date">{formatYangonDate()}</div>
          <span className={`role-badge${isAdmin ? " admin" : ""}`}>{isAdmin ? "Administrator" : session.verificationStatus === "VERIFIED" ? "Doctor" : "Verification pending"}</span>
          <Link href={isAdmin ? "/admin/notifications" : "/doctor/notifications"} className="icon-button notification-button" aria-label={`Open notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}><Bell size={17} />{unreadCount > 0 && <span className="unread-count" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>}</Link>
          <form action={signOutAction} className="topbar-signout"><button className="icon-button" type="submit" aria-label={`Sign out of ${isAdmin ? "administrator" : "doctor"} account`} title="Sign out"><LogOut size={17} /></button></form>
          <div className="avatar" aria-label={session.displayName}>{initials || "CN"}</div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
