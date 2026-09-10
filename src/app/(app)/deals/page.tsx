"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handshake, Loader2, Search, SlidersHorizontal, X, Plus, List, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { contactDisplayName, type DealStatus } from "@/types/crm";
import Combobox from "@/components/Combobox";
import Checkbox from "@/components/Checkbox";
import { fetchAllContacts } from "@/lib/fetch-all-contacts";

type DealRow = {
  id: string;
  title: string | null;
  deal_status: DealStatus;
  priority: string | null;
  amount: number | null;
  currency: string | null;
  probability: number | null;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  contact_id: string | null;
  owner_id: string | null;
};

type ContactOption = {
  id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  lead: "Lead / Neu",
  contacted: "Kontaktiert",
  on_hold: "On Hold / Nurturing",
  qualified: "Qualifiziert",
  disqualified: "Disqualifiziert",
  demo: "Demo / Pilot",
  proposal: "Angebot erstellt",
  negotiation: "Verhandlung",
  won: "Gewonnen",
  lost: "Verloren",
};

export const DEAL_STATUS_COLORS: Record<DealStatus, string> = {
  lead: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  contacted: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  on_hold: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  qualified: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  disqualified: "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400",
  demo: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  proposal: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  negotiation: "bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400",
  won: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  lost: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
};

const DEAL_STATUS_BORDER: Record<DealStatus, string> = {
  lead: "border-t-gray-300 dark:border-t-gray-600",
  contacted: "border-t-blue-400 dark:border-t-blue-500",
  on_hold: "border-t-amber-400 dark:border-t-amber-500",
  qualified: "border-t-violet-400 dark:border-t-violet-500",
  disqualified: "border-t-red-300 dark:border-t-red-400",
  demo: "border-t-purple-400 dark:border-t-purple-500",
  proposal: "border-t-orange-400 dark:border-t-orange-500",
  negotiation: "border-t-yellow-400 dark:border-t-yellow-500",
  won: "border-t-emerald-400 dark:border-t-emerald-500",
  lost: "border-t-red-500 dark:border-t-red-500",
};

const ORDERED_STATUSES: DealStatus[] = [
  "lead", "contacted", "on_hold", "qualified", "disqualified",
  "demo", "proposal", "negotiation", "won", "lost",
];

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Dringend", high: "Hoch", medium: "Mittel", low: "Niedrig",
};
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  high: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  medium: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  low: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};
const SOURCE_LABELS: Record<string, string> = {
  website: "Website", referral: "Empfehlung", cold_outreach: "Cold Outreach",
  inbound_call: "Eingehender Anruf", event: "Veranstaltung",
};

function fmt(amount: number | null, currency = "EUR"): string {
  if (amount == null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(amount);
}

// ─── Kanban card ──────────────────────────────────────────────

function DealCard({ deal, contact, onDragStart, isDragging }: {
  deal: DealRow; contact: ContactOption | undefined; onDragStart: (id: string) => void; isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(deal.id); }}
      className={`rounded-lg border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700
        p-3 cursor-grab active:cursor-grabbing select-none transition-all
        hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600
        ${isDragging ? "opacity-40 rotate-1 shadow-lg" : "opacity-100"}`}
    >
      <Link href={`/deals/${deal.id}`} className="block" onClick={(e) => e.stopPropagation()} draggable={false}>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight mb-1 truncate">
          {deal.title ?? <span className="italic text-gray-400">Ohne Titel</span>}
        </p>
        {contact && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">
            {contactDisplayName(contact)}
          </p>
        )}
        <div className="flex items-center justify-between mt-2">
          {deal.amount != null && (
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {fmt(deal.amount, deal.currency ?? "EUR")}
            </span>
          )}
          {deal.probability != null && (
            <span className="text-xs text-gray-400">{deal.probability} %</span>
          )}
        </div>
        {deal.expected_close_date && (
          <p className="text-xs text-gray-400 mt-1">
            {new Date(deal.expected_close_date).toLocaleDateString("de-DE")}
          </p>
        )}
      </Link>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────

