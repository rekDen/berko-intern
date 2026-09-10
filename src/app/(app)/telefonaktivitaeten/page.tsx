"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import CallButton from "@/components/CallButton";
import {
  Phone, Loader2, Save, ExternalLink, SlidersHorizontal, X, Trash2,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Building2, User, UserRound, CalendarPlus, CalendarClock, Calendar,
  Timer, UserCheck, ShieldCheck, Activity, Target, CornerDownRight,
  Smile, PhoneCall, FileText, type LucideIcon,
} from "lucide-react";
import Combobox from "@/components/Combobox";
import DeadlineDialog, { type DeadlineFormState } from "@/components/crm/DeadlineDialog";

type PhoneEntry = { type: string; value: string };

type ContactPerson = {
  first_name: string;
  last_name: string;
  position: string | null;
};

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  type: string;
  contact_persons: ContactPerson[];
  created_at: string | null;
  phones: PhoneEntry[];
};

type ContactRaw = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  type: string;
  created_at: string;
  phones: PhoneEntry[];
  owner_id: string | null;
};

type PhoneRow = {
  id: string;
  occurred_at: string;
  created_by: string;
  body: string | null;
  duration_seconds: number | null;
  gatekeeper_bypassed: string | null;
  call_status: string | null;
  call_result: string | null;
  follow_up: string | null;
  sentiment: string | null;
  contact_person: string | null;
  contact_id: string | null;
  contacts: Contact | null;
};

type ListRow = {
  id: string;
  hasBeenCalled: boolean;
  contact_id: string | null;
  contacts: Contact | null;
  occurred_at: string | null;
  created_by: string;
  body: string | null;
  duration_seconds: number | null;
  gatekeeper_bypassed: string | null;
  call_status: string | null;
  call_result: string | null;
  follow_up: string | null;
  sentiment: string | null;
  contact_person: string | null;
};

type TeamMember = { id: string; name: string };

type RowChanges = {
  gatekeeper_bypassed?: string | null;
  call_status?: string | null;
  call_result?: string | null;
  follow_up?: string | null;
  sentiment?: string | null;
  contact_person?: string | null;
  body?: string | null;
};

const ANGERUFEN_OPTIONS = [
  { value: "ja", label: "Ja" },
  { value: "nein", label: "Nein" },
];

const GATEKEEPER_OPTIONS = [
  { value: "ja", label: "Ja" },
  { value: "nein", label: "Nein" },
];

const STATUS_OPTIONS = [
  { value: "Erreicht", label: "Erreicht" },
  { value: "Nicht erreicht", label: "Nicht erreicht" },
  { value: "Falsche Nummer", label: "Falsche Nummer" },
  { value: "Anschluss existiert nicht", label: "Anschluss existiert nicht" },
  { value: "Besetzt", label: "Besetzt" },
  { value: "Rückruf erbeten", label: "Rückruf erbeten" },
  { value: "Nicht interessiert", label: "Nicht interessiert" },
];

const RESULT_OPTIONS = [
  { value: "Information weitergegeben", label: "Information weitergegeben" },
  { value: "Information erhalten", label: "Information erhalten" },
  { value: "Termin vereinbart", label: "Termin vereinbart" },
  { value: "Termin verschoben / abgesagt", label: "Termin verschoben / abgesagt" },
  { value: "Angebot besprochen", label: "Angebot besprochen" },
  { value: "Angebot angenommen", label: "Angebot angenommen" },
  { value: "Angebot abgelehnt", label: "Angebot abgelehnt" },
  { value: "Auftrag erteilt", label: "Auftrag erteilt" },
  { value: "Vertrag abgeschlossen", label: "Vertrag abgeschlossen" },
  { value: "Reklamation / Beschwerde aufgenommen", label: "Reklamation / Beschwerde aufgenommen" },
  { value: "Mahnung / Zahlungserinnerung ausgesprochen", label: "Mahnung / Zahlungserinnerung ausgesprochen" },
  { value: "Zahlung zugesagt", label: "Zahlung zugesagt" },
  { value: "Klärungsbedarf — Rücksprache nötig", label: "Klärungsbedarf — Rücksprache nötig" },
];

