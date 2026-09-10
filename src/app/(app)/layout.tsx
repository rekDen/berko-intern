import AppShell from "@/components/AppShell";
import EmailNotificationsProvider from "@/components/EmailNotifications";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <EmailNotificationsProvider>
      <AppShell>{children}</AppShell>
    </EmailNotificationsProvider>
  );
}
