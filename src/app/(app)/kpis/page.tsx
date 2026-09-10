"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Info, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, BarChart3, Save,
  UserCheck, Clock, CalendarCheck, Users, Handshake, Layers,
  RefreshCw, Trophy, CircleDollarSign, TrendingUp, Target,
  Zap, CreditCard, MousePointerClick, Wallet, Phone, MapPin, Video,
  Activity, Trash2,
  type LucideIcon,
} from "lucide-react";
import Combobox from "@/components/Combobox";
import Checkbox from "@/components/Checkbox";

// ─── Chart Series ─────────────────────────────────────────────────────────────

type ChartBucket = {
  date: string; label: string;
  calls: number; meetingsOnsite: number; meetingsOnline: number;
  qualifiedLeads: number; demoBooked: number; demoHappened: number;
  wonDeals: number; lostDeals: number; mrrNew: number; revenue: number;
};

const CHART_SERIES = [
  { key: "calls",          label: "Anrufe",                color: "#6366f1" },
  { key: "meetingsOnsite", label: "Vor-Ort-Termine",       color: "#f59e0b" },
  { key: "meetingsOnline", label: "Online-Termine",        color: "#3b82f6" },
  { key: "qualifiedLeads", label: "Qual. Leads",           color: "#10b981" },
  { key: "demoBooked",     label: "Demo gebucht",          color: "#8b5cf6" },
  { key: "demoHappened",   label: "Demo stattgefunden",    color: "#ec4899" },
  { key: "wonDeals",       label: "Gewonnene Deals",       color: "#22c55e" },
  { key: "mrrNew",         label: "Neuer MRR (€)",         color: "#14b8a6" },
  { key: "revenue",        label: "Umsatz (€)",            color: "#f43f5e" },
] as const satisfies { key: keyof ChartBucket; label: string; color: string }[];

type ChartSeriesKey = typeof CHART_SERIES[number]["key"];
type ChartGranularity = "week" | "month" | "year";

// ─── Anrufliste-Auswertung ────────────────────────────────────────────────────

type CallCriterion = "call_status" | "call_result" | "follow_up" | "sentiment" | "gatekeeper_bypassed";

type CallAgg = {
  total: number;
  durationSec: number;
  buckets: Record<CallCriterion, Record<string, number>>;
};

type CallDateBucket = { key: string; label: string; total: number; counts: Record<string, number> };

type CallAnalysis = {
  total: CallAgg;
  users: (CallAgg & { user_id: string; name: string })[];
  byDate: CallDateBucket[];
};

const NONE_LABEL = "Ohne Angabe";

// Palette für gestapelte Balken (zyklisch)
const STACK_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#8b5cf6",
  "#14b8a6", "#f43f5e", "#22c55e", "#eab308", "#06b6d4", "#a855f7",
  "#ef4444", "#84cc16",
];

const CALL_CRITERIA: { key: CallCriterion; label: string; icon: LucideIcon; values: string[] }[] = [
  {
    key: "call_status", label: "Status", icon: Activity,
    values: ["Erreicht", "Nicht erreicht", "Falsche Nummer", "Anschluss existiert nicht", "Besetzt", "Rückruf erbeten", "Nicht interessiert"],
  },
  {
    key: "call_result", label: "Ergebnis", icon: Target,
    values: [
      "Information weitergegeben", "Information erhalten", "Termin vereinbart",
      "Termin verschoben / abgesagt", "Angebot besprochen", "Angebot angenommen",
      "Angebot abgelehnt", "Auftrag erteilt", "Vertrag abgeschlossen",
      "Reklamation / Beschwerde aufgenommen", "Mahnung / Zahlungserinnerung ausgesprochen",
      "Zahlung zugesagt", "Klärungsbedarf — Rücksprache nötig",
    ],
  },
  {
    key: "follow_up", label: "Follow-Up", icon: RefreshCw,
    values: ["Abgeschlossen", "Rückruf nötig", "E-Mail/Dokument senden", "Unterlagen anfordern", "Intern weiterleiten / Eskalation", "Wiedervorlage"],
  },
  {
    key: "sentiment", label: "Stimmung", icon: Users,
    values: ["Positiv / Interesse signalisiert", "Neutral", "Negativ / Ablehnung", "Eskalation / Konflikt"],
  },
  {
    key: "gatekeeper_bypassed", label: "Assistent vorbei?", icon: UserCheck,
    values: ["ja", "nein"],
  },
];

