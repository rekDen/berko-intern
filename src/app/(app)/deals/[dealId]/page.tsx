"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, Loader2, Trash2, Pencil, X, Check,
} from "lucide-react";
import { contactDisplayName, type DealStatus } from "@/types/crm";
import PersonAvatar from "@/components/crm/PersonAvatar";
import ContractDocuments from "@/components/dms/ContractDocuments";
import Combobox from "@/components/Combobox";
import { fetchAllContacts } from "@/lib/fetch-all-contacts";
import { DEAL_STATUS_LABELS, DEAL_STATUS_COLORS } from "../page";

type DealDetail = {
  id: string;
  title: string | null;
  description: string | null;
  deal_status: DealStatus;
  priority: string | null;
  amount: number | null;
  currency: string | null;
  probability: number | null;
  expected_close_date: string | null;
  actual_close_date: string | null;
  source: string | null;
  source_campaign: string | null;
  referral_contact_id: string | null;
  lost_reason: string | null;
  lost_to_competitor: string | null;
  lost_notes: string | null;
  last_activity_at: string | null;
  next_activity_at: string | null;
  forecast_category: string | null;
  owner_id: string | null;
  contact_id: string | null;
  notes: string | null;
  created_at: string;
};

type EditableForm = {
  deal_status: DealStatus;
  title: string;
  description: string;
  contact_id: string;
  owner_id: string;
  amount: string;
  currency: string;
  probability: string;
  expected_close_date: string;
  actual_close_date: string;
  source: string;
  source_campaign: string;
  referral_contact_id: string;
  priority: string;
  last_activity_at: string;
  next_activity_at: string;
  forecast_category: string;
  lost_reason: string;
  lost_to_competitor: string;
  lost_notes: string;
  notes: string;
};

type ContactOption = {
  id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};
type TeamMember = { id: string; name: string; title: string | null; initials: string | null };

const DEAL_STATUSES: DealStatus[] = [
  "lead", "contacted", "on_hold", "qualified", "disqualified",
  "demo", "proposal", "negotiation", "won", "lost",
];

const SOURCE_LABELS: Record<string, string> = {
  website: "Website", referral: "Empfehlung", cold_outreach: "Cold Outreach",
  inbound_call: "Eingehender Anruf", event: "Veranstaltung",
};
const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Dringend", high: "Hoch", medium: "Mittel", low: "Niedrig",
};
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  high: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  medium: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  low: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};
const FORECAST_LABELS: Record<string, string> = {
  pipeline: "Pipeline", best_case: "Best Case", commit: "Commit", closed: "Closed",
};
const LOST_REASON_LABELS: Record<string, string> = {
  price: "Preis", competitor: "Wettbewerber", timing: "Timing",
  no_decision: "Keine Entscheidung", other: "Sonstiges",
};