function KanbanColumn({ status, deals, contactsById, draggedId, onDragStart, onDrop }: {
  status: DealStatus; deals: DealRow[]; contactsById: Map<string, ContactOption>; draggedId: string | null;
  onDragStart: (id: string) => void; onDrop: (status: DealStatus) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const isDragTarget = isOver && draggedId !== null;
  return (
    <div className="flex flex-col flex-shrink-0 w-56">
      <div className={`rounded-t-xl border-t-2 border-x border-b-0 px-3 py-2.5
        bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 ${DEAL_STATUS_BORDER[status]}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 leading-tight">
            {DEAL_STATUS_LABELS[status]}
          </span>
          {deals.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 leading-none flex-shrink-0">
              {deals.length}
            </span>
          )}
        </div>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsOver(false); onDrop(status); }}
        className={`flex-1 min-h-32 rounded-b-xl border border-t-0 px-2 py-2 space-y-2 transition-colors
          ${isDragTarget
            ? "bg-orange-50 border-orange-300 dark:bg-orange-500/10 dark:border-orange-500/40"
            : "bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700"}`}
      >
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} contact={d.contact_id ? contactsById.get(d.contact_id) : undefined} onDragStart={onDragStart} isDragging={draggedId === d.id} />
        ))}
        {deals.length === 0 && !isDragTarget && (
          <p className="text-xs text-gray-300 dark:text-gray-600 text-center pt-4">–</p>
        )}
        {isDragTarget && (
          <div className="h-8 rounded-lg border-2 border-dashed border-orange-300 dark:border-orange-500/50 flex items-center justify-center">
            <span className="text-xs text-orange-400">Hier ablegen</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────

type TeamMember = { id: string; name: string };

export default function DealListPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const teamById = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);

  const [search, setSearch] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [closeDateFrom, setCloseDateFrom] = useState("");
  const [closeDateTo, setCloseDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const [contacts, setContactsList] = useState<ContactOption[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  useEffect(() => {
    Promise.all([
      fetch("/api/deals").then((r) => (r.ok ? r.json() : [])),
      fetchAllContacts<ContactOption>(),
      fetch("/api/team").then((r) => (r.ok ? r.json() : [])),
    ]).then(([d, c, t]) => { setDeals(d); setContactsList(c as ContactOption[]); setTeam(t); setLoading(false); });
  }, []);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    if (!confirm("Deal wirklich löschen?")) return;
    const res = await fetch(`/api/deals/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDeals((prev) => prev.filter((d) => d.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  async function handleBulkDelete() {
    const count = selected.size;
    if (!confirm(`${count} Deal${count > 1 ? "s" : ""} wirklich löschen?`)) return;
    setBulkDeleting(true);
    const res = await fetch("/api/deals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    if (res.ok) {
      setDeals((prev) => prev.filter((d) => !selected.has(d.id)));
      setSelected(new Set());
    }
    setBulkDeleting(false);
  }

  useEffect(() => {
    const saved = localStorage.getItem("deals-view");
    if (saved === "kanban" || saved === "table") setView(saved);
  }, []);

  function switchView(v: "table" | "kanban") {
    setView(v);
    setSelected(new Set());
    localStorage.setItem("deals-view", v);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minAmt = minAmount ? parseFloat(minAmount) : null;
    const maxAmt = maxAmount ? parseFloat(maxAmount) : null;
    const fromDate = closeDateFrom ? new Date(closeDateFrom) : null;
    const toDate = closeDateTo ? new Date(closeDateTo + "T23:59:59") : null;

    return deals.filter((d) => {
      if (statusFilter && d.deal_status !== statusFilter) return false;
      if (priorityFilter && d.priority !== priorityFilter) return false;
      if (sourceFilter && d.source !== sourceFilter) return false;
      if (contactFilter && d.contact_id !== contactFilter) return false;
      if (fromDate && d.expected_close_date && new Date(d.expected_close_date) < fromDate) return false;
      if (toDate && d.expected_close_date && new Date(d.expected_close_date) > toDate) return false;
      if (minAmt != null && (d.amount ?? -Infinity) < minAmt) return false;
      if (maxAmt != null && (d.amount ?? Infinity) > maxAmt) return false;
      if (q) {
        const contact = d.contact_id ? contactsById.get(d.contact_id) : undefined;
        const haystack = [
          d.title, d.notes,
          d.source ? SOURCE_LABELS[d.source] : null,
          DEAL_STATUS_LABELS[d.deal_status],
          contact ? contactDisplayName(contact) : null,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [deals, contactsById, search, statusFilter, priorityFilter, sourceFilter, contactFilter, closeDateFrom, closeDateTo, minAmount, maxAmount]);

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0 && selected.size < filtered.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((d) => d.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const byStatus = useMemo(() => {
    const map: Record<DealStatus, DealRow[]> = {} as Record<DealStatus, DealRow[]>;
    for (const s of ORDERED_STATUSES) map[s] = [];
    for (const d of filtered) { if (map[d.deal_status]) map[d.deal_status].push(d); }
    return map;
  }, [filtered]);

  function handleDragStart(id: string) { setDraggedId(id); draggedIdRef.current = id; }

  function handleDrop(targetStatus: DealStatus) {
    const id = draggedIdRef.current;
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.deal_status === targetStatus) { setDraggedId(null); draggedIdRef.current = null; return; }
    setDeals((prev) => prev.map((d) => d.id === id ? { ...d, deal_status: targetStatus } : d));
    setDraggedId(null); draggedIdRef.current = null;
    fetch(`/api/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_status: targetStatus }),
    });
  }

  const activeFilterCount = [statusFilter, priorityFilter, sourceFilter, contactFilter, closeDateFrom, closeDateTo, minAmount, maxAmount].filter(Boolean).length;

  function resetAll() {
    setSearch(""); setStatusFilter(""); setPriorityFilter(""); setSourceFilter("");
    setContactFilter(""); setCloseDateFrom(""); setCloseDateTo(""); setMinAmount(""); setMaxAmount("");
  }

  const inputCls = "w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30";
  const labelCls = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950" onDragEnd={() => { setDraggedId(null); draggedIdRef.current = null; }}>
      <div className="px-6 pt-8 pb-0 max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Deals</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1 gap-0.5">
              <button onClick={() => switchView("table")} title="Tabellenansicht" className={`p-2 rounded-lg transition-colors ${view === "table" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => switchView("kanban")} title="Kanban-Ansicht" className={`p-2 rounded-lg transition-colors ${view === "kanban" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            {selected.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {selected.size} Deal{selected.size > 1 ? "s" : ""} löschen
              </button>
            )}
            <Link href="/deals/neu" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
              <Plus className="w-4 h-4" /> Neuer Deal
            </Link>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche nach Titel, Kontakt, Status, Notiz…"
              className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setAdvancedOpen((o) => !o)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors whitespace-nowrap
              ${advancedOpen
                ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-500/10 dark:text-orange-400"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500 text-white leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
          {(search || activeFilterCount > 0) && (
            <button onClick={resetAll} className="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap">
              Zurücksetzen
            </button>
          )}
        </div>

        {advancedOpen && (
          <div className="mb-6 p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {view === "table" && (
                <div>
                  <label className={labelCls}>Deal-Status</label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
                    <option value="">Alle Status</option>
                    {ORDERED_STATUSES.map((s) => <option key={s} value={s}>{DEAL_STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Priorität</label>
                <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={inputCls}>
                  <option value="">Alle</option>
                  <option value="urgent">Dringend</option>
                  <option value="high">Hoch</option>
                  <option value="medium">Mittel</option>
                  <option value="low">Niedrig</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Quelle</label>
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={inputCls}>
                  <option value="">Alle</option>
                  {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Kontakt</label>
                <Combobox value={contactFilter} onChange={setContactFilter} options={contacts.map((c) => ({ value: c.id, label: contactDisplayName(c) }))} placeholder="Alle Kontakte" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Abschluss von</label>
                  <input type="date" value={closeDateFrom} onChange={(e) => setCloseDateFrom(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>bis</label>
                  <input type="date" value={closeDateTo} onChange={(e) => setCloseDateTo(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Betrag ab (€)</label>
                  <input type="number" step="0.01" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>bis (€)</label>
                  <input type="number" step="0.01" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : view === "table" ? (
        <div className="px-6 pb-8 max-w-[1600px] mx-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <Handshake className="w-12 h-12 mb-3" />
              <p className="text-sm">{search || activeFilterCount > 0 ? "Keine Treffer" : "Keine Deals gefunden"}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                    <th className="w-10 px-4 py-3">
                      <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />
                    </th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400">Status</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400">Titel</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden md:table-cell">Kontakt</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden lg:table-cell">Betrag</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden lg:table-cell">Wahrsch.</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden sm:table-cell">Abschluss</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden md:table-cell">Priorität</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden lg:table-cell">Verantwortlich</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const contact = d.contact_id ? contactsById.get(d.contact_id) : undefined;
                    const isChecked = selected.has(d.id);
                    return (
                      <tr key={d.id} className={`group border-b border-gray-50 dark:border-gray-800/50 transition-colors ${isChecked ? "bg-orange-50/60 dark:bg-orange-500/5" : "hover:bg-gray-50/50 dark:hover:bg-gray-800/20"}`}>
                        <td className="w-10 px-4 py-2.5">
                          <Checkbox checked={isChecked} onChange={() => toggleOne(d.id)} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${DEAL_STATUS_COLORS[d.deal_status]}`}>
                            {DEAL_STATUS_LABELS[d.deal_status]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/deals/${d.id}`} className="font-medium text-gray-800 dark:text-gray-200 hover:text-orange-600 dark:hover:text-orange-400">
                            {d.title ?? <span className="text-gray-400 italic">Ohne Titel</span>}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                          {contact
                            ? <Link href={`/kontakte/${contact.id}`} className="hover:text-orange-600 dark:hover:text-orange-400">{contactDisplayName(contact)}</Link>
                            : "–"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                          {d.amount != null ? fmt(d.amount, d.currency ?? "EUR") : "–"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                          {d.probability != null ? `${d.probability} %` : "–"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                          {d.expected_close_date ? new Date(d.expected_close_date).toLocaleDateString("de-DE") : "–"}
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          {d.priority
                            ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[d.priority] ?? ""}`}>{PRIORITY_LABELS[d.priority] ?? d.priority}</span>
                            : "–"}
                        </td>
                        <td className="px-4 py-2.5 hidden lg:table-cell">
                          {d.owner_id && teamById.get(d.owner_id) ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                                  {teamById.get(d.owner_id)!.name.slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[130px]">
                                {teamById.get(d.owner_id)!.name}
                              </span>
                            </div>
                          ) : "–"}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.preventDefault(); router.push(`/deals/${d.id}`); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
                              title="Bearbeiten"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(e, d.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                              title="Löschen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="px-6 pb-8 overflow-x-auto">
          <div className="flex gap-3 min-w-max pt-1">
            {ORDERED_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                deals={byStatus[status]}
                contactsById={contactsById}
                draggedId={draggedId}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
