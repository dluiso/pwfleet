import type { Metadata, Viewport } from "next";
import { getCurrentActor } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { getNotificationSummary } from "@/modules/notifications/repository";
import { getEnvironment } from "@/lib/env";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Harvey PW Fleet",
    template: "%s | Harvey PW Fleet",
  },
  description: "City of Harvey Public Works fleet inspections and vehicle readiness.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b2f2b",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await getCurrentActor();
  const notifications = await getNotificationSummary();

  return (
    <html lang="en">
      <body>
        <AppShell
          actor={{
            displayName: actor.displayName,
            email: actor.email,
            role: actor.role,
          }}
          unreadNotificationCount={notifications.unreadCount}
          developmentAuth={getEnvironment().AUTH_MODE === "development"}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