const FOLLOWUP_OPTIONS = [
  { value: "Abgeschlossen", label: "Abgeschlossen" },
  { value: "Rückruf nötig", label: "Rückruf nötig" },
  { value: "E-Mail/Dokument senden", label: "E-Mail/Dokument senden" },
  { value: "Unterlagen anfordern", label: "Unterlagen anfordern" },
  { value: "Intern weiterleiten / Eskalation", label: "Intern weiterleiten / Eskalation" },
  { value: "Wiedervorlage", label: "Wiedervorlage" },
];

const SENTIMENT_OPTIONS = [
  { value: "Positiv / Interesse signalisiert", label: "Positiv / Interesse signalisiert" },
  { value: "Neutral", label: "Neutral" },
  { value: "Negativ / Ablehnung", label: "Negativ / Ablehnung" },
  { value: "Eskalation / Konflikt", label: "Eskalation / Konflikt" },
];

const DAUER_OPTIONS = [
  { value: "none", label: "Kein Gespräch" },
  { value: "short", label: "< 1 Min" },
  { value: "medium", label: "1–5 Min" },
  { value: "long", label: "> 5 Min" },
];

type SortCol = "kontakt" | "ansprechpartner" | "hinzugefuegt" | "datum" | "dauer" | "verantwortlich" | "gatekeeper" | "status" | "ergebnis" | "followup" | "stimmung" | "notiz";

const COLUMNS: { key: SortCol; label: string; icon: LucideIcon }[] = [
  { key: "kontakt",        label: "Kontakt",           icon: User },
  { key: "ansprechpartner",label: "Ansprechpartner",   icon: UserRound },
  { key: "hinzugefuegt",   label: "Hinzugefügt am",    icon: CalendarPlus },
  { key: "datum",          label: "Zuletzt angerufen", icon: CalendarClock },
  { key: "dauer",          label: "Dauer",             icon: Timer },
  { key: "verantwortlich", label: "Verantwortlich",    icon: UserCheck },
  { key: "gatekeeper",     label: "Assistent vorbei?", icon: ShieldCheck },
  { key: "status",         label: "Status",            icon: Activity },
  { key: "ergebnis",       label: "Ergebnis",          icon: Target },
  { key: "followup",       label: "Follow-Up",         icon: CornerDownRight },
  { key: "stimmung",       label: "Stimmung",          icon: Smile },
  { key: "notiz",          label: "Notiz",             icon: FileText },
];

function getPrimaryPhone(phones: PhoneEntry[] | null | undefined): string | null {
  if (!phones?.length) return null;
  return (
    phones.find(p => p.type === "mobile")?.value ??
    phones.find(p => p.type === "landline")?.value ??
    phones.find(p => p.type !== "fax")?.value ??
    null
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const tz = "Europe/Berlin";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz }) +
    " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin",
  });
}


function rowKontaktName(c: Contact | null): string {
  if (!c) return "";
  if (c.type === "legal_entity") return c.company_name ?? "";
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}