/** Ordered value list for a criterion incl. any unexpected values + "Ohne Angabe" last. */
function orderedValues(crit: CallCriterion, analysis: CallAnalysis): string[] {
  const base = CALL_CRITERIA.find(c => c.key === crit)!.values;
  const seen = new Set<string>();
  const collect = (b: Record<string, number>) => Object.keys(b).forEach(k => seen.add(k));
  collect(analysis.total.buckets[crit]);
  analysis.users.forEach(u => collect(u.buckets[crit]));
  const extras = [...seen].filter(v => v !== NONE_LABEL && !base.includes(v));
  const result = [...base.filter(v => seen.has(v)), ...extras];
  if (seen.has(NONE_LABEL)) result.push(NONE_LABEL);
  return result;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h} Std ${m} Min`;
  return `${m} Min`;
}

function dateToWeekInput(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day); // Thursday of ISO week
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekInputToDate(weekStr: string): string {
  const [yearPart, weekPart] = weekStr.split("-W");
  const year = parseInt(yearPart);
  const week = parseInt(weekPart);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (dow - 1) * 86400000 + (week - 1) * 7 * 86400000);
  return monday.toISOString().slice(0, 10);
}

function getChartRange(periodStart: string, granularity: ChartGranularity) {
  const [year, month, day] = periodStart.split("-").map(Number);
  if (granularity === "year") {
    return { start: `${year}-01-01`, end: `${year}-12-31`, gran: "month" as const };
  }
  if (granularity === "week") {
    const d = new Date(year, month - 1, day ?? 1);
    const dow = d.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(year, month - 1, (day ?? 1) + diffToMon);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    return { start: fmt(mon), end: fmt(sun), gran: "day" as const };
  }
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    gran: "day" as const,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  name: string;
};

type KpiValue = {
  value: number | null;
  raw?: number;
  numerator?: number;
  denominator?: number;
  pipelineValue?: number;
  targetRevenue?: number | null;
  wonRevenue?: number;
  wonCount?: number;
  trialCount?: number;
  cac?: number | null;
};

type KpiData = {
  period: { start: string; end: string };
  user_id: string;
  target: SalesTarget | null;
  kpis: Record<string, KpiValue>;
};

type SalesTarget = {
  id?: string;
  target_qualified_leads?: number | null;
  target_demo_bookings?: number | null;
  target_demo_show_ups?: number | null;
  target_new_customers?: number | null;
  target_revenue_eur?: number | null;
  target_mrr_eur?: number | null;
  target_win_rate?: number | null;
  cac_eur?: number | null;
};

type Activity = {
  id: string;
  entity_type: string;
  entity_id: string;
  type: string;
  title: string | null;
  description: string | null;
  performed_at: string;
  profiles?: { name: string } | null;
};

type CommEntry = {
  id: string;
  channel: string;
  direction: string | null;
  subject: string | null;
  occurred_at: string;
  created_by: string | null;
  duration_seconds: number | null;
  call_status: string | null;
  contacts: { first_name: string | null; last_name: string | null; company_name: string | null; type: string } | null;
};

type RecentEvent = {
  id: string;
  kind: "activity" | "email" | "phone";
  badge: string;
  badgeColor: string;
  dotColor: string;
  title: string | null;
  detail: string | null;
  contact: string | null;
  performerName: string | null;
  occurred_at: string;
  commId?: string; // raw communications.id for email/phone entries
};

// ─── KPI Meta ─────────────────────────────────────────────────────────────────

const KPI_META: Record<string, { label: string; tooltip: string; format: (v: KpiValue) => string; icon: LucideIcon; targetKey?: keyof SalesTarget; targetFactor?: number }> = {
  qualifiedLeadsPerWeek: {
    label: "Qual. Leads / Woche",
    tooltip: "Anzahl neuer qualifizierter Leads pro Woche. Ein Lead gilt als qualifiziert, wenn BANT-Kriterien (Budget, Authority, Need, Timeline) erfüllt sind.",
    format: (v) => v.value !== null ? `${v.value}` : "–",
    icon: UserCheck,
    targetKey: "target_qualified_leads",
  },
  leadResponseTimeHours: {
    label: "Lead-Antwortzeit",
    tooltip: "Durchschnittliche Zeit in Stunden zwischen dem Eingang eines neuen Leads und der ersten Reaktion des Vertrieblers. Ziel: unter 1 Stunde.",
    format: (v) => v.value !== null ? `${v.value}h` : "–",
    icon: Clock,
  },
  demoBookingRate: {
    label: "Demo-Buchungsrate",
    tooltip: "Anteil der qualifizierten Leads, die eine Demo gebucht haben. Zeigt die Effektivität des ersten Qualifizierungsgesprächs.",
    format: (v) => v.value !== null ? `${Math.round(v.value * 100)}%` : "–",
    icon: CalendarCheck,
    targetKey: "target_demo_bookings",
  },
  demoShowUpRate: {
    label: "Demo-Erscheinungsrate",
    tooltip: "Gesamtanteil der gebuchten Demos, bei denen der Interessent tatsächlich erschienen ist (online + vor Ort).",
    format: (v) => v.value !== null ? `${Math.round(v.value * 100)}%` : "–",
    icon: Users,
    targetKey: "target_demo_show_ups",
  },
  demoShowUpRateOnline: {
    label: "Demo-Erscheinung Online",
    tooltip: "Anteil der gebuchten Online-Demos (Typ: demo_booked_online), bei denen der Interessent erschienen ist (demo_happened_online).",
    format: (v) => v.value !== null ? `${Math.round(v.value * 100)}%` : "–",
    icon: Video,
  },
  demoShowUpRateOnsite: {
    label: "Demo-Erscheinung Vor Ort",
    tooltip: "Anteil der gebuchten Vor-Ort-Demos (Typ: demo_booked_onsite), bei denen der Interessent erschienen ist (demo_happened_onsite).",
    format: (v) => v.value !== null ? `${Math.round(v.value * 100)}%` : "–",
    icon: MapPin,
  },
  demoToCustomer: {
    label: "Demo → Kunde",
    tooltip: "Anteil der durchgeführten Demos, die zu einem zahlenden Kunden geführt haben. Zeigt die Überzeugungskraft der Produkt-Demo.",
    format: (v) => v.value !== null ? `${Math.round(v.value * 100)}%` : "–",
    icon: Handshake,
  },
  pipelineCoverage: {
    label: "Pipeline Coverage",
    tooltip: "Verhältnis des gesamten Pipeline-Werts (offene Deals) zum monatlichen Umsatzziel. Faktor ≥ 3x gilt als gesund.",
    format: (v) => v.value !== null ? `${Math.round(v.value * 10) / 10}x` : "–",
    icon: Layers,
  },
  salesCycleDays: {
    label: "Sales-Cycle",
    tooltip: "Durchschnittliche Anzahl an Tagen von der Qualifizierung bis zum Abschluss (Closed Won). Zeigt die Effizienz des Vertriebsprozesses.",
    format: (v) => v.value !== null ? `${v.value} Tage` : "–",
    icon: RefreshCw,
  },
  winRateDemo: {
    label: "Win-Rate (nach Demo)",
    tooltip: "Anteil der Deals, die nach einer Demo als 'Gewonnen' abgeschlossen wurden (vs. alle nach einer Demo geschlossenen Deals).",
    format: (v) => v.value !== null ? `${Math.round(v.value * 100)}%` : "–",
    icon: Trophy,
    targetKey: "target_win_rate",
    targetFactor: 0.01,
  },
  acv: {
    label: "Ø Vertragswert (ACV)",
    tooltip: "Durchschnittlicher Jahreswert eines gewonnenen Vertrags. Wichtige Metrik für die Umsatzplanung.",
    format: (v) => v.value !== null ? formatEur(v.value) : "–",
    icon: CircleDollarSign,
  },
  mrrNew: {
    label: "Neuer MRR",
    tooltip: "Neu generierter monatlich wiederkehrender Umsatz aus in diesem Monat gewonnenen Deals.",
    format: (v) => formatEur(v.value ?? 0),
    icon: TrendingUp,
    targetKey: "target_mrr_eur",
  },
  quotaAttainment: {
    label: "Quota-Erreichung",
    tooltip: "Prozentualer Anteil des Umsatzziels, der in diesem Zeitraum erreicht wurde.",
    format: (v) => v.value !== null ? `${Math.round(v.value * 100)}%` : "–",
    icon: Target,
    targetKey: "target_revenue_eur",
  },
  timeToFirstValueDays: {
    label: "Time-to-First-Value",
    tooltip: "Durchschnittliche Anzahl an Tagen vom Trial-Start bis zur ersten bedeutsamen Interaktion/Aktivierung des Kunden.",
    format: (v) => v.value !== null ? `${v.value} Tage` : "–",
    icon: Zap,
  },
  trialToPaid: {
    label: "Trial → Paid",
    tooltip: "Anteil der Trial-Kunden, die zu zahlenden Kunden konvertiert sind.",
    format: (v) => v.value !== null ? `${Math.round(v.value * 100)}%` : "–",
    icon: CreditCard,
  },
  featureAdoption: {
    label: "Feature Adoption (Trial)",
    tooltip: "Durchschnittliche Anzahl protokollierter Interaktionen/Aktivitäten während der Trial-Phase. Proxy für Feature-Nutzung.",
    format: (v) => v.value !== null ? `${v.value}` : "–",
    icon: MousePointerClick,
  },
  cacPaybackMonths: {
    label: "CAC Payback",
    tooltip: "Anzahl der Monate, bis die Kundenakquisitionskosten (CAC) durch den monatlich wiederkehrenden Umsatz (MRR) des Kunden gedeckt sind.",
    format: (v) => v.value !== null ? `${v.value} Mon.` : "–",
    icon: Wallet,
  },
  callsPerDay: {
    label: "Anrufe / Tag",
    tooltip: "Durchschnittliche Anzahl protokollierter Kundenanrufe pro Tag im gewählten Zeitraum.",
    format: (v) => v.value !== null ? `${v.value}` : "–",
    icon: Phone,
  },
  callsPerWeek: {
    label: "Anrufe / Woche",
    tooltip: "Durchschnittliche Anzahl protokollierter Kundenanrufe pro Woche im gewählten Zeitraum.",
    format: (v) => v.value !== null ? `${v.value}` : "–",
    icon: Phone,
  },
  callsPerMonth: {
    label: "Anrufe / Monat",
    tooltip: "Gesamtanzahl der protokollierten Kundenanrufe im gewählten Monat.",
    format: (v) => v.value !== null ? `${v.value}` : "–",
    icon: Phone,
  },
  callsTotal: {
    label: "Anrufe gesamt",
    tooltip: "Gesamtanzahl aller jemals protokollierten Kundenanrufe dieses Nutzers.",
    format: (v) => v.value !== null ? `${v.value}` : "–",
    icon: Phone,
  },
  meetingsOnsite: {
    label: "Vor-Ort-Termine",
    tooltip: "Anzahl der persönlichen Vor-Ort-Meetings im gewählten Zeitraum (Aktivitätstyp: meeting).",
    format: (v) => v.value !== null ? `${v.value}` : "–",
    icon: MapPin,
  },
  meetingsOnline: {
    label: "Online-Termine",
    tooltip: "Anzahl der Online-Meetings im gewählten Zeitraum (Aktivitätstyp: online_meeting).",
    format: (v) => v.value !== null ? `${v.value}` : "–",
    icon: Video,
  },
  phoneMinutesPerDay: {
    label: "Telefonzeit Ø Min/Tag",
    tooltip: "Durchschnittliche Telefonzeit in Minuten pro Tag im gewählten Zeitraum (nur Einträge mit erfasster Dauer).",
    format: (v) => v.value !== null ? `${v.value} Min` : "–",
    icon: Phone,
  },
  phoneMinutesPerWeek: {
    label: "Telefonzeit Ø Min/Woche",
    tooltip: "Durchschnittliche Telefonzeit in Minuten pro Woche im gewählten Zeitraum (nur Einträge mit erfasster Dauer).",
    format: (v) => v.value !== null ? `${v.value} Min` : "–",
    icon: Phone,
  },
  phoneHoursMonthYear: {
    label: "Telefonzeit Std/Monat & Jahr",
    tooltip: "Gesamte Telefonzeit in Stunden: linker Wert = gewählter Monat, rechter Wert = gesamtes Jahr des gewählten Zeitraums.",
    format: (v) => v.value !== null ? `${v.value} Std` : "–",
    icon: Phone,
  },
  appointmentsBooked: {
    label: "Vereinbarte Termine",
    tooltip: "Anzahl der Telefonate, bei denen das Ergebnis auf 'Termin vereinbart' gesetzt wurde.",
    format: (v) => v.value !== null ? `${v.value}` : "–",
    icon: CalendarCheck,
  },
  appointmentRate: {
    label: "Terminquote",
    tooltip: "Anteil der Telefonate, die zu einem vereinbarten Termin geführt haben (Ergebnis = 'Termin vereinbart').",
    format: (v) => v.value !== null ? `${Math.round(v.value * 100)}%` : "–",
    icon: Target,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(v: number): string {
  return v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

function getProgress(kpiKey: string, kpi: KpiValue, target: SalesTarget | null): number | null {
  const meta = KPI_META[kpiKey];
  if (!meta?.targetKey || !target) return null;
  const tVal = target[meta.targetKey] as number | null | undefined;
  if (tVal == null || tVal === 0) return null;
  const factor = meta.targetFactor ?? 1;
  const val = kpi.value;
  if (val === null) return 0;
  // For quotaAttainment, the value is already a ratio
  if (kpiKey === "quotaAttainment") return Math.min(val, 1);
  // For rate KPIs with targetFactor
  if (factor !== 1) return Math.min(val / (tVal * factor), 1);
  return Math.min(val / tVal, 1);
}

function progressColor(p: number | null): string {
  if (p === null) return "bg-gray-200 dark:bg-gray-700";
  if (p >= 1) return "bg-green-500";
  if (p >= 0.7) return "bg-amber-400";
  return "bg-red-500";
}

function progressTextColor(p: number | null): string {
  if (p === null) return "text-gray-400";
  if (p >= 1) return "text-green-600 dark:text-green-400";
  if (p >= 0.7) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function currentMonthEnd(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

function formatActivityType(type: string): string {
  const map: Record<string, string> = {
    call: "Anruf",
    email: "E-Mail",
    meeting: "Meeting",
    note: "Notiz",
    task: "Aufgabe",
    stage_change: "Stage-Änderung",
    demo_booked: "Demo gebucht",
    demo_booked_online: "Online-Demo gebucht",
    demo_booked_onsite: "Vor-Ort-Demo gebucht",
    demo_happened: "Demo stattgefunden",
    demo_happened_online: "Online-Demo stattgefunden",
    demo_happened_onsite: "Vor-Ort-Demo stattgefunden",
    online_meeting: "Online-Termin",
    proposal_sent: "Angebot gesendet",
    contract_sent: "Vertrag gesendet",
    trial_started: "Trial gestartet",
    other: "Sonstiges",
  };
  return map[type] ?? type;
}

function commContactName(c: CommEntry["contacts"]): string | null {
  if (!c) return null;
  if (c.type === "legal_entity") return c.company_name ?? null;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
}

function formatPhoneDetail(status: string | null, seconds: number | null): string {
  const statusLabels: Record<string, string> = {
    completed: "Verbunden",
    "no-answer": "Nicht abgehoben",
    busy: "Besetzt",
    failed: "Fehlgeschlagen",
    canceled: "Abgebrochen",
    "Nicht interessiert": "Nicht interessiert",
  };
  const parts: string[] = [];
  if (status) parts.push(statusLabels[status] ?? status);
  if (seconds && seconds > 0) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    parts.push(m > 0 ? `${m}:${String(s).padStart(2, "0")} Min` : `${s} Sek`);
  }
  return parts.join(" · ");
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        type="button"
        aria-label="Info"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 text-xs text-white bg-gray-900 dark:bg-gray-700 rounded-lg px-3 py-2 shadow-lg pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </span>
      )}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ kpiKey, kpi, target }: { kpiKey: string; kpi: KpiValue; target: SalesTarget | null }) {
  const meta = KPI_META[kpiKey];
  if (!meta) return null;
  const progress = getProgress(kpiKey, kpi, target);
  const displayValue = meta.format(kpi);
  const subText = kpi.numerator !== undefined && kpi.denominator !== undefined
    ? `${kpi.numerator} von ${kpi.denominator}`
    : kpi.wonCount !== undefined
    ? `${kpi.wonCount} gewonnen`
    : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <meta.icon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-tight truncate">
            {meta.label}
          </span>
        </div>
        <Tooltip text={meta.tooltip} />
      </div>
      <div className={`text-2xl font-bold ${displayValue === "–" ? "text-gray-400" : "text-gray-900 dark:text-white"}`}>
        {displayValue}
      </div>
      {subText && (
        <div className="text-xs text-gray-400 dark:text-gray-500">{subText}</div>
      )}
      {progress !== null && (
        <div className="mt-1">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-medium ${progressTextColor(progress)}`}>
              {Math.round(progress * 100)}% des Ziels
            </span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressColor(progress)}`}
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const ADMIN_EMAIL = "dennis@akturio.com";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KpiPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [periodStart, setPeriodStart] = useState(currentMonthStart());
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [activities, setActivities] = useState<RecentEvent[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [selectedComms, setSelectedComms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<"kpis" | "charts">("kpis");
  const [chartView, setChartView] = useState<"trend" | "calls">("trend");
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("month");
  const [selectedSeries, setSelectedSeries] = useState<ChartSeriesKey>("calls");
  const [chartData, setChartData] = useState<ChartBucket[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Anrufliste-Auswertung
  const [callAnalysis, setCallAnalysis] = useState<CallAnalysis | null>(null);
  const [callAnalysisLoading, setCallAnalysisLoading] = useState(false);
  const [callCriterion, setCallCriterion] = useState<CallCriterion>("call_status");

  // Goal form state
  const [goals, setGoals] = useState<SalesTarget>({
    target_qualified_leads: null,
    target_demo_bookings: null,
    target_demo_show_ups: null,
    target_new_customers: null,
    target_revenue_eur: null,
    target_mrr_eur: null,
    target_win_rate: null,
    cac_eur: null,
  });

  const userOptions = useMemo(() => [
    { value: "all", label: "Alle Nutzer" },
    ...profiles.map(p => ({ value: p.id, label: p.name })),
  ], [profiles]);

  // Load team members on mount
  useEffect(() => {
    async function loadProfiles() {
      const [teamRes, meRes] = await Promise.all([
        fetch("/api/team"),
        import("@/lib/supabase/client").then(({ createClient }) =>
          createClient().auth.getUser()
        ),
      ]);
      if (!teamRes.ok) return;
      const members: Profile[] = await teamRes.json();
      setProfiles(members);
      const currentUserId = meRes.data.user?.id;
      const email = meRes.data.user?.email ?? null;
      if (currentUserId) setSelectedUserId(currentUserId);
      setCurrentUserEmail(email);
    }
    loadProfiles();
  }, []);

  // Compute period end from periodStart
  const periodEnd = (() => {
    const [year, month] = periodStart.split("-").map(Number);
    return new Date(year, month, 0).toISOString().slice(0, 10);
  })();

  const fetchKpis = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        user_id: selectedUserId,
        period_start: periodStart,
        period_end: periodEnd,
      });
      const res = await fetch(`/api/kpis?${params}`);
      if (res.ok) {
        const data: KpiData = await res.json();
        setKpiData(data);
        if (data.target) {
          setGoals({
            target_qualified_leads: data.target.target_qualified_leads ?? null,
            target_demo_bookings: data.target.target_demo_bookings ?? null,
            target_demo_show_ups: data.target.target_demo_show_ups ?? null,
            target_new_customers: data.target.target_new_customers ?? null,
            target_revenue_eur: data.target.target_revenue_eur ?? null,
            target_mrr_eur: data.target.target_mrr_eur ?? null,
            target_win_rate: data.target.target_win_rate ?? null,
            cac_eur: data.target.cac_eur ?? null,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, periodStart, periodEnd]);

  const chartRange = useMemo(
    () => getChartRange(periodStart, chartGranularity),
    [periodStart, chartGranularity],
  );

  const fetchChartData = useCallback(async () => {
    if (!selectedUserId) return;
    setChartLoading(true);
    try {
      const params = new URLSearchParams({
        user_id: selectedUserId,
        range_start: chartRange.start,
        range_end: chartRange.end,
        granularity: chartRange.gran,
      });
      const res = await fetch(`/api/kpis/chart?${params}`);
      if (res.ok) {
        const data = await res.json();
        setChartData(data.buckets);
      }
    } finally {
      setChartLoading(false);
    }
  }, [selectedUserId, chartRange]);

  const fetchCallAnalysis = useCallback(async () => {
    setCallAnalysisLoading(true);
    try {
      const params = new URLSearchParams({
        range_start: chartRange.start,
        range_end: chartRange.end,
        granularity: chartRange.gran,
      });
      const res = await fetch(`/api/kpis/call-analysis?${params}`);
      if (res.ok) setCallAnalysis(await res.json());
    } finally {
      setCallAnalysisLoading(false);
    }
  }, [chartRange]);

  const fetchActivities = useCallback(async () => {
    setSelectedComms(new Set());
    const userQ = selectedUserId && selectedUserId !== "all" ? `&user_id=${selectedUserId}` : "";
    const createdByQ = selectedUserId && selectedUserId !== "all" ? `&created_by=${selectedUserId}` : "";

    const [actsRes, commsRes] = await Promise.all([
      fetch(`/api/activities?entity_type=deal&limit=30${userQ}`),
      fetch(`/api/communications?channel=email&channel=phone&limit=30${createdByQ}`),
    ]);

    const events: RecentEvent[] = [];

    if (actsRes.ok) {
      const acts: Activity[] = await actsRes.json();
      for (const a of acts) {
        events.push({
          id: `act_${a.id}`,
          kind: "activity",
          badge: formatActivityType(a.type),
          badgeColor: "text-indigo-600 dark:text-indigo-400",
          dotColor: "bg-indigo-400",
          title: a.title,
          detail: a.description,
          contact: null,
          performerName: a.profiles?.name ?? null,
          occurred_at: a.performed_at,
        });
      }
    }

    if (commsRes.ok) {
      const comms: CommEntry[] = await commsRes.json();
      for (const c of comms) {
        const isEmail = c.channel === "email";
        events.push({
          id: `comm_${c.id}`,
          kind: isEmail ? "email" : "phone",
          badge: isEmail ? "E-Mail" : "Anruf",
          badgeColor: isEmail
            ? "text-violet-600 dark:text-violet-400"
            : "text-emerald-600 dark:text-emerald-400",
          dotColor: isEmail ? "bg-violet-400" : "bg-emerald-400",
          title: isEmail ? (c.subject ?? "(kein Betreff)") : null,
          detail: isEmail
            ? (c.direction === "inbound" ? "Eingehend" : "Ausgehend")
            : formatPhoneDetail(c.call_status, c.duration_seconds),
          contact: commContactName(c.contacts),
          performerName: profiles.find(p => p.id === c.created_by)?.name ?? null,
          occurred_at: c.occurred_at,
          commId: c.id,
        });
      }
    }

    events.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    setActivities(events.slice(0, 25));
  }, [selectedUserId, profiles]);

  const isAdmin = currentUserEmail === ADMIN_EMAIL;

  const callChartData = useMemo(() => {
    if (!callAnalysis) return { rows: [] as Record<string, string | number>[], values: [] as string[] };
    const values = orderedValues(callCriterion, callAnalysis);
    const mk = (label: string, agg: CallAgg): Record<string, string | number> => {
      const row: Record<string, string | number> = { name: label };
      for (const v of values) row[v] = agg.buckets[callCriterion][v] ?? 0;
      return row;
    };
    const rows = [mk("Gesamt", callAnalysis.total), ...callAnalysis.users.map(u => mk(u.name, u))];
    return { rows, values };
  }, [callAnalysis, callCriterion]);

  // Pro Datum: ein gestapelter Balken je Tag, Segmente = Nutzer
  const callDateChartData = useMemo(() => {
    if (!callAnalysis) return [];
    return callAnalysis.byDate.map(b => {
      const row: Record<string, string | number> = { label: b.label };
      for (const u of callAnalysis.users) row[u.name] = b.counts[u.user_id] ?? 0;
      return row;
    });
  }, [callAnalysis]);

  async function handleBulkDeleteComms() {
    const ids = [...selectedComms];
    if (!ids.length) return;
    if (!confirm(`${ids.length} Telefonat${ids.length > 1 ? "e" : ""} wirklich löschen?`)) return;
    await Promise.all(ids.map(id => fetch(`/api/communications/${id}`, { method: "DELETE" })));
    setActivities(prev => prev.filter(ev => !ev.commId || !selectedComms.has(ev.commId)));
    setSelectedComms(new Set());
  }

  useEffect(() => {
    if (selectedUserId) {
      fetchKpis();
      fetchActivities();
    }
  }, [selectedUserId, periodStart, fetchKpis, fetchActivities]);

  useEffect(() => {
    if (activeTab === "charts" && chartView === "trend" && selectedUserId) fetchChartData();
  }, [activeTab, chartView, selectedUserId, fetchChartData]);

  useEffect(() => {
    if (activeTab === "charts" && chartView === "calls") fetchCallAnalysis();
  }, [activeTab, chartView, fetchCallAnalysis]);

  function navigatePeriod(direction: -1 | 1) {
    const d = new Date(periodStart + "T12:00:00");
    if (activeTab === "charts" && chartGranularity === "week") {
      d.setDate(d.getDate() + direction * 7);
    } else if (activeTab === "charts" && chartGranularity === "year") {
      d.setFullYear(d.getFullYear() + direction);
      d.setMonth(0);
      d.setDate(1);
    } else {
      d.setMonth(d.getMonth() + direction);
      d.setDate(1);
    }
    setPeriodStart(d.toISOString().slice(0, 10));
  }

  async function saveGoals() {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await fetch("/api/sales-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selectedUserId,
          period_type: "monthly",
          period_start: periodStart,
          ...goals,
        }),
      });
      await fetchKpis();
    } finally {
      setSaving(false);
    }
  }

  function goalField(key: keyof SalesTarget, label: string, suffix?: string) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 dark:text-gray-400">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={goals[key] ?? ""}
            onChange={e => setGoals(prev => ({ ...prev, [key]: e.target.value === "" ? null : Number(e.target.value) }))}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            placeholder="–"
            min={0}
          />
          {suffix && <span className="text-xs text-gray-400 flex-shrink-0">{suffix}</span>}
        </div>
      </div>
    );
  }

  const kpiKeys = Object.keys(KPI_META);

  return (
    <div className="min-h-screen px-6 py-8 max-w-7xl mx-auto bg-slate-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">KPI-Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Vertriebskennzahlen & Zielerreichung</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tab toggle */}
          <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden text-sm">
            {(["kpis", "charts"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-2 font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {tab === "kpis"
                  ? <BarChart3 className="w-3.5 h-3.5" />
                  : <Activity className="w-3.5 h-3.5" />}
                {tab === "kpis" ? "KPIs" : "Charts"}
              </button>
            ))}
          </div>

          {/* Month picker + navigation */}
          <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <button
              onClick={() => navigatePeriod(-1)}
              className="px-2 py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {activeTab === "charts" && chartGranularity === "week" ? (
              <input
                type="week"
                value={dateToWeekInput(periodStart)}
                onChange={e => { if (e.target.value) setPeriodStart(weekInputToDate(e.target.value)); }}
                className="text-sm px-2 py-2 bg-transparent text-gray-900 dark:text-white focus:outline-none border-x border-gray-200 dark:border-gray-700"
              />
            ) : activeTab === "charts" && chartGranularity === "year" ? (
              <input
                type="number"
                value={parseInt(periodStart.slice(0, 4))}
                onChange={e => {
                  const y = parseInt(e.target.value);
                  if (y >= 2000 && y <= 2099) setPeriodStart(`${y}-01-01`);
                }}
                min={2020}
                max={2099}
                className="text-sm px-2 py-2 bg-transparent text-gray-900 dark:text-white focus:outline-none border-x border-gray-200 dark:border-gray-700 w-20 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            ) : (
              <input
                type="month"
                value={periodStart.slice(0, 7)}
                onChange={e => setPeriodStart(e.target.value + "-01")}
                className="text-sm px-2 py-2 bg-transparent text-gray-900 dark:text-white focus:outline-none border-x border-gray-200 dark:border-gray-700"
              />
            )}
            <button
              onClick={() => navigatePeriod(1)}
              className="px-2 py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* User selector */}
          <Combobox
            value={selectedUserId}
            onChange={setSelectedUserId}
            options={userOptions}
            placeholder="Nutzer wählen…"
            allowClear={false}
            className="sm:w-48"
          />
        </div>
      </div>

      {/* Goal Setting Panel */}
      <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 mb-6 overflow-hidden">
        <button
          onClick={() => setGoalsOpen(!goalsOpen)}
          className="w-full flex items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <span className="font-semibold text-gray-900 dark:text-white text-sm">Ziele festlegen</span>
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
              {periodStart.slice(0, 7)} · {kpiData?.target ? "Ziele gespeichert" : "Noch keine Ziele"}
            </span>
          </div>
          {goalsOpen ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {goalsOpen && (
          <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              {goalField("target_qualified_leads", "Qual. Leads / Monat")}
              {goalField("target_demo_bookings", "Demo-Buchungen")}
              {goalField("target_demo_show_ups", "Demo-Erscheinungen")}
              {goalField("target_new_customers", "Neukunden")}
              {goalField("target_revenue_eur", "Umsatzziel", "€")}
              {goalField("target_mrr_eur", "MRR-Ziel", "€")}
              {goalField("target_win_rate", "Win-Rate-Ziel", "%")}
              {goalField("cac_eur", "CAC", "€")}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={saveGoals}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Ziele speichern
              </button>
            </div>
          </div>
        )}
      </div>

      {activeTab === "kpis" ? (
        <>
          {/* KPI Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
            </div>
          ) : kpiData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {kpiKeys.map(key => {
                const kpi = kpiData.kpis[key];
                if (!kpi) return null;
                if (key === "phoneHoursMonthYear") {
                  const meta = KPI_META[key];
                  const year = periodStart.slice(0, 4);
                  return (
                    <div key={key} className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <meta.icon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-tight truncate">
                            {meta.label}
                          </span>
                        </div>
                        <Tooltip text={meta.tooltip} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-1">
                        <div>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">Monat</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {kpi.value !== null ? `${kpi.value} Std` : "–"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">{year}</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {kpi.raw !== undefined ? `${kpi.raw} Std` : "–"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }
                return <KpiCard key={key} kpiKey={key} kpi={kpi} target={kpiData.target} />;
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-500">
              <BarChart3 className="w-12 h-12 mb-3" />
              <p className="text-sm">Wähle einen Zeitraum und Mitarbeiter aus, um KPIs zu laden</p>
            </div>
          )}
        </>
      ) : (
        /* ── Charts Tab ── */
        <div className="space-y-4">
          {/* Sub-Ansicht + Granularität (für beide Ansichten) */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden text-sm w-fit">
              {([["trend", "Verlauf"], ["calls", "Anrufliste"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setChartView(v)}
                  className={`flex items-center gap-1.5 px-3 py-2 font-medium transition-colors ${
                    chartView === v
                      ? "bg-indigo-600 text-white"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {v === "trend" ? <Activity className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                  {label}
                </button>
              ))}
            </div>

            {/* Granularität: Woche / Monat / Jahr */}
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden text-sm">
              {(["week", "month", "year"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setChartGranularity(g)}
                  className={`px-3 py-2 font-medium transition-colors ${
                    chartGranularity === g
                      ? "bg-indigo-600 text-white"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {{ week: "Woche", month: "Monat", year: "Jahr" }[g]}
                </button>
              ))}
            </div>
          </div>

          {chartView === "trend" ? (
          <div className="space-y-4">
          {/* Chart controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Series selector */}
            <select
              value={selectedSeries}
              onChange={e => setSelectedSeries(e.target.value as ChartSeriesKey)}
              className="text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              {CHART_SERIES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Line Chart */}
          <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
            {chartLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-500">
                <Activity className="w-12 h-12 mb-3" />
                <p className="text-sm">Keine Daten für den gewählten Zeitraum</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
                  {CHART_SERIES.find(s => s.key === selectedSeries)?.label}
                  {" · "}
                  {chartRange.start} – {chartRange.end}
                </p>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e5e7eb" strokeOpacity={0.6} strokeWidth={1} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: "var(--tw-bg, #1f2937)",
                        border: "none",
                        borderRadius: "0.5rem",
                        fontSize: "0.75rem",
                      }}
                      labelStyle={{ fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                    <Line
                      type="monotone"
                      dataKey={selectedSeries}
                      name={CHART_SERIES.find(s => s.key === selectedSeries)?.label}
                      stroke={CHART_SERIES.find(s => s.key === selectedSeries)?.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
          </div>
          ) : (
          /* ── Anrufliste-Auswertung ── */
          <div className="space-y-4">
            {callAnalysisLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
              </div>
            ) : !callAnalysis || callAnalysis.total.total === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-500">
                <Phone className="w-12 h-12 mb-3" />
                <p className="text-sm">Keine Telefonate im gewählten Zeitraum</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {chartRange.start} – {chartRange.end} · {callAnalysis.users.length} Nutzer
                </p>

                {/* Kennzahlen gesamt */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {(() => {
                    const t = callAnalysis.total;
                    const reached = t.buckets.call_status["Erreicht"] ?? 0;
                    const appts = t.buckets.call_result["Termin vereinbart"] ?? 0;
                    const stat = (label: string, value: string, icon: LucideIcon) => {
                      const Icon = icon;
                      return (
                        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Icon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{label}</span>
                          </div>
                          <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
                        </div>
                      );
                    };
                    return (
                      <>
                        {stat("Anrufe gesamt", `${t.total}`, Phone)}
                        {stat("Gesprächszeit", formatDuration(t.durationSec), Clock)}
                        {stat("Ø Dauer/Anruf", `${(t.durationSec / t.total / 60).toFixed(1)} Min`, Clock)}
                        {stat("Erreichbarkeit", `${Math.round((reached / t.total) * 100)}%`, Activity)}
                        {stat("Terminquote", `${Math.round((appts / t.total) * 100)}%`, Target)}
                      </>
                    );
                  })()}
                </div>

                {/* Kriterium-Auswahl */}
                <div className="flex flex-wrap items-center gap-2">
                  {CALL_CRITERIA.map(c => {
                    const Icon = c.icon;
                    const active = callCriterion === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => setCallCriterion(c.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          active
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {c.label}
                      </button>
                    );
                  })}
                </div>

                {/* Gestapeltes Balkendiagramm pro Nutzer */}
                <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
                    {CALL_CRITERIA.find(c => c.key === callCriterion)?.label} · Verteilung pro Nutzer
                  </p>
                  <ResponsiveContainer width="100%" height={Math.max(160, callChartData.rows.length * 48 + 40)}>
                    <BarChart layout="vertical" data={callChartData.rows} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                      <CartesianGrid horizontal={false} stroke="#e5e7eb" strokeOpacity={0.6} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <RechartsTooltip
                        contentStyle={{ background: "#1f2937", border: "none", borderRadius: "0.5rem", fontSize: "0.75rem", color: "#fff" }}
                        labelStyle={{ fontWeight: 600, color: "#fff" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
                      {callChartData.values.map((v, i) => (
                        <Bar key={v} dataKey={v} stackId="a" fill={STACK_COLORS[i % STACK_COLORS.length]} radius={[0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Anrufe pro Datum — wer wieviele */}
                {callAnalysis.byDate.length > 0 && (
                  <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 space-y-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Anrufe pro {chartRange.gran === "month" ? "Monat" : "Tag"} · pro Nutzer
                    </p>

                    {/* Gestapeltes Balkendiagramm */}
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={callDateChartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid vertical={false} stroke="#e5e7eb" strokeOpacity={0.6} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                        <RechartsTooltip
                          contentStyle={{ background: "#1f2937", border: "none", borderRadius: "0.5rem", fontSize: "0.75rem", color: "#fff" }}
                          labelStyle={{ fontWeight: 600, color: "#fff" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
                        {callAnalysis.users.map((u, i) => (
                          <Bar key={u.user_id} dataKey={u.name} stackId="d" fill={STACK_COLORS[i % STACK_COLORS.length]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Matrix-Tabelle: Datum × Nutzer */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                            <th className="px-3 py-2 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Datum</th>
                            {callAnalysis.users.map(u => (
                              <th key={u.user_id} className="px-3 py-2 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 text-right whitespace-nowrap">{u.name}</th>
                            ))}
                            <th className="px-3 py-2 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 text-right">Gesamt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {callAnalysis.byDate.map(b => (
                            <tr key={b.key} className={`border-b border-gray-50 dark:border-gray-800/50 ${b.total === 0 ? "opacity-40" : ""}`}>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{b.label}</td>
                              {callAnalysis.users.map(u => (
                                <td key={u.user_id} className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{b.counts[u.user_id] ?? 0}</td>
                              ))}
                              <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">{b.total}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-gray-200 dark:border-gray-700 font-semibold bg-gray-50/50 dark:bg-gray-800/30">
                            <td className="px-3 py-2 text-gray-900 dark:text-white">Gesamt</td>
                            {callAnalysis.users.map(u => (
                              <td key={u.user_id} className="px-3 py-2 text-right text-gray-900 dark:text-white">{u.total}</td>
                            ))}
                            <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{callAnalysis.total.total}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tabelle pro Nutzer */}
                <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                        {["Nutzer", "Anrufe", "Erreicht", "Termin vereinbart", "Ø Dauer", "Gesprächszeit"].map((h, i) => (
                          <th key={h} className={`px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 ${i === 0 ? "" : "text-right"}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {callAnalysis.users.map(u => {
                        const reached = u.buckets.call_status["Erreicht"] ?? 0;
                        const appts = u.buckets.call_result["Termin vereinbart"] ?? 0;
                        return (
                          <tr key={u.user_id} className="border-b border-gray-50 dark:border-gray-800/50">
                            <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{u.name}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{u.total}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{reached}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{appts}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{(u.durationSec / u.total / 60).toFixed(1)} Min</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">{formatDuration(u.durationSec)}</td>
                          </tr>
                        );
                      })}
                      {(() => {
                        const t = callAnalysis.total;
                        const reached = t.buckets.call_status["Erreicht"] ?? 0;
                        const appts = t.buckets.call_result["Termin vereinbart"] ?? 0;
                        return (
                          <tr className="border-t-2 border-gray-200 dark:border-gray-700 font-semibold bg-gray-50/50 dark:bg-gray-800/30">
                            <td className="px-4 py-2.5 text-gray-900 dark:text-white">Gesamt</td>
                            <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">{t.total}</td>
                            <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">{reached}</td>
                            <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">{appts}</td>
                            <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">{(t.durationSec / t.total / 60).toFixed(1)} Min</td>
                            <td className="px-4 py-2.5 text-right text-gray-900 dark:text-white">{formatDuration(t.durationSec)}</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          )}
        </div>
      )}

      {/* Activity Log — nur im KPI-Tab */}
      {activeTab === "kpis" && <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Letzte Aktivitäten</h2>
          {isAdmin && selectedComms.size > 0 && (
            <button
              onClick={handleBulkDeleteComms}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {selectedComms.size} Telefonat{selectedComms.size > 1 ? "e" : ""} löschen
            </button>
          )}
        </div>
        {activities.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            Noch keine Aktivitäten erfasst
          </div>
        ) : (
          <ul className="divide-y divide-gray-50 dark:divide-gray-800">
            {activities.map(ev => (
              <li key={ev.id} className="flex items-start gap-3 px-5 py-3">
                {isAdmin && ev.kind === "phone" && ev.commId && (
                  <div className="mt-0.5 flex-shrink-0">
                    <Checkbox
                      checked={selectedComms.has(ev.commId)}
                      onChange={() => setSelectedComms(prev => {
                        const next = new Set(prev);
                        if (next.has(ev.commId!)) next.delete(ev.commId!); else next.add(ev.commId!);
                        return next;
                      })}
                    />
                  </div>
                )}
                <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${ev.dotColor}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium ${ev.badgeColor}`}>
                      {ev.badge}
                    </span>
                    {ev.title && (
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{ev.title}</span>
                    )}
                    {ev.contact && (
                      <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{ev.contact}</span>
                    )}
                  </div>
                  {ev.detail && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ev.detail}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {ev.performerName && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{ev.performerName}</span>
                    )}
                    <span className="text-xs text-gray-300 dark:text-gray-600">
                      {new Date(ev.occurred_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>}
    </div>
  );
}
