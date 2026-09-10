"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Mail,
  CalendarClock,
  Bot,
  Mic,
  Users,
  FileSignature,
  ScrollText,
  LogOut,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Target,
  BarChart3,
  Settings,
  Phone,
  Bug,
  PhoneIncoming,
  Megaphone,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { ThemeToggle } from "./ThemeToggle";

export const navItems = [
  { href: "/dashboard",          label: "Dashboard",          icon: LayoutDashboard },
  { href: "/kontakte",           label: "Kontakte",           icon: Users },
  { href: "/deals",              label: "Deals",              icon: FileSignature },
  { href: "/kpis",               label: "KPIs",               icon: BarChart3 },
  { href: "/vertraege",          label: "Verträge",           icon: ScrollText },
  { href: "/dokumente",          label: "Dokumente",          icon: FolderOpen },
  { href: "/akquisition",        label: "Lead-Suche",         icon: Target },
  { href: "/telefonaktivitaeten",label: "Anrufliste",         icon: Phone },
  { href: "/rueckrufliste",      label: "Rückrufliste",       icon: PhoneIncoming },
  { href: "/emails",             label: "E-Mails",            icon: Mail },
  { href: "/newsletter",         label: "Newsletter",         icon: Megaphone },
  { href: "/deadlines",          label: "Fristen & Termine",  icon: CalendarClock },
  { href: "/legal-ai",           label: "KI",                 icon: Bot },
  { href: "/dictation",          label: "Diktat",             icon: Mic },
  { href: "/einstellungen",      label: "Einstellungen",      icon: Settings },
  { href: "/bugs-features",      label: "Bugs / Features",    icon: Bug, divider: true },
];

/** Label des aktuell geöffneten Moduls anhand des Pfads bestimmen. */
export function getModuleLabel(pathname: string): string {
  const match = navItems.find(
    (item) =>
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))
  );
  return match?.label ?? "Berko AI";
}

interface UserProfile {
  name: string | null;
  title: string | null;
  initials: string | null;
  email: string | null;
}

function getInitials(name: string | null, email: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profile, setProfile] = useState<UserProfile>({ name: null, title: null, initials: null, email: null });

  useEffect(() => {
    async function fetchUnread() {
      const res = await fetch("/api/emails?folder=inbox");
      if (!res.ok) return;
      const data: { read: boolean }[] = await res.json();
      setUnreadCount(data.filter((e) => !e.read).length);
    }
    fetchUnread();

    async function fetchProfile() {
      const res = await fetch("/api/profile");
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data);
    }
    fetchProfile();

    // Realtime: zähler bei neuen E-Mails aktualisieren
    const supabase = createClient();
    const channel = supabase
      .channel("sidebar-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "emails" }, fetchUnread)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Label auf Mobile immer zeigen; auf Desktop nur einklappbar (lg:hidden bei collapsed)
  const labelCls = collapsed ? "lg:hidden" : "";

  return (
    <>
      {/* Backdrop (nur Mobile, wenn Drawer offen) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 lg:static lg:z-auto
          ${collapsed ? "lg:w-20" : "lg:w-64"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          h-screen flex flex-col transition-all duration-200
          bg-white border-r border-gray-200
          dark:bg-gray-900 dark:border-gray-800`}
      >
        {/* Logo */}
        <div className="p-4 flex items-center gap-3">
          <img
            alt=""
            width={465}
            height={545}
            className="shrink-0"
            style={{ color: "transparent", width: "32px", height: "auto" }}
            src="/berko-ki-icon.png"
          />
          <span className={`text-lg font-semibold tracking-tight text-foreground ${labelCls}`}>
            Berko
            <span className="bg-gradient-to-r from-brand-cyan to-accent-strong bg-clip-text text-transparent"> KI</span>
          </span>
          {/* Schließen (nur Mobile) */}
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-gray-800 lg:hidden"
            aria-label="Menü schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
            const badge = item.href === "/emails" && unreadCount > 0 ? unreadCount : null;
            return (
              <div key={item.href}>
                {item.divider && (
                  <div className="my-2 border-t border-gray-200 dark:border-gray-700/60" />
                )}
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className={`flex-1 ${labelCls}`}>{item.label}</span>
                  {badge ? (
                    <span className={`bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded-full ${labelCls}`}>
                      {badge}
                    </span>
                  ) : null}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="px-3 pb-1">
          <ThemeToggle collapsed={collapsed} />
        </div>

        {/* Collapse toggle (nur Desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="mx-3 mb-2 p-2 rounded-lg transition-colors hidden lg:block
            text-gray-400 dark:text-gray-500
            hover:text-gray-900 dark:hover:text-white
            hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>

        {/* User section */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-sm font-bold flex-shrink-0 text-white">
              {profile.initials || getInitials(profile.name, profile.email)}
            </div>
            <div className={`flex-1 min-w-0 ${labelCls}`}>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {profile.name || profile.email || "…"}
              </p>
              {profile.title && (
                <p className="text-xs text-gray-500 dark:text-gray-500 truncate">
                  {profile.title}
                </p>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 transition-colors flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
              title="Abmelden"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