function fmt(amount: number | null, currency = "EUR"): string {
  if (amount == null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(amount);
}

function fmtDate(d: string | null): string {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("de-DE");
}

function toForm(d: DealDetail): EditableForm {
  return {
    deal_status: d.deal_status,
    title: d.title ?? "",
    description: d.description ?? "",
    contact_id: d.contact_id ?? "",
    owner_id: d.owner_id ?? "",
    amount: d.amount?.toString() ?? "",
    currency: d.currency ?? "EUR",
    probability: d.probability?.toString() ?? "",
    expected_close_date: d.expected_close_date?.slice(0, 10) ?? "",
    actual_close_date: d.actual_close_date?.slice(0, 10) ?? "",
    source: d.source ?? "",
    source_campaign: d.source_campaign ?? "",
    referral_contact_id: d.referral_contact_id ?? "",
    priority: d.priority ?? "",
    last_activity_at: d.last_activity_at?.slice(0, 10) ?? "",
    next_activity_at: d.next_activity_at?.slice(0, 10) ?? "",
    forecast_category: d.forecast_category ?? "",
    lost_reason: d.lost_reason ?? "",
    lost_to_competitor: d.lost_to_competitor ?? "",
    lost_notes: d.lost_notes ?? "",
    notes: d.notes ?? "",
  };
}

export default function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const router = useRouter();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [form, setForm] = useState<EditableForm | null>(null);
  const [error, setError] = useState("");

  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [res, c, t] = await Promise.all([
      fetch(`/api/deals/${dealId}`),
      fetchAllContacts<ContactOption>(),
      fetch("/api/team").then((r) => (r.ok ? r.json() : [])),
    ]);
    if (res.ok) setDeal(await res.json());
    setContacts(c);
    setTeam(t);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(newStatus: DealStatus) {
    if (!deal || newStatus === deal.deal_status) return;
    setStatusSaving(true);
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_status: newStatus }),
    });
    if (res.ok) setDeal((d) => d ? { ...d, deal_status: newStatus } : d);
    setStatusSaving(false);
  }

  function startEdit() {
    if (!deal) return;
    setForm(toForm(deal));
    setError("");
    setEditing(true);
  }

  function cancelEdit() { setEditing(false); setForm(null); setError(""); }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError("");

    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deal_status: form.deal_status,
        title: form.title || null,
        description: form.description || null,
        contact_id: form.contact_id || null,
        owner_id: form.owner_id || null,
        amount: form.amount ? parseFloat(form.amount) : null,
        currency: form.currency || "EUR",
        probability: form.probability ? parseInt(form.probability) : null,
        expected_close_date: form.expected_close_date || null,
        actual_close_date: form.actual_close_date || null,
        source: form.source || null,
        source_campaign: form.source_campaign || null,
        referral_contact_id: form.referral_contact_id || null,
        priority: form.priority || null,
        last_activity_at: form.last_activity_at || null,
        next_activity_at: form.next_activity_at || null,
        forecast_category: form.forecast_category || null,
        lost_reason: form.lost_reason || null,
        lost_to_competitor: form.lost_to_competitor || null,
        lost_notes: form.lost_notes || null,
        notes: form.notes || null,
      }),
    });

    if (res.ok) {
      await load();
      setEditing(false);
      setForm(null);
    } else {
      const err = await res.json().catch(() => ({ error: "Fehler beim Speichern" }));
      setError(err.error ?? "Fehler beim Speichern");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Deal wirklich löschen?")) return;
    const res = await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
    if (res.ok) router.push("/deals");
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-gray-950"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (!deal) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-gray-950"><p className="text-sm text-gray-400">Deal nicht gefunden</p></div>;
  }

  const contact = deal.contact_id ? contacts.find((c) => c.id === deal.contact_id) : undefined;
  const showLostSection = deal.deal_status === "won" || deal.deal_status === "lost";

  const inputCls = "w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30";
  const labelCls = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5";

  return (
    <div className="min-h-screen px-6 py-8 max-w-5xl mx-auto bg-slate-50 dark:bg-gray-950">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-6">
        <Link href="/deals" className="hover:text-gray-600 dark:hover:text-gray-300">Deals</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300 truncate">{deal.title ?? "Ohne Titel"}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex-1 min-w-0">
          {editing && form ? (
            <div className="space-y-2">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Titel"
                className="w-full text-xl font-bold rounded-lg border border-gray-200 bg-white px-3 py-1.5 dark:bg-gray-800 dark:border-gray-700 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Beschreibung (optional)"
                rows={2}
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {deal.title ?? <span className="italic text-gray-400">Ohne Titel</span>}
                </h1>
                {deal.priority && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[deal.priority] ?? ""}`}>
                    {PRIORITY_LABELS[deal.priority] ?? deal.priority}
                  </span>
                )}
              </div>
              {deal.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{deal.description}</p>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!editing ? (
            <>
              <button
                onClick={startEdit}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              >
                <Pencil className="w-4 h-4" /> Bearbeiten
              </button>
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" /> Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Speichern
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <div className="mb-6 p-4 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pipeline-Status</h3>
          {statusSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </div>
        <div className="flex flex-wrap gap-2">
          {DEAL_STATUSES.map((s) => {
            const isActive = editing ? form?.deal_status === s : deal.deal_status === s;
            return (
              <button
                key={s}
                onClick={() => {
                  if (editing && form) setForm({ ...form, deal_status: s });
                  else handleStatusChange(s);
                }}
                disabled={statusSaving}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all
                  ${isActive
                    ? `${DEAL_STATUS_COLORS[s]} ring-2 ring-offset-1 ring-current`
                    : "bg-gray-50 text-gray-400 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700"
                  } disabled:cursor-default`}
              >
                {DEAL_STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Beziehungen */}
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Beziehungen</h3>
          {!editing ? (
            <>
              {contact ? (
                <Link
                  href={`/kontakte/${contact.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <PersonAvatar firstName={contact.first_name} lastName={contact.last_name} companyName={contact.company_name} />
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{contactDisplayName(contact)}</p>
                </Link>
              ) : (
                <p className="text-sm text-gray-400">Kein Kontakt</p>
              )}
              <Row label="Verantwortlicher" value={team.find((m) => m.id === deal.owner_id)?.name ?? "–"} />
            </>
          ) : form && (
            <>
              <div>
                <label className={labelCls}>Hauptkontakt</label>
                <Combobox
                  value={form.contact_id}
                  onChange={(v) => setForm({ ...form, contact_id: v })}
                  options={contacts.map((c) => ({ value: c.id, label: contactDisplayName(c) }))}
                  placeholder="Kontakt suchen…"
                />
              </div>
              <div>
                <label className={labelCls}>Verantwortlicher</label>
                <Combobox
                  value={form.owner_id}
                  onChange={(v) => setForm({ ...form, owner_id: v })}
                  options={team.map((m) => ({ value: m.id, label: m.name }))}
                  placeholder="Teammitglied suchen…"
                />
              </div>
            </>
          )}
        </div>

        {/* Wert & Zeit */}
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Wert & Zeit</h3>
          {!editing ? (
            <div className="space-y-3">
              <Row label="Betrag" value={deal.amount != null ? fmt(deal.amount, deal.currency ?? "EUR") : "–"} />
              <Row label="Wahrscheinlichkeit" value={deal.probability != null ? `${deal.probability} %` : "–"} />
              {deal.amount != null && deal.probability != null && (
                <Row label="Gewichteter Wert" value={fmt(deal.amount * deal.probability / 100, deal.currency ?? "EUR")} />
              )}
              <Row label="Erw. Abschluss" value={fmtDate(deal.expected_close_date)} />
              <Row label="Tats. Abschluss" value={fmtDate(deal.actual_close_date)} />
            </div>
          ) : form && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className={labelCls}>Betrag</label>
                  <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Währung</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputCls}>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="CHF">CHF</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Wahrscheinlichkeit (%)</label>
                <input type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Erwarteter Abschluss</label>
                <input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tatsächlicher Abschluss</label>
                <input type="date" value={form.actual_close_date} onChange={(e) => setForm({ ...form, actual_close_date: e.target.value })} className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {/* Source & Aktivität */}
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Source & Aktivität</h3>
          {!editing ? (
            <div className="space-y-3">
              <Row label="Quelle" value={deal.source ? (SOURCE_LABELS[deal.source] ?? deal.source) : "–"} />
              <Row label="Kampagne" value={deal.source_campaign ?? "–"} />
              <Row label="Priorität" value={deal.priority ? (PRIORITY_LABELS[deal.priority] ?? deal.priority) : "–"} />
              <Row label="Letzte Aktivität" value={fmtDate(deal.last_activity_at)} />
              <Row label="Nächste Aktivität" value={fmtDate(deal.next_activity_at)} />
              <Row label="Forecast" value={deal.forecast_category ? (FORECAST_LABELS[deal.forecast_category] ?? deal.forecast_category) : "–"} />
            </div>
          ) : form && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Quelle</label>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputCls}>
                  <option value="">–</option>
                  <option value="website">Website</option>
                  <option value="referral">Empfehlung</option>
                  <option value="cold_outreach">Cold Outreach</option>
                  <option value="inbound_call">Eingehender Anruf</option>
                  <option value="event">Veranstaltung</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Kampagne</label>
                <input value={form.source_campaign} onChange={(e) => setForm({ ...form, source_campaign: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Priorität</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputCls}>
                  <option value="">–</option>
                  <option value="low">Niedrig</option>
                  <option value="medium">Mittel</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Letzte Aktivität</label>
                <input type="date" value={form.last_activity_at} onChange={(e) => setForm({ ...form, last_activity_at: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Nächste Aktivität</label>
                <input type="date" value={form.next_activity_at} onChange={(e) => setForm({ ...form, next_activity_at: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Forecast-Kategorie</label>
                <select value={form.forecast_category} onChange={(e) => setForm({ ...form, forecast_category: e.target.value })} className={inputCls}>
                  <option value="">–</option>
                  <option value="pipeline">Pipeline</option>
                  <option value="best_case">Best Case</option>
                  <option value="commit">Commit</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lost/Won Analyse */}
      {(showLostSection || (editing && (form?.deal_status === "won" || form?.deal_status === "lost"))) && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">Abschluss-Analyse</h3>
          {!editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Row label="Verlustgrund" value={deal.lost_reason ? (LOST_REASON_LABELS[deal.lost_reason] ?? deal.lost_reason) : "–"} />
              <Row label="Gewonnen von" value={deal.lost_to_competitor ?? "–"} />
              <Row label="Notizen" value={deal.lost_notes ?? "–"} />
            </div>
          ) : form && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Verlustgrund</label>
                <select value={form.lost_reason} onChange={(e) => setForm({ ...form, lost_reason: e.target.value })} className={inputCls}>
                  <option value="">–</option>
                  <option value="price">Preis</option>
                  <option value="competitor">Wettbewerber</option>
                  <option value="timing">Timing</option>
                  <option value="no_decision">Keine Entscheidung</option>
                  <option value="other">Sonstiges</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Gewonnen von (Wettbewerber)</label>
                <input value={form.lost_to_competitor} onChange={(e) => setForm({ ...form, lost_to_competitor: e.target.value })} placeholder="Wettbewerber" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Verlust-Notizen</label>
                <input value={form.lost_notes} onChange={(e) => setForm({ ...form, lost_notes: e.target.value })} className={inputCls} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Beschreibung (nur in View-Modus, da im Edit-Modus oben im Header) */}
      {!editing && deal.description && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Beschreibung</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{deal.description}</p>
        </div>
      )}

      {/* Notizen */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Notizen</h3>
        {!editing ? (
          deal.notes
            ? <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{deal.notes}</p>
            : <p className="text-sm text-gray-400">Keine Notizen</p>
        ) : form && (
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={4}
            className={inputCls}
            placeholder="Notizen zum Deal…"
          />
        )}
      </div>

      {/* Dokumente */}
      <div className="mt-6">
        <ContractDocuments contractId={deal.id} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-xs text-gray-400 flex-shrink-0 w-32">{label}</span>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{value}</span>
    </div>
  );
}
