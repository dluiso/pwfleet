"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  Menu,
  LogOut,
  QrCode,
  Settings,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";
import { formatEnum } from "@/lib/format";

type AppShellProps = {
  actor: {
    displayName: string;
    email: string;
    role: string;
  };
  children: React.ReactNode;
  unreadNotificationCount: number;
  developmentAuth: boolean;
};

const navigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Fleet", href: "/vehicles", icon: Truck },
  { label: "Inspections", href: "/inspections", icon: ClipboardCheck },
  { label: "QR Scan", href: "/scan", icon: QrCode },
  { label: "Maintenance", href: "/maintenance", icon: Wrench },
  { label: "Reports", href: "/reports", icon: ChartNoAxesCombined },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function AppShell({ actor, children, unreadNotificationCount, developmentAuth }: AppShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const canReviewForms = actor.role === "supervisor" || actor.role === "fleet_manager" || actor.role === "administrator";
  const canUseSafetyWorkbench = actor.role === "supervisor" || actor.role === "fleet_manager" || actor.role === "maintenance_technician" || actor.role === "administrator";
  const operationalNavigation = navigation.filter((item) => item.href !== "/maintenance" || canUseSafetyWorkbench);
  const primaryNavigation = canReviewForms
    ? [...operationalNavigation, { label: "Form Reviews", href: "/settings/forms", icon: FileCheck2 }]
    : operationalNavigation;

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Truck size={22} strokeWidth={2.2} />
          </div>
          <div>
            <span className="brand-city">CITY OF HARVEY</span>
            <strong>PW Fleet</strong>
          </div>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={22} />
          </button>
        </div>

        <nav className="primary-nav" aria-label="Primary navigation">
          <span className="nav-heading">OPERATIONS</span>
          {primaryNavigation.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                className={active ? "nav-link nav-link-active" : "nav-link"}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon size={19} strokeWidth={active ? 2.3 : 1.9} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          {actor.role === "administrator" ? <Link className="nav-link" href="/settings" onClick={() => setMobileMenuOpen(false)}>
            <Settings size={19} />
            <span>Administration</span>
          </Link> : null}
          <div className="actor-card">
            <span className="actor-avatar" aria-hidden="true">
              {actor.displayName
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
            <div className="actor-copy">
              <strong>{actor.displayName}</strong>
              <span>{formatEnum(actor.role)}</span>
            </div>
          </div>
          {!developmentAuth ? <form action="/auth/logout" method="post"><button className="nav-link logout-button" type="submit"><LogOut size={19} /><span>Sign out</span></button></form> : null}
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <div className="workspace">
        {developmentAuth ? <div className="dev-safety-banner" role="status">
          Development environment · Authentication bypass and draft safety rules are active
        </div> : null}
        <header className="topbar">
          <button
            className="icon-button mobile-menu-button"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          <div className="topbar-context">
            <span>PUBLIC WORKS OPERATIONS</span>
            <strong>
              {new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }).format(new Date())}
            </strong>
          </div>
          <Link className="icon-button notification-button" href="/notifications" aria-label={`${unreadNotificationCount} unread notifications`}>
            <Bell size={20} />
            {unreadNotificationCount ? <span className="notification-count">{Math.min(unreadNotificationCount, 99)}</span> : null}
          </Link>
        </header>
        <main className="main-content">{children}</main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {navigation.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link key={item.href} className={active ? "active" : ""} href={item.href}>
              <Icon size={20} />
              <span>{item.label === "QR Scan" ? "Scan" : item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