export default function TelefonaktivitaetenPage() {
  const [rows, setRows] = useState<PhoneRow[]>([]);
  const [allContacts, setAllContacts] = useState<ContactRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [changes, setChanges] = useState<Record<string, RowChanges>>({});
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showDeadlineDialog, setShowDeadlineDialog] = useState(false);

  // Filter state
  const [filterFirma, setFilterFirma] = useState("");
  const [filterKontakt, setFilterKontakt] = useState("");
  const [filterDatum, setFilterDatum] = useState("");
  const [filterDauer, setFilterDauer] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterGatekeeper, setFilterGatekeeper] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterResult, setFilterResult] = useState("");
  const [filterFollowUp, setFilterFollowUp] = useState("");
  const [filterSentiment, setFilterSentiment] = useState("");
  const [filterAngerufen, setFilterAngerufen] = useState("");

  // Sort state – default: Hinzugefügt am descending
  const [sortCol, setSortCol] = useState<SortCol>("hinzugefuegt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [liveConnected, setLiveConnected] = useState(false);

  const reloadCommunications = useCallback(async () => {
    const comms = await fetch("/api/communications?channel=phone").then(r => r.ok ? r.json() : []);
    setRows(comms);
  }, []);

  const reloadContacts = useCallback(async () => {
    const contacts = await fetch("/api/contacts?limit=500").then(r => r.ok ? r.json() : []);
    setAllContacts(contacts);
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([
      fetch("/api/communications?channel=phone").then(r => r.ok ? r.json() : []),
      fetch("/api/team").then(r => r.ok ? r.json() : []),
      fetch("/api/profile").then(r => r.ok ? r.json() : null),
      fetch("/api/contacts?limit=500").then(r => r.ok ? r.json() : []),
    ]).then(([comms, members, profile, contacts]) => {
      const userId = (profile as { id?: string } | null)?.id ?? null;
      setRows(comms);
      setTeam(members);
      setCurrentUserId(userId);
      setAllContacts(contacts);
      if (userId) setFilterOwner(userId);
      setLoading(false);
    });
  }, []);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("anrufliste-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "communications" }, reloadCommunications)
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, reloadContacts)
      .subscribe((status: string) => {
        setLiveConnected(status === "SUBSCRIBED");
      });
    return () => { supabase.removeChannel(channel); };
  }, [reloadCommunications, reloadContacts]);

  const teamMap = useMemo(() => Object.fromEntries(team.map(m => [m.id, m.name])), [team]);
  const teamOptions = useMemo(() => team.map(m => ({ value: m.id, label: m.name })), [team]);

  // Merge called rows + never-called contacts into a unified list
  const allRows = useMemo<ListRow[]>(() => {
    const calledIds = new Set(rows.map(r => r.contact_id).filter(Boolean));
    const calledRows: ListRow[] = rows.map(r => ({ ...r, hasBeenCalled: true }));
    const neverCalledRows: ListRow[] = allContacts
      .filter(c => !calledIds.has(c.id))
      .map(c => ({
        id: "nc_" + c.id,
        hasBeenCalled: false,
        contact_id: c.id,
        contacts: { id: c.id, first_name: c.first_name, last_name: c.last_name, company_name: c.company_name, type: c.type, contact_persons: [], created_at: c.created_at, phones: c.phones ?? [] },
        occurred_at: null,
        created_by: c.owner_id ?? "",
        body: null,
        duration_seconds: null,
        gatekeeper_bypassed: null,
        call_status: null,
        call_result: null,
        follow_up: null,
        sentiment: null,
        contact_person: null,
      }));
    return [...calledRows, ...neverCalledRows];
  }, [rows, allContacts]);

  // Derived filter options from all rows
  const firmaOptions = useMemo(() =>
    [...new Set(allRows.map(r => r.contacts?.company_name).filter((v): v is string => Boolean(v)))]
      .sort()
      .map(v => ({ value: v, label: v })),
    [allRows]
  );

  const kontaktOptions = useMemo(() =>
    [...new Set(allRows.map(r => rowKontaktName(r.contacts)).filter(Boolean))]
      .sort()
      .map(v => ({ value: v, label: v })),
    [allRows]
  );

  const datumOptions = useMemo(() =>
    [...new Set(rows.map(r => formatDate(r.occurred_at)))]
      .sort((a, b) => {
        const parse = (s: string) => {
          const [d, m, y] = s.split(".");
          return new Date(`${y}-${m}-${d}`).getTime();
        };
        return parse(b) - parse(a);
      })
      .map(v => ({ value: v, label: v })),
    [rows]
  );

  // Filtered rows
  const filteredRows = useMemo(() => allRows.filter(row => {
    // Angerufen filter
    if (filterAngerufen === "ja" && !row.hasBeenCalled) return false;
    if (filterAngerufen === "nein" && row.hasBeenCalled) return false;

    const c = row.contacts;
    if (filterFirma && (c?.company_name ?? "") !== filterFirma) return false;
    if (filterKontakt && rowKontaktName(c) !== filterKontakt) return false;

    // Call-specific filters: never-called rows are excluded when these are active
    const callFilterActive = filterDatum || filterDauer || filterGatekeeper || filterStatus || filterResult || filterFollowUp || filterSentiment;
    if (!row.hasBeenCalled && callFilterActive) return false;

    if (filterDatum && (row.occurred_at ? formatDate(row.occurred_at) : "") !== filterDatum) return false;
    if (filterDauer) {
      const secs = row.duration_seconds;
      if (filterDauer === "none" && secs != null && secs > 0) return false;
      if (filterDauer === "short" && (secs == null || secs === 0 || secs >= 60)) return false;
      if (filterDauer === "medium" && (secs == null || secs < 60 || secs >= 300)) return false;
      if (filterDauer === "long" && (secs == null || secs < 300)) return false;
    }
    // Owner filter only applies to called rows
    if (filterOwner && row.created_by !== filterOwner) return false;
    if (filterGatekeeper && row.gatekeeper_bypassed !== filterGatekeeper) return false;
    if (filterStatus && row.call_status !== filterStatus) return false;
    if (filterResult && row.call_result !== filterResult) return false;
    if (filterFollowUp && row.follow_up !== filterFollowUp) return false;
    if (filterSentiment && row.sentiment !== filterSentiment) return false;
    return true;
  }), [allRows, filterFirma, filterKontakt, filterDatum, filterDauer, filterOwner, filterGatekeeper, filterStatus, filterResult, filterFollowUp, filterSentiment, filterAngerufen]);

  const hasActiveFilters = !!(filterFirma || filterKontakt || filterDatum || filterDauer || filterOwner ||
    filterGatekeeper || filterStatus || filterResult || filterFollowUp || filterSentiment || filterAngerufen);

  // Sorted rows
  const sortedRows = useMemo(() => {
    const getValue = (row: ListRow): string | number | null => {
      switch (sortCol) {
        case "kontakt":         return rowKontaktName(row.contacts);
        case "ansprechpartner": return row.contact_person;
        case "hinzugefuegt":    return row.contacts?.created_at ?? null;
        case "datum":           return row.occurred_at;
        case "dauer":           return row.duration_seconds;
        case "verantwortlich":  return teamMap[row.created_by] ?? null;
        case "gatekeeper":      return row.gatekeeper_bypassed;
        case "status":          return row.call_status;
        case "ergebnis":        return row.call_result;
        case "followup":        return row.follow_up;
        case "stimmung":        return row.sentiment;
        case "notiz":           return row.body;
      }
    };
    return [...filteredRows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;   // nulls always last
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortCol, sortDir, teamMap]);

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  function clearFilters() {
    setFilterFirma("");
    setFilterKontakt("");
    setFilterDatum("");
    setFilterDauer("");
    setFilterOwner("");
    setFilterGatekeeper("");
    setFilterStatus("");
    setFilterResult("");
    setFilterFollowUp("");
    setFilterSentiment("");
    setFilterAngerufen("");
  }

  function setField(id: string, field: keyof RowChanges, value: string | null, createdBy: string) {
    if (currentUserId && createdBy !== currentUserId) return;
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setChanges(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setSavedCount(null);
  }

  const handleSave = useCallback(async () => {
    const dirty = Object.entries(changes);
    if (!dirty.length) return;
    setSaving(true);
    let saved = 0;
    let created = 0;
    await Promise.all(
      dirty.map(async ([id, patch]) => {
        if (id.startsWith("nc_")) {
          // "Noch nicht angerufen"-Zeilen sind synthetisch und haben keine echte
          // communications-ID. Statt zu patchen (→ 403) legen wir eine neue
          // Telefon-Kommunikation an, damit der Eintrag als Telefonnotiz im
          // Kontakt erscheint und Anrufliste ↔ Kontakt synchron bleiben.
          const res = await fetch("/api/communications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contact_id: id.slice(3),
              channel: "phone",
              occurred_at: new Date().toISOString(),
              ...patch,
            }),
          });
          if (res.ok) { saved++; created++; }
        } else {
          const res = await fetch(`/api/communications/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (res.ok) saved++;
        }
      })
    );
    setChanges({});
    // Neu anlegte Einträge ersetzen ihre synthetische Platzhalter-Zeile erst
    // nach einem Reload durch die echte communications-Zeile.
    if (created > 0) await reloadCommunications();
    setSaving(false);
    setSavedCount(saved);
  }, [changes, reloadCommunications]);

  async function handleSaveDeadline(form: DeadlineFormState) {
    const res = await fetch("/api/deadlines", {
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
    setShowDeadlineDialog(false);
    if (data?.invites_sent > 0) {
      alert(`Eintrag gespeichert. ${data.invites_sent} Einladung(en) versendet.`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Telefonat-Eintrag wirklich löschen?")) return;
    const res = await fetch(`/api/communications/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows(prev => prev.filter(r => r.id !== id));
      setChanges(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  }

  const dirtyCount = Object.keys(changes).length;

  const labelCls = "flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mb-1";

  const SaveBar = (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {dirtyCount > 0
          ? `${dirtyCount} Zeile${dirtyCount > 1 ? "n" : ""} mit ungespeicherten Änderungen`
          : savedCount !== null
          ? `${savedCount} Zeile${savedCount !== 1 ? "n" : ""} gespeichert`
          : null}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowDeadlineDialog(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
            border border-gray-200 text-gray-600 hover:bg-gray-50
            dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
        >
          <CalendarPlus className="w-4 h-4" />
          Termin/Frist hinzufügen
        </button>
        <button
          onClick={handleSave}
          disabled={saving || dirtyCount === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
            bg-orange-500 text-white hover:bg-orange-600 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Speichern
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen px-6 py-8 max-w-[1600px] mx-auto bg-slate-50 dark:bg-gray-950">
      <div className="flex items-center gap-3 mb-6">
        <Phone className="w-6 h-6 text-orange-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Anrufliste</h1>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
          liveConnected
            ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${liveConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
          {liveConnected ? "Live" : "Verbinde…"}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Filter bar */}
          <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filter
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:underline"
                >
                  <X className="w-3 h-3" />
                  Zurücksetzen
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <label className={labelCls}><Building2 className="w-3 h-3" />Firma</label>
                <Combobox value={filterFirma} onChange={setFilterFirma} options={firmaOptions} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><User className="w-3 h-3" />Kontakt</label>
                <Combobox value={filterKontakt} onChange={setFilterKontakt} options={kontaktOptions} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><Calendar className="w-3 h-3" />Datum</label>
                <Combobox value={filterDatum} onChange={setFilterDatum} options={datumOptions} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><Timer className="w-3 h-3" />Dauer</label>
                <Combobox value={filterDauer} onChange={setFilterDauer} options={DAUER_OPTIONS} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><UserCheck className="w-3 h-3" />Verantwortliche Person</label>
                <Combobox value={filterOwner} onChange={setFilterOwner} options={teamOptions} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><ShieldCheck className="w-3 h-3" />Assistent vorbei?</label>
                <Combobox value={filterGatekeeper} onChange={setFilterGatekeeper} options={GATEKEEPER_OPTIONS} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><Activity className="w-3 h-3" />Status</label>
                <Combobox value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><Target className="w-3 h-3" />Ergebnis</label>
                <Combobox value={filterResult} onChange={setFilterResult} options={RESULT_OPTIONS} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><CornerDownRight className="w-3 h-3" />Follow-Up</label>
                <Combobox value={filterFollowUp} onChange={setFilterFollowUp} options={FOLLOWUP_OPTIONS} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><Smile className="w-3 h-3" />Stimmung</label>
                <Combobox value={filterSentiment} onChange={setFilterSentiment} options={SENTIMENT_OPTIONS} placeholder="Alle" allowClear />
              </div>
              <div>
                <label className={labelCls}><PhoneCall className="w-3 h-3" />Angerufen</label>
                <Combobox value={filterAngerufen} onChange={setFilterAngerufen} options={ANGERUFEN_OPTIONS} placeholder="Alle" allowClear />
              </div>
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-500">
              <Phone className="w-12 h-12 mb-3" />
              <p className="text-sm">
                {hasActiveFilters ? "Keine Einträge für diese Filterkriterien" : "Noch keine Einträge vorhanden"}
              </p>
            </div>
          ) : (
            <>
              {SaveBar}

              <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 overflow-x-auto">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                      <th className="px-2 py-3 w-10 min-w-[40px]" />
                      {COLUMNS.map(col => {
                        const active = sortCol === col.key;
                        return (
                          <th key={col.key} className="px-3 py-3 whitespace-nowrap">
                            <button
                              onClick={() => handleSort(col.key)}
                              className={`flex items-center gap-1 font-medium text-xs uppercase tracking-wide transition-colors select-none ${
                                active
                                  ? "text-orange-500 dark:text-orange-400"
                                  : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                              }`}
                            >
                              <col.icon className="w-3.5 h-3.5 flex-shrink-0" />
                              {col.label}
                              {active
                                ? sortDir === "asc"
                                  ? <ChevronUp className="w-3.5 h-3.5" />
                                  : <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                            </button>
                          </th>
                        );
                      })}
                      <th className="px-2 py-3 w-10 min-w-[40px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map(row => {
                      const c = row.contacts;
                      const called = row.hasBeenCalled;
                      const isDirty = called && !!changes[row.id];
                      const isOwn = called && (!currentUserId || row.created_by === currentUserId);
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-50 dark:border-gray-800/50 transition-colors ${
                            !called ? "bg-gray-50/60 dark:bg-gray-800/10" :
                            !isOwn ? "opacity-60" :
                            isDirty ? "bg-orange-50/40 dark:bg-orange-500/5" : "hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
                          }`}
                        >
                          {/* Anruf-Button */}
                          <td className="px-2 py-2.5 w-10 min-w-[40px]">
                            {c && getPrimaryPhone(c.phones) ? (
                              <CallButton
                                phoneNumber={getPrimaryPhone(c.phones)!}
                                contactId={c.id}
                                compact
                              />
                            ) : null}
                          </td>

                          {/* Kontakt */}
                          <td className="px-3 py-2.5 w-[200px] min-w-[200px] max-w-[200px] break-words">
                            {c ? (
                              <Link
                                href={`/kontakte/${c.id}`}
                                className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                              >
                                {c.type === "legal_entity"
                                  ? (c.company_name || "–")
                                  : [c.first_name, c.last_name].filter(Boolean).join(" ") || "–"}
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : (
                              <span className="text-gray-400">–</span>
                            )}
                          </td>

                          {/* Ansprechpartner */}
                          <td className="px-3 py-2.5 w-[200px] min-w-[200px] max-w-[200px] break-words">
                            {called && c?.type === "legal_entity" ? (
                              <Combobox
                                value={row.contact_person ?? ""}
                                onChange={v => setField(row.id, "contact_person", v || null, row.created_by)}
                                options={(c.contact_persons ?? []).map(p => {
                                  const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
                                  return {
                                    value: name,
                                    label: p.position ? `${name} (${p.position})` : name,
                                  };
                                })}
                                placeholder="–"
                                allowClear
                                disabled={!isOwn}
                              />
                            ) : (
                              <span className="text-xs text-gray-400">–</span>
                            )}
                          </td>

                          {/* Hinzugefügt am */}
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {row.contacts?.created_at ? formatDate(row.contacts.created_at) : "–"}
                          </td>

                          {/* Datum & Uhrzeit */}
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {row.occurred_at ? formatDateTime(row.occurred_at) : (
                              <span className="text-xs italic text-gray-400 dark:text-gray-600">Noch nicht angerufen</span>
                            )}
                          </td>

                          {/* Dauer */}
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {row.duration_seconds != null
                              ? `${Math.floor(row.duration_seconds / 60)} Min${row.duration_seconds % 60 > 0 ? ` ${row.duration_seconds % 60} Sek` : ""}`
                              : "–"}
                          </td>

                          {/* Verantwortlich */}
                          <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                            {teamMap[row.created_by] ?? "–"}
                          </td>

                          {/* Assistent vorbei? */}
                          <td className="px-3 py-2.5 min-w-[130px]">
                            {called ? (
                              <Combobox
                                value={row.gatekeeper_bypassed ?? ""}
                                onChange={v => setField(row.id, "gatekeeper_bypassed", v || null, row.created_by)}
                                options={GATEKEEPER_OPTIONS}
                                placeholder="–"
                                allowClear
                                disabled={!isOwn}
                              />
                            ) : <span className="text-xs text-gray-400">–</span>}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2.5 min-w-[180px]">
                            {called ? (
                              <Combobox
                                value={row.call_status ?? ""}
                                onChange={v => setField(row.id, "call_status", v || null, row.created_by)}
                                options={STATUS_OPTIONS}
                                placeholder="–"
                                allowClear
                                disabled={!isOwn}
                              />
                            ) : <span className="text-xs text-gray-400">–</span>}
                          </td>

                          {/* Ergebnis */}
                          <td className="px-3 py-2.5 min-w-[210px]">
                            {called ? (
                              <Combobox
                                value={row.call_result ?? ""}
                                onChange={v => setField(row.id, "call_result", v || null, row.created_by)}
                                options={RESULT_OPTIONS}
                                placeholder="–"
                                allowClear
                                disabled={!isOwn}
                              />
                            ) : <span className="text-xs text-gray-400">–</span>}
                          </td>

                          {/* Follow-Up */}
                          <td className="px-3 py-2.5 min-w-[200px]">
                            {called ? (
                              <Combobox
                                value={row.follow_up ?? ""}
                                onChange={v => setField(row.id, "follow_up", v || null, row.created_by)}
                                options={FOLLOWUP_OPTIONS}
                                placeholder="–"
                                allowClear
                                disabled={!isOwn}
                              />
                            ) : <span className="text-xs text-gray-400">–</span>}
                          </td>

                          {/* Stimmung */}
                          <td className="px-3 py-2.5 min-w-[210px]">
                            {called ? (
                              <Combobox
                                value={row.sentiment ?? ""}
                                onChange={v => setField(row.id, "sentiment", v || null, row.created_by)}
                                options={SENTIMENT_OPTIONS}
                                placeholder="–"
                                allowClear
                                disabled={!isOwn}
                              />
                            ) : <span className="text-xs text-gray-400">–</span>}
                          </td>

                          {/* Notiz */}
                          <td className="px-3 py-2.5 min-w-[220px]">
                            {called ? (
                              <input
                                type="text"
                                value={row.body ?? ""}
                                onChange={e => setField(row.id, "body", e.target.value || null, row.created_by)}
                                placeholder={isOwn ? "Notiz…" : "–"}
                                disabled={!isOwn}
                                className="w-full text-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            ) : <span className="text-xs text-gray-400">–</span>}
                          </td>

                          {/* Löschen */}
                          <td className="px-2 py-2.5 w-10 min-w-[40px]">
                            {called && isOwn && (
                              <button
                                onClick={() => handleDelete(row.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                                title="Eintrag löschen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {SaveBar}
            </>
          )}
        </div>
      )}

      {showDeadlineDialog && (
        <DeadlineDialog
          editing={null}
          onSave={handleSaveDeadline}
          onClose={() => setShowDeadlineDialog(false)}
          teamMembers={team}
          contacts={allContacts.map((c) => ({
            id: c.id,
            type: c.type === "legal_entity" ? "legal_entity" : "natural_person",
            first_name: c.first_name,
            last_name: c.last_name,
            company_name: c.company_name,
          }))}
        />
      )}
    </div>
  );
}
