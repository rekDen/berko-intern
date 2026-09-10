"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar,
  List,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  Circle,
  User,
  Users,
  Search,
  SlidersHorizontal,
  MapPin,
  CalendarDays,
  Copy,
  RefreshCw,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";
import Link from "next/link";
import { contactDisplayName } from "@/types/crm";
import { fetchAllContacts } from "@/lib/fetch-all-contacts";
import DeadlineDialog, { type DeadlineFormState, emptyDeadlineForm } from "@/components/crm/DeadlineDialog";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface Deadline {
  id: string;
  date: string;
  time: string | null;
  title: string;
  description: string;
  type: "frist" | "termin";
  az: string;
  completed: boolean;
  assigned_to: string;
  location: string;
  contact_id: string | null;
  invite_emails: string[] | null;
}

interface GoogleEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  allDay: boolean;
  htmlLink: string | null;
}

interface ImmowareEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  calendarName: string;
}

type ViewMode = "calendar" | "list";

// ─── Typen (Team) ─────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  title: string | null;
}

interface ContactOption {
  id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
}

// ─── Konstanten ───────────────────────────────────────────────────────────────

const DAY_HEADERS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];


// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function getDaysRemaining(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatDateTime(dateStr: string, time: string | null): string {
  const date = formatDate(dateStr);
  if (!time) return date;
  return `${date}, ${time} Uhr`;
}

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = i - offset + 1;
    return d >= 1 && d <= daysInMonth ? d : null;
  });
}

// ─── Sub-Komponenten ──────────────────────────────────────────────────────────

function DaysRemainingBadge({ days }: { days: number }) {
  if (days < 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">Verstrichen</span>;
  if (days === 0) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400">Heute</span>;
  if (days === 1) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400">Morgen</span>;
  if (days <= 3) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400">{days}d</span>;
  if (days <= 7) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">{days}d</span>;
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">{days}d</span>;
}

function TypeBadge({ type }: { type: "frist" | "termin" }) {
  return type === "frist" ? (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 border border-red-500/20 dark:text-red-300">Frist</span>
  ) : (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 border border-blue-500/20 dark:text-blue-300">Termin</span>
  );
}

// ─── Kalender-Sync Modal ──────────────────────────────────────────────────────

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  sync_enabled: boolean;
}

function GoogleCalendarModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [gStatus, setGStatus] = useState<GoogleStatus | null>(null);
  const [gBusy, setGBusy] = useState(false);

  const feedUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/deadlines/ical?token=${token}`
    : "";

  const loadGoogle = useCallback(async () => {
    const s = await fetch("/api/google-calendar/status").then(r => r.ok ? r.json() : null);
    setGStatus(s);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/deadlines/ical-token").then(r => r.ok ? r.json() : null),
      fetch("/api/google-calendar/status").then(r => r.ok ? r.json() : null),
    ]).then(([t, s]) => {
      setToken(t?.token ?? null);
      setGStatus(s);
      setLoading(false);
    });
  }, []);

  async function handleCopy() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    if (!confirm("Token erneuern? Der bisherige Link funktioniert dann nicht mehr.")) return;
    setRegenerating(true);
    const res = await fetch("/api/deadlines/ical-token", { method: "POST" });
    const d = await res.json();
    setToken(d?.token ?? null);
    setRegenerating(false);
  }

  async function toggleSync() {
    if (!gStatus) return;
    setGBusy(true);
    await fetch("/api/google-calendar/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sync_enabled: !gStatus.sync_enabled }),
    });
    await loadGoogle();
    onChanged();
    setGBusy(false);
  }

  async function disconnect() {
    if (!confirm("Google-Verbindung trennen? Bereits exportierte Termine bleiben in Google bestehen.")) return;
    setGBusy(true);
    await fetch("/api/google-calendar/status", { method: "DELETE" });
    await loadGoogle();
    onChanged();
    setGBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl shadow-2xl border bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Kalender-Synchronisation</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ── Google-Konto (Zwei-Wege) ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Google-Konto</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Zwei-Wege</span>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 h-10 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Lade…
              </div>
            ) : !gStatus?.configured ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-400">
                Google ist noch nicht konfiguriert. Es fehlen die Server-Zugangsdaten (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
              </div>
            ) : gStatus.connected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Verbunden</p>
                      <p className="text-xs text-gray-400 truncate">{gStatus.email ?? "Google-Konto"}</p>
                    </div>
                  </div>
                  <button
                    onClick={disconnect}
                    disabled={gBusy}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:border-gray-700 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    Trennen
                  </button>
                </div>
                <label className="flex items-center justify-between gap-2 cursor-pointer select-none px-1">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Fristen & Termine automatisch zu Google exportieren</span>
                  <button
                    type="button"
                    onClick={toggleSync}
                    disabled={gBusy}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${gStatus.sync_enabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"} disabled:opacity-50`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${gStatus.sync_enabled ? "translate-x-4" : ""}`} />
                  </button>
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                <a
                  href="/api/google-calendar/connect"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                  Mit Google verbinden
                </a>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Deine Google-Termine erscheinen im Berko AI-Kalender, und deine Fristen & Termine werden zu Google exportiert.
                </p>
              </div>
            )}
          </div>

          {/* ── iCal-Abo (read-only Fallback) ── */}
          <div className="pt-5 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">iCal-Abo</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-500/15 text-gray-500 dark:text-gray-400">read-only</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Alternative ohne Google-Login: Feed-URL in einem beliebigen Kalender abonnieren (nur Export, schreibgeschützt).
            </p>

            {!loading && (
              <div className="flex gap-2">
                <input
                  readOnly
                  value={feedUrl}
                  className="flex-1 min-w-0 text-xs px-3 py-2 rounded-lg border bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 focus:outline-none"
                />
                <button
                  onClick={handleCopy}
                  title="URL kopieren"
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    copied
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Kopiert!" : "Kopieren"}
                </button>
              </div>
            )}

            <div className="flex items-center justify-end mt-2">
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                  border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50
                  dark:border-gray-700 dark:text-gray-400 dark:hover:text-red-400 dark:hover:border-red-500/30 dark:hover:bg-red-500/10
                  disabled:opacity-50"
              >
                {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Token erneuern
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function DeadlinesPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [showDialog, setShowDialog] = useState(false);
  const [showGoogleCalModal, setShowGoogleCalModal] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    type: "alle" as "alle" | "frist" | "termin",
    assignedTo: "",
    dateFrom: "",
    dateTo: "",
  });
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [immowareEvents, setImmowareEvents] = useState<ImmowareEvent[]>([]);
  // Ein-/Ausblenden bzw. Entfernen/Hinzufügen der Kalenderkategorie "Immoware"
  // per Mausklick — rein clientseitige Anzeige-Präferenz, pro Browser gemerkt.
  const [immowareVisible, setImmowareVisible] = useState(true);
  useEffect(() => {
    function run() {
      try {
        setImmowareVisible(localStorage.getItem("immoware-calendar-hidden") !== "true");
      } catch {
        // localStorage nicht verfügbar (z.B. privates Fenster) → Standard: sichtbar
      }
    }
    run();
  }, []);
  function toggleImmowareVisible() {
    setImmowareVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("immoware-calendar-hidden", next ? "false" : "true");
      } catch {
        // ignore
      }
      return next;
    });
  }

  // ── Daten laden ──────────────────────────────────────────────────────────────

  const loadDeadlines = useCallback(async () => {
    const res = await fetch("/api/deadlines");
    if (!res.ok) return;
    setDeadlines(await res.json());
  }, []);

  // Google-Events für den sichtbaren Monat (± Puffer) laden
  const loadGoogleEvents = useCallback(async () => {
    const from = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
    const to = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const res = await fetch(`/api/google-calendar/events?from=${from}&to=${to}`);
    if (!res.ok) { setGoogleEvents([]); return; }
    const data = await res.json();
    setGoogleEvents(data.connected ? (data.events ?? []) : []);
  }, [calYear, calMonth]);

  // Immoware-Kalender (CalDAV) für den sichtbaren Monat laden — nur solange sichtbar
  const loadImmowareEvents = useCallback(async () => {
    if (!immowareVisible) { setImmowareEvents([]); return; }
    const from = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
    const to = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const res = await fetch(`/api/immoware-calendar/events?from=${from}&to=${to}`);
    if (!res.ok) { setImmowareEvents([]); return; }
    const data = await res.json();
    setImmowareEvents(data.connected ? (data.events ?? []) : []);
  }, [calYear, calMonth, immowareVisible]);

  useEffect(() => {
    function run() { loadGoogleEvents(); }
    run();
  }, [loadGoogleEvents]);

  useEffect(() => {
    function run() { loadImmowareEvents(); }
    run();
  }, [loadImmowareEvents]);

  // Rückkehr von Google OAuth (?google=connected|error) abfangen
  useEffect(() => {
    function handleReturn() {
      const params = new URLSearchParams(window.location.search);
      const g = params.get("google");
      if (!g) return;
      if (g === "connected") {
        setShowGoogleCalModal(true);
        loadGoogleEvents();
      } else if (g === "error") {
        alert("Google-Verbindung fehlgeschlagen: " + (params.get("reason") ?? "unbekannter Fehler"));
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
    handleReturn();
  }, [loadGoogleEvents]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadDeadlines();
      setLoading(false);
    }
    init();
  }, [loadDeadlines]);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((data) => setTeamMembers(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetchAllContacts<ContactOption>()
      .then((data) => setContacts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async function handleSave(form: DeadlineFormState) {
    const res = editingDeadline
      ? await fetch(`/api/deadlines/${editingDeadline.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      : await fetch("/api/deadlines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Speichern fehlgeschlagen" }));
      alert(err.error ?? "Speichern fehlgeschlagen");
      return;
    }

    const data = await res.json().catch(() => null);
    const msgs: string[] = [];
    if (data?.invites_sent > 0) msgs.push(`${data.invites_sent} Einladung(en) versendet`);
    if (data?.cancellations_sent > 0) msgs.push(`${data.cancellations_sent} Absage(n) versendet`);
    if (msgs.length) alert(msgs.join(" · "));

    setShowDialog(false);
    setEditingDeadline(null);
    await loadDeadlines();
  }

  async function handleToggleComplete(d: Deadline) {
    setDeadlines((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, completed: !x.completed } : x))
    );
    await fetch(`/api/deadlines/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !d.completed }),
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Eintrag endgültig löschen?")) return;
    setDeleting(id);
    await fetch(`/api/deadlines/${id}`, { method: "DELETE" });
    setDeadlines((prev) => prev.filter((d) => d.id !== id));
    setDeleting(null);
  }

  function openNew() {
    setEditingDeadline(null);
    setShowDialog(true);
  }

  function openEdit(d: Deadline) {
    setEditingDeadline(d);
    setShowDialog(true);
  }

  // ── Kalender ──────────────────────────────────────────────────────────────────

  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
    setSelectedDay(null);
  }

  const cells = buildCalendarCells(calYear, calMonth);
  const isCurrentMonth = calYear === today.getFullYear() && calMonth === today.getMonth();

  function deadlinesForDay(day: number) {
    return deadlines.filter((d) => {
      const dt = new Date(d.date);
      return dt.getFullYear() === calYear && dt.getMonth() === calMonth && dt.getDate() === day;
    });
  }

  function googleEventsForDay(day: number) {
    const target = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return googleEvents.filter((e) => e.start.slice(0, 10) === target);
  }

  function googleEventTime(e: GoogleEvent): string | null {
    if (e.allDay) return null;
    return new Date(e.start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  }

  function immowareEventsForDay(day: number) {
    const target = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return immowareEvents.filter((e) => e.start.slice(0, 10) === target);
  }

  function immowareEventTime(e: ImmowareEvent): string | null {
    if (e.allDay) return null;
    return new Date(e.start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  }

  // ── Offene Einträge (Liste) ───────────────────────────────────────────────────

  const sorted = [...deadlines]
    .filter((d) => !d.completed)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // ── Suchfilter ────────────────────────────────────────────────────────────────

  const hasAdvancedFilters =
    advancedFilters.type !== "alle" ||
    !!advancedFilters.assignedTo ||
    !!advancedFilters.dateFrom ||
    !!advancedFilters.dateTo;

  function matchesFilters(d: Deadline): boolean {
    if (advancedFilters.type !== "alle" && d.type !== advancedFilters.type) return false;
    if (advancedFilters.assignedTo && !d.assigned_to.toLowerCase().includes(advancedFilters.assignedTo.toLowerCase())) return false;
    if (advancedFilters.dateFrom && d.date < advancedFilters.dateFrom) return false;
    if (advancedFilters.dateTo && d.date > advancedFilters.dateTo) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !d.title.toLowerCase().includes(q) &&
        !d.description.toLowerCase().includes(q) &&
        !d.assigned_to.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }

  // ── Nur Fristen von heute für den Warnhinweis ─────────────────────────────────

  const todayFristen = deadlines.filter(
    (d) => !d.completed && d.type === "frist" && getDaysRemaining(d.date) === 0
  );

  const selectedDayDeadlines = selectedDay !== null ? deadlinesForDay(selectedDay) : [];

  const filteredSorted = sorted.filter(matchesFilters);
  const filteredCompletedList = deadlines
    .filter((d) => d.completed && matchesFilters(d))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const filteredDayDeadlines = selectedDayDeadlines.filter(matchesFilters);

  const isSearchActive = !!searchQuery.trim() || hasAdvancedFilters;

  function resetSearch() {
    setSearchQuery("");
    setAdvancedFilters({ type: "alle", assignedTo: "", dateFrom: "", dateTo: "" });
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {showGoogleCalModal && (
        <GoogleCalendarModal
          onClose={() => setShowGoogleCalModal(false)}
          onChanged={loadGoogleEvents}
        />
      )}
      {showDialog && (
        <DeadlineDialog
          editing={editingDeadline}
          onSave={handleSave}
          onClose={() => { setShowDialog(false); setEditingDeadline(null); }}
          teamMembers={teamMembers}
          contacts={contacts}
        />
      )}

      <div className="min-h-screen p-6 bg-slate-50 dark:bg-gray-950">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fristen & Termine</h1>
            <p className="text-sm mt-0.5 text-gray-500 dark:text-gray-400">
              {MONTH_NAMES[calMonth]} {calYear}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg p-1 border bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700">
              <button
                onClick={() => setViewMode("calendar")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "calendar"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                <Calendar size={15} /> Kalender
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                <List size={15} /> Liste
              </button>
            </div>
            <button
              onClick={() => setShowGoogleCalModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                border border-gray-200 bg-white text-gray-600 hover:bg-gray-50
                dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <CalendarDays size={15} /> Kalender-Abo
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity
                bg-gradient-to-r from-indigo-500 to-cyan-500 text-white hover:opacity-90"
            >
              <Plus size={15} /> Neu
            </button>
          </div>
        </div>

        {/* Suchleiste */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Fristen & Termine durchsuchen..."
                className="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border transition-colors
                  bg-white border-gray-200 text-gray-900 placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm
                  dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              title="Erweiterte Suche"
              className={`relative p-2.5 rounded-xl border shadow-sm transition-colors flex-shrink-0 ${
                showAdvanced || hasAdvancedFilters
                  ? "bg-indigo-500/15 border-indigo-400/40 text-indigo-600 dark:text-indigo-400"
                  : "bg-white border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-300 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {hasAdvancedFilters && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-slate-50 dark:border-gray-950" />
              )}
            </button>
          </div>

          {/* Erweiterte Suche */}
          {showAdvanced && (
            <div className="mt-3 p-4 rounded-xl border space-y-3
              bg-white border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-700">

              {/* Typ + Zuständig */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Typ</label>
                  <div className="flex gap-1.5">
                    {(["alle", "frist", "termin"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setAdvancedFilters((f) => ({ ...f, type: t }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          advancedFilters.type === t
                            ? t === "frist"
                              ? "bg-red-500/15 border-red-400/40 text-red-600 dark:text-red-400"
                              : t === "termin"
                              ? "bg-blue-500/15 border-blue-400/40 text-blue-600 dark:text-blue-400"
                              : "bg-indigo-500/15 border-indigo-400/40 text-indigo-600 dark:text-indigo-400"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        }`}
                      >
                        {t === "alle" ? "Alle" : t === "frist" ? "Frist" : "Termin"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Zuständig</label>
                  <select
                    value={advancedFilters.assignedTo}
                    onChange={(e) => setAdvancedFilters((f) => ({ ...f, assignedTo: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border transition-colors
                      bg-gray-50 border-gray-200 text-gray-900
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                      dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  >
                    <option value="">— Alle —</option>
                    {teamMembers.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Datum */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Datum von</label>
                  <input
                    type="date"
                    value={advancedFilters.dateFrom}
                    onChange={(e) => setAdvancedFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border transition-colors
                      bg-gray-50 border-gray-200 text-gray-900
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                      dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Datum bis</label>
                  <input
                    type="date"
                    value={advancedFilters.dateTo}
                    onChange={(e) => setAdvancedFilters((f) => ({ ...f, dateTo: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border transition-colors
                      bg-gray-50 border-gray-200 text-gray-900
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                      dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  />
                </div>
              </div>

              {/* Reset */}
              {hasAdvancedFilters && (
                <div className="flex justify-end pt-0.5">
                  <button
                    onClick={() => setAdvancedFilters({ type: "alle", assignedTo: "", dateFrom: "", dateTo: "" })}
                    className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    Filter zurücksetzen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Treffer-Info */}
          {isSearchActive && !loading && (
            <div className="flex items-center justify-between mt-2 px-0.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {filteredSorted.length + filteredCompletedList.length} Ergebnis{filteredSorted.length + filteredCompletedList.length !== 1 ? "se" : ""}
              </span>
              <button onClick={resetSearch} className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400">
                Suche zurücksetzen
              </button>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          </div>
        )}

        {!loading && (
          <>
            {/* Fristen von heute */}
            {todayFristen.length > 0 && (
              <div className="rounded-xl p-4 mb-6 border bg-red-50 border-red-200 dark:bg-red-950/60 dark:border-red-500/40">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-red-500 dark:text-red-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                    {todayFristen.length === 1
                      ? "1 Frist läuft heute ab"
                      : `${todayFristen.length} Fristen laufen heute ab`}
                  </span>
                </div>
                <div className="space-y-2">
                  {todayFristen.map((d) => (
                    <div key={d.id} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{d.title}</p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                          {[d.description, d.assigned_to].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Kalender-Ansicht ──────────────────────────────────── */}
            {viewMode === "calendar" && (
              <div className="space-y-4">
                <div className="rounded-xl overflow-hidden border bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                    <button
                      onClick={prevMonth}
                      className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {MONTH_NAMES[calMonth]} {calYear}
                    </span>
                    <button
                      onClick={nextMonth}
                      className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
                    {DAY_HEADERS.map((h) => (
                      <div key={h} className="text-center text-xs font-semibold py-2.5 text-gray-400 dark:text-gray-500">
                        {h}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7">
                    {cells.map((day, idx) => {
                      const dayDeadlines = day ? deadlinesForDay(day) : [];
                      const isToday = isCurrentMonth && day === today.getDate();
                      const isSelected = day === selectedDay;
                      const isPast = day !== null && new Date(calYear, calMonth, day) < today;
                      const hasFrist = dayDeadlines.some((d) => d.type === "frist");
                      const hasTermin = dayDeadlines.some((d) => d.type === "termin");
                      const hasGoogle = day ? googleEventsForDay(day).length > 0 : false;
                      const hasImmoware = day ? immowareEventsForDay(day).length > 0 : false;

                      return (
                        <div
                          key={idx}
                          onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                          className={`relative min-h-[64px] p-1.5 border-b border-r flex flex-col items-center
                            border-gray-100 dark:border-gray-800/60
                            ${day ? "cursor-pointer" : ""}
                            ${isSelected && !isToday ? "bg-indigo-50 dark:bg-indigo-600/10" : ""}
                            ${day && !isToday && !isSelected ? "hover:bg-gray-50 dark:hover:bg-gray-800/60" : ""}
                            ${!day ? "bg-gray-50/50 dark:bg-gray-900/30" : ""}
                          `}
                        >
                          {day && (
                            <>
                              <span
                                className={`text-sm w-7 h-7 flex items-center justify-center rounded-full font-medium transition-colors
                                  ${isToday ? "bg-indigo-600 text-white font-bold" : ""}
                                  ${isSelected && !isToday ? "ring-2 ring-indigo-500 text-indigo-600 dark:text-indigo-300" : ""}
                                  ${isPast && !isToday ? "text-gray-300 dark:text-gray-600" : ""}
                                  ${!isPast && !isToday ? "text-gray-700 dark:text-gray-300" : ""}
                                `}
                              >
                                {day}
                              </span>
                              {(dayDeadlines.length > 0 || hasGoogle || hasImmoware) && (
                                <div className="flex gap-1 mt-1">
                                  {hasFrist && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                                  {hasTermin && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                  {hasGoogle && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                                  {hasImmoware && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legende */}
                <div className="flex items-center gap-4 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-xs text-gray-400 dark:text-gray-500">Frist</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs text-gray-400 dark:text-gray-500">Termin</span>
                  </div>
                  {googleEvents.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs text-gray-400 dark:text-gray-500">Google</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={toggleImmowareVisible}
                    title={immowareVisible ? "Immoware-Kalender ausblenden / entfernen" : "Immoware-Kalender einblenden / hinzufügen"}
                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-full transition-colors
                      ${immowareVisible
                        ? "hover:bg-amber-50 dark:hover:bg-amber-500/10"
                        : "opacity-50 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800"}
                    `}
                  >
                    <span className={`w-2 h-2 rounded-full ${immowareVisible ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                    <span className="text-xs text-gray-400 dark:text-gray-500">Immoware</span>
                    {immowareVisible
                      ? <Eye className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      : <EyeOff className="w-3 h-3 text-gray-400 dark:text-gray-500" />}
                  </button>
                  {isCurrentMonth && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 inline-flex items-center justify-center text-[10px] text-white font-bold">
                        {today.getDate()}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">Heute</span>
                    </div>
                  )}
                </div>

                {/* Tagesdetails */}
                {selectedDay !== null && (
                  <div className="rounded-xl overflow-hidden border bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        {filteredDayDeadlines.length > 0
                          ? `${filteredDayDeadlines.length} Eintrag${filteredDayDeadlines.length > 1 ? "träge" : ""} am ${selectedDay}. ${MONTH_NAMES[calMonth]} ${calYear}`
                          : `Keine Einträge am ${selectedDay}. ${MONTH_NAMES[calMonth]} ${calYear}`}
                      </h2>
                      <button
                        onClick={() => {
                          setEditingDeadline(null);
                          setShowDialog(true);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                          border border-indigo-300 text-indigo-600 hover:bg-indigo-50
                          dark:border-indigo-500/40 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                      >
                        <Plus className="w-3 h-3" /> Neu
                      </button>
                    </div>
                    {(() => {
                      const dayGoogle = googleEventsForDay(selectedDay);
                      const dayImmoware = immowareEventsForDay(selectedDay);
                      if (filteredDayDeadlines.length === 0 && dayGoogle.length === 0 && dayImmoware.length === 0) {
                        return (
                          <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-600">
                            Kein Termin oder keine Frist an diesem Tag.
                          </div>
                        );
                      }
                      return (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                          {filteredDayDeadlines.map((d) => (
                            <DeadlineRow
                              key={d.id}
                              deadline={d}
                              contact={d.contact_id ? contactsById.get(d.contact_id) : undefined}
                              deleting={deleting === d.id}
                              onEdit={() => openEdit(d)}
                              onDelete={() => handleDelete(d.id)}
                              onToggle={() => handleToggleComplete(d)}
                            />
                          ))}
                          {dayGoogle.map((e) => (
                            <GoogleEventRow key={e.id} event={e} time={googleEventTime(e)} />
                          ))}
                          {dayImmoware.map((e) => (
                            <ImmowareEventRow key={e.id} event={e} time={immowareEventTime(e)} />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ── Listen-Ansicht ────────────────────────────────────── */}
            {viewMode === "list" && (
              <div className="space-y-2">
                {filteredSorted.length === 0 && filteredCompletedList.length === 0 && (
                  <div className="text-center py-16 text-gray-400 dark:text-gray-600">
                    <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">
                      {isSearchActive ? "Keine Ergebnisse für diese Suche." : "Noch keine Einträge vorhanden."}
                    </p>
                    {isSearchActive && (
                      <button onClick={resetSearch} className="mt-2 text-xs text-indigo-500 hover:underline">
                        Suche zurücksetzen
                      </button>
                    )}
                  </div>
                )}

                {/* Offene Einträge */}
                {filteredSorted.length > 0 && (
                  <div className="space-y-2">
                    {filteredSorted.map((d) => (
                      <DeadlineCard
                        key={d.id}
                        deadline={d}
                        contact={d.contact_id ? contactsById.get(d.contact_id) : undefined}
                        deleting={deleting === d.id}
                        onEdit={() => openEdit(d)}
                        onDelete={() => handleDelete(d.id)}
                        onToggle={() => handleToggleComplete(d)}
                      />
                    ))}
                  </div>
                )}

                {/* Erledigte */}
                {filteredCompletedList.length > 0 && (
                  <details className="mt-4">
                    <summary className="text-xs font-medium text-gray-400 dark:text-gray-600 cursor-pointer hover:text-gray-600 dark:hover:text-gray-400 select-none py-2">
                      {filteredCompletedList.length} erledigte Einträge
                    </summary>
                    <div className="mt-2 space-y-2 opacity-60">
                      {filteredCompletedList.map((d) => (
                          <DeadlineCard
                            key={d.id}
                            deadline={d}
                            contact={d.contact_id ? contactsById.get(d.contact_id) : undefined}
                            deleting={deleting === d.id}
                            onEdit={() => openEdit(d)}
                            onDelete={() => handleDelete(d.id)}
                            onToggle={() => handleToggleComplete(d)}
                          />
                        ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ─── GoogleEventRow (read-only Google-Termin im Tagesdetail) ────────────────

function GoogleEventRow({ event: e, time }: { event: GoogleEvent; time: string | null }) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0">
        <CalendarDays className="w-4 h-4 text-emerald-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{e.summary}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 dark:text-emerald-300">Google</span>
          {time && <span className="text-xs text-gray-400 dark:text-gray-500">{time} Uhr</span>}
        </div>
        {e.description && (
          <p className="text-xs mt-0.5 text-gray-500 dark:text-gray-400 line-clamp-2">{e.description}</p>
        )}
        {e.location && (
          <div className="flex items-center gap-1 mt-1">
            <MapPin size={11} className="text-emerald-400 flex-shrink-0" />
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{e.location}</span>
          </div>
        )}
      </div>
      {e.htmlLink && (
        <a
          href={e.htmlLink}
          target="_blank"
          rel="noopener noreferrer"
          title="In Google Kalender öffnen"
          className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors flex-shrink-0"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

// ─── ImmowareEventRow (read-only Immoware-Termin im Tagesdetail) ───────────

function ImmowareEventRow({ event: e, time }: { event: ImmowareEvent; time: string | null }) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0">
        <CalendarDays className="w-4 h-4 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{e.summary}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/20 dark:text-amber-300">Immoware</span>
          {time && <span className="text-xs text-gray-400 dark:text-gray-500">{time} Uhr</span>}
        </div>
        <p className="text-xs mt-0.5 text-amber-600/80 dark:text-amber-400/80">{e.calendarName}</p>
        {e.description && (
          <p className="text-xs mt-0.5 text-gray-500 dark:text-gray-400 line-clamp-2">{e.description}</p>
        )}
        {e.location && (
          <div className="flex items-center gap-1 mt-1">
            <MapPin size={11} className="text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-600 dark:text-amber-400">{e.location}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DeadlineRow (Kalender-Tagesdetail) ─────────────────────────────────────

function DeadlineRow({
  deadline: d,
  contact,
  deleting,
  onEdit,
  onDelete,
  onToggle,
}: {
  deadline: Deadline;
  contact?: ContactOption;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className={`px-4 py-3 flex items-start gap-3 ${d.completed ? "opacity-50" : ""}`}>
      <button onClick={onToggle} className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-indigo-500 transition-colors">
        {d.completed
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          : <Circle className="w-4 h-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold text-gray-900 dark:text-gray-100 ${d.completed ? "line-through" : ""}`}>
            {d.title}
          </span>
          <TypeBadge type={d.type} />
          {d.time && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{d.time} Uhr</span>
          )}
          {!d.completed && <DaysRemainingBadge days={getDaysRemaining(d.date)} />}
        </div>
        {d.description && (
          <p className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">{d.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {d.location && d.type === "termin" && (
            <div className="flex items-center gap-1">
              <MapPin size={11} className="text-indigo-400 flex-shrink-0" />
              <span className="text-xs text-indigo-500 dark:text-indigo-400">{d.location}</span>
            </div>
          )}
          {d.assigned_to && (
            <div className="flex items-center gap-1">
              <User size={11} className="text-gray-400" />
              <span className="text-xs text-gray-400">{d.assigned_to}</span>
            </div>
          )}
          {contact && (
            <Link
              href={`/kontakte/${contact.id}`}
              className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:underline"
            >
              <Users size={11} className="flex-shrink-0" />
              <span className="truncate max-w-[160px]">{contactDisplayName(contact)}</span>
            </Link>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ─── DeadlineCard (Listenansicht) ────────────────────────────────────────────

function DeadlineCard({
  deadline: d,
  contact,
  deleting,
  onEdit,
  onDelete,
  onToggle,
}: {
  deadline: Deadline;
  contact?: ContactOption;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const days = getDaysRemaining(d.date);

  return (
    <div className={`flex gap-3 rounded-xl p-4 border transition-colors bg-white border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800 dark:hover:border-gray-700 ${d.completed ? "opacity-60" : ""}`}>
      {/* Toggle + Farbpunkt */}
      <div className="flex flex-col items-center pt-0.5 gap-1">
        <button onClick={onToggle} className="text-gray-300 hover:text-indigo-500 transition-colors">
          {d.completed
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : <Circle className="w-4 h-4" />}
        </button>
        <div className={`w-2 h-2 rounded-full mt-1 ${d.type === "frist" ? "bg-red-500" : "bg-blue-500"}`} />
      </div>

      {/* Inhalt */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <Clock size={12} />
            <span>{formatDateTime(d.date, d.time)}</span>
          </div>
          {!d.completed && <DaysRemainingBadge days={days} />}
          <TypeBadge type={d.type} />
        </div>
        <h3 className={`text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100 ${d.completed ? "line-through" : ""}`}>
          {d.title}
        </h3>
        {d.description && (
          <p className="text-xs mt-1 leading-relaxed text-gray-500 dark:text-gray-400">{d.description}</p>
        )}
        {d.location && d.type === "termin" && (
          <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg
            bg-indigo-50 border border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20 w-fit">
            <MapPin size={11} className="text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{d.location}</span>
          </div>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {d.assigned_to && (
            <div className="flex items-center gap-1">
              <User size={11} className="text-indigo-400" />
              <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium">{d.assigned_to}</span>
            </div>
          )}
          {contact && (
            <Link
              href={`/kontakte/${contact.id}`}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
            >
              <Users size={11} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[160px]">
                {contactDisplayName(contact)}
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Datum-Badge + Aktionen */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border ${
          d.completed
            ? "bg-gray-100 border-gray-200 text-gray-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-500"
            : days <= 1 ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300"
            : days <= 3 ? "bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400"
            : days <= 7 ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-300"
            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
        }`}>
          {new Date(d.date).getDate()}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
