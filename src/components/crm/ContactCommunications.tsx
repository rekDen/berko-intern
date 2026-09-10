"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus, Mail, MessageSquare, Loader2, Pencil, Trash2,
  X, Check, Search, Phone, Users, Video, StickyNote,
  CalendarPlus, CalendarClock, AlertTriangle,
} from "lucide-react";
import Combobox from "@/components/Combobox";

type CommunicationRow = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  created_by: string | null;
  ticket_id: string | null;
  contact_id: string | null;
  duration_seconds: number | null;
  gatekeeper_bypassed: string | null;
  call_status: string | null;
  call_result: string | null;
  follow_up: string | null;
  sentiment: string | null;
  tickets: { id: string; title: string } | null;
};

const CALL_STATUS_COLORS: Record<string, string> = {
  "Erreicht": "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  "Nicht erreicht": "bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-400",
  "Falsche Nummer": "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  "Anschluss existiert nicht": "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  "Besetzt": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  "Rückruf erbeten": "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  "Nicht interessiert": "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

type TeamMember = { id: string; name: string };

type DeadlineRow = {
  id: string;
  date: string;
  time: string | null;
  title: string;
  description: string;
  type: "frist" | "termin";
  completed: boolean;
  location: string;
  created_by: string | null;
};

type EmailRow = {
  id: string;
  subject: string;
  from_name: string;
  from_address: string;
  date: string;
};

// Datum (date-Spalte) + optionale Uhrzeit robust zu einem Date kombinieren.
// time kann null ODER leerer String sein; date kann ein voller Timestamp sein.
function deadlineWhen(d: { date: string; time: string | null }) {
  const day = (d.date ?? "").slice(0, 10);
  const hasTime = !!(d.time && d.time.trim());
  const date = new Date(`${day}T${hasTime ? d.time : "00:00"}`);
  return { date, hasTime, valid: !isNaN(date.getTime()) };
}

// Zeitzonen-Helfer: <input type="datetime-local"> arbeitet mit reiner Wanduhrzeit
// ohne Zeitzone. Die App zeigt Zeiten überall explizit in Europe/Berlin an, also
// müssen die Felder ebenfalls Berliner Wanduhrzeit verwenden – unabhängig davon,
// in welcher Zeitzone der Rechner des Nutzers steht.
function berlinOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(instant);
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  const asUTC = Date.UTC(
    map.year, map.month - 1, map.day,
    map.hour === 24 ? 0 : map.hour, map.minute, map.second,
  );
  return asUTC - instant.getTime();
}

// UTC-ISO-String → "YYYY-MM-DDTHH:mm" als Berliner Wanduhrzeit (für datetime-local).
function isoToBerlinInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() + berlinOffsetMs(d)).toISOString().slice(0, 16);
}

// "YYYY-MM-DDTHH:mm" (Berliner Wanduhrzeit) → UTC-ISO-String.
function berlinInputToIso(local: string): string {
  const [datePart, timePart = "00:00"] = local.split("T");
  const [y, mo, day] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  const guessUTC = Date.UTC(y, mo - 1, day, h, mi);
  const offset = berlinOffsetMs(new Date(guessUTC));
  return new Date(guessUTC - offset).toISOString();
}

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

const NOTE_CHANNELS = [
  { value: "phone", label: "Telefonat", icon: Phone },
  { value: "meeting", label: "Persönliches Meeting", icon: Users },
  { value: "online_meeting", label: "Online-Meeting", icon: Video },
  { value: "note", label: "Eigene Gedanken / Notiz", icon: StickyNote },
];

const CHANNEL_LABELS: Record<string, string> = {
  email: "E-Mail",
  phone: "Telefonat",
  letter: "Brief",
  meeting: "Persönliches Meeting",
  online_meeting: "Online-Meeting",
  portal: "Portal",
  note: "Notiz",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "email", label: "E-Mail" },
  { value: "phone", label: "Telefonat" },
  { value: "meeting", label: "Persönlich" },
  { value: "online_meeting", label: "Online-Meeting" },
  { value: "note", label: "Notiz" },
  { value: "deadline", label: "Frist / Termin" },
];

type Props = {
  contactId: string;
};

export default function ContactCommunications({ contactId }: Props) {
  const [communications, setCommunications] = useState<CommunicationRow[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  // Calendar/deadline form
  const [calOpen, setCalOpen] = useState(false);
  const [calSaving, setCalSaving] = useState(false);
  const [calType, setCalType] = useState<"termin" | "frist">("termin");
  const [calTitle, setCalTitle] = useState("");
  const [calDate, setCalDate] = useState("");
  const [calTime, setCalTime] = useState("");
  const [calDescription, setCalDescription] = useState("");

  // Note form
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteChannel, setNoteChannel] = useState("note");
  const [noteSubject, setNoteSubject] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteOccurredAt, setNoteOccurredAt] = useState(() => isoToBerlinInput(new Date().toISOString()));
  const [noteDurationMinutes, setNoteDurationMinutes] = useState<string>(""); // input in minutes, stored as seconds

  // Email picker
  const [emailPickerOpen, setEmailPickerOpen] = useState(false);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [emailSearch, setEmailSearch] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailAssigning, setEmailAssigning] = useState<string | null>(null);

  // Edit
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    channel: "", subject: "", body: "", occurred_at: "", duration_minutes: "", duration_seconds: null as number | null,
    gatekeeper_bypassed: null as string | null,
    call_status: null as string | null,
    call_result: null as string | null,
    follow_up: null as string | null,
    sentiment: null as string | null,
  });
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [commsRes, deadlinesRes, teamRes, profileRes] = await Promise.all([
      fetch(`/api/communications?contact_id=${contactId}`),
      fetch(`/api/deadlines?contact_id=${contactId}`),
      fetch("/api/team"),
      fetch("/api/profile"),
    ]);
    if (commsRes.ok) setCommunications(await commsRes.json());
    if (deadlinesRes.ok) setDeadlines(await deadlinesRes.json());
    if (teamRes.ok) setTeam(await teamRes.json());
    if (profileRes.ok) {
      const p = await profileRes.json() as { id?: string };
      setCurrentUserId(p.id ?? null);
    }
    setLoading(false);
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  function openNoteForm() {
    setNoteChannel("note");
    setNoteSubject("");
    setNoteBody("");
    setNoteOccurredAt(isoToBerlinInput(new Date().toISOString()));
    setNoteDurationMinutes("");
    setCalOpen(false);
    setNoteOpen(true);
  }

  async function saveNote() {
    if (!noteBody.trim()) return;
    setNoteSaving(true);
    const res = await fetch("/api/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        channel: noteChannel,
        subject: noteSubject || null,
        body: noteBody,
        occurred_at: berlinInputToIso(noteOccurredAt),
        duration_seconds:
          noteChannel === "phone" && noteDurationMinutes !== ""
            ? parseInt(noteDurationMinutes, 10) * 60
            : null,
      }),
    });
    if (res.ok) {
      setNoteOpen(false);
      await load();
    }
    setNoteSaving(false);
  }

  function openCalForm() {
    setCalType("termin");
    setCalTitle("");
    setCalDate(new Date().toISOString().slice(0, 10));
    setCalTime("");
    setCalDescription("");
    setNoteOpen(false);
    setCalOpen(true);
  }

  async function saveCal() {
    if (!calTitle.trim() || !calDate) return;
    setCalSaving(true);
    const res = await fetch("/api/deadlines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        type: calType,
        title: calTitle.trim(),
        date: calDate,
        time: calTime || null,
        description: calDescription || "",
      }),
    });
    if (res.ok) {
      setCalOpen(false);
      await load();
    } else {
      const err = await res.json().catch(() => ({ error: "Speichern fehlgeschlagen" }));
      alert(err.error ?? "Speichern fehlgeschlagen");
    }
    setCalSaving(false);
  }

  async function removeDeadline(d: DeadlineRow) {
    if (!confirm(`${d.type === "frist" ? "Frist" : "Termin"} wirklich löschen?`)) return;
    const res = await fetch(`/api/deadlines/${d.id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function openEmailPicker() {
    setEmailPickerOpen(true);
    setEmailLoading(true);
    const res = await fetch("/api/emails");
    if (res.ok) setEmails(await res.json());
    setEmailLoading(false);
  }

  async function assignEmail(emailId: string) {
    setEmailAssigning(emailId);
    const res = await fetch("/api/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, email_id: emailId }),
    });
    if (res.ok) {
      setEmailPickerOpen(false);
      await load();
    }
    setEmailAssigning(null);
  }

  function startEdit(c: CommunicationRow) {
    setEditId(c.id);
    setEditForm({
      channel: c.channel,
      subject: c.subject ?? "",
      body: c.body ?? "",
      occurred_at: isoToBerlinInput(c.occurred_at),
      duration_minutes: c.duration_seconds !== null ? String(Math.round(c.duration_seconds / 60)) : "",
      duration_seconds: c.duration_seconds,
      gatekeeper_bypassed: c.gatekeeper_bypassed ?? null,
      call_status: c.call_status ?? null,
      call_result: c.call_result ?? null,
      follow_up: c.follow_up ?? null,
      sentiment: c.sentiment ?? null,
    });
  }

  async function saveEdit() {
    if (!editId) return;
    setEditSaving(true);
    const res = await fetch(`/api/communications/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: editForm.channel,
        subject: editForm.subject || null,
        body: editForm.body || null,
        occurred_at: berlinInputToIso(editForm.occurred_at),
        duration_seconds:
          editForm.channel === "phone" && editForm.duration_minutes !== ""
            ? parseInt(editForm.duration_minutes, 10) * 60
            : null,
        ...(editForm.channel === "phone" ? {
          gatekeeper_bypassed: editForm.gatekeeper_bypassed,
          call_status: editForm.call_status,
          call_result: editForm.call_result,
          follow_up: editForm.follow_up,
          sentiment: editForm.sentiment,
        } : {}),
      }),
    });
    if (res.ok) {
      setEditId(null);
      await load();
    }
    setEditSaving(false);
  }

  async function remove(c: CommunicationRow) {
    const isEmail = c.channel === "email";
    const msg = isEmail
      ? "E-Mail aus dieser Verknüpfung entfernen?"
      : "Eintrag wirklich löschen?";
    if (!confirm(msg)) return;
    const res = await fetch(`/api/communications/${c.id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  // Gemischte Timeline aus Kommunikation + Fristen/Terminen
  type TimelineItem =
    | { kind: "comm"; at: number; comm: CommunicationRow }
    | { kind: "deadline"; at: number; deadline: DeadlineRow };

  const showComms = filter === "all" || (filter !== "deadline");
  const showDeadlines = filter === "all" || filter === "deadline";

  const timeline: TimelineItem[] = [
    ...(showComms
      ? communications
          .filter((c) => filter === "all" || c.channel === filter)
          .map((c) => ({ kind: "comm" as const, at: new Date(c.occurred_at).getTime(), comm: c }))
      : []),
    ...(showDeadlines
      ? deadlines.map((d) => {
          const { date } = deadlineWhen(d);
          return {
            kind: "deadline" as const,
            at: isNaN(date.getTime()) ? 0 : date.getTime(),
            deadline: d,
          };
        })
      : []),
  ].sort((a, b) => b.at - a.at);

  const filteredEmails = emailSearch
    ? emails.filter((e) =>
        [e.subject, e.from_name, e.from_address].some((f) =>
          f?.toLowerCase().includes(emailSearch.toLowerCase())
        )
      )
    : emails;

  return (
    <div className="space-y-4">
      {/* Header mit Filter und Aktionen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filter === f.value
                  ? "bg-orange-500 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openEmailPicker}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
              border border-gray-200 text-gray-600 hover:bg-gray-50
              dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            E-Mail zuordnen
          </button>
          <button
            onClick={openCalForm}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
              border border-gray-200 text-gray-600 hover:bg-gray-50
              dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Im Kalender eintragen
          </button>
          <button
            onClick={openNoteForm}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
              bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Notiz hinzufügen
          </button>
        </div>
      </div>

      {/* Note form */}
      {noteOpen && (
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Typ</label>
              <select
                value={noteChannel}
                onChange={(e) => { setNoteChannel(e.target.value); setNoteDurationMinutes(""); }}
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                {NOTE_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Zeitpunkt</label>
              <input
                type="datetime-local"
                value={noteOccurredAt}
                onChange={(e) => setNoteOccurredAt(e.target.value)}
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>
          {noteChannel === "phone" && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Gesprächsdauer (Minuten)
              </label>
              <input
                type="number"
                min={0}
                value={noteDurationMinutes}
                onChange={(e) => setNoteDurationMinutes(e.target.value)}
                placeholder="z.B. 15"
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          )}
          {noteChannel !== "note" && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Betreff</label>
              <input
                value={noteSubject}
                onChange={(e) => setNoteSubject(e.target.value)}
                placeholder={noteChannel === "phone" ? "z.B. Rückruf zu Mietminderung" : "Thema des Meetings"}
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              {noteChannel === "note" ? "Gedanken / Notiz" : "Inhalt / Gesprächsnotiz"}
            </label>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={4}
              placeholder={noteChannel === "note" ? "Was möchtest du festhalten?" : "Was wurde besprochen?"}
              className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setNoteOpen(false)}
              disabled={noteSaving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={saveNote}
              disabled={noteSaving || (noteChannel !== "phone" && !noteBody.trim())}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {noteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Speichern
            </button>
          </div>
        </div>
      )}

      {/* Kalender-/Frist-Formular */}
      {calOpen && (
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Art</label>
              <select
                value={calType}
                onChange={(e) => setCalType(e.target.value as "termin" | "frist")}
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                <option value="termin">Termin</option>
                <option value="frist">Frist</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Titel</label>
              <input
                value={calTitle}
                onChange={(e) => setCalTitle(e.target.value)}
                placeholder={calType === "frist" ? "z.B. Widerspruchsfrist" : "z.B. Objektbesichtigung"}
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Datum</label>
              <input
                type="date"
                value={calDate}
                onChange={(e) => setCalDate(e.target.value)}
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Uhrzeit <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="time"
                value={calTime}
                onChange={(e) => setCalTime(e.target.value)}
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Beschreibung <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={calDescription}
              onChange={(e) => setCalDescription(e.target.value)}
              rows={3}
              placeholder="Details zum Termin oder zur Frist…"
              className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setCalOpen(false)}
              disabled={calSaving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={saveCal}
              disabled={calSaving || !calTitle.trim() || !calDate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {calSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Speichern
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : timeline.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
          <MessageSquare className="w-10 h-10 mb-2" />
          <p className="text-sm">
            {filter === "all" ? "Noch keine Einträge" : `Keine Einträge vom Typ „${FILTERS.find((f) => f.value === filter)?.label}"`}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 space-y-4">
          {timeline.map((item) => {
            if (item.kind === "deadline") {
              const d = item.deadline;
              const isFrist = d.type === "frist";
              return (
                <div key={`d-${d.id}`} className="flex gap-3 group">
                  <div className="flex-shrink-0 mt-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isFrist
                        ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                    }`}>
                      {isFrist ? <AlertTriangle className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        isFrist
                          ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                          : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400"
                      }`}>
                        {isFrist ? "Frist" : "Termin"}
                      </span>
                      <span>·</span>
                      {(() => {
                        const { date, hasTime, valid } = deadlineWhen(d);
                        if (!valid) return <span>{d.date}</span>;
                        return (
                          <span>
                            {date.toLocaleString("de-DE", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
                              timeZone: "Europe/Berlin",
                            })}
                            {!hasTime && " (ganztägig)"}
                          </span>
                        );
                      })()}
                      {d.completed && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400">Erledigt</span>
                        </>
                      )}
                      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => removeDeadline(d)}
                          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                          title="Löschen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">{d.title}</p>
                    {d.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-3 whitespace-pre-wrap">{d.description}</p>
                    )}
                  </div>
                </div>
              );
            }
            const c = item.comm;
            const isEmail = c.channel === "email";
            const isEditing = editId === c.id;
            return (
              <div key={`c-${c.id}`} className="flex gap-3 group">
                <div className="flex-shrink-0 mt-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                    c.direction === "inbound"
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  }`}>
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {!isEditing ? (
                    <>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                        <span>·</span>
                        <span>{c.direction === "inbound" ? "Eingehend" : "Ausgehend"}</span>
                        {c.channel === "phone" && c.duration_seconds !== null && (
                          <>
                            <span>·</span>
                            <span>{Math.floor(c.duration_seconds / 60)} Min {c.duration_seconds % 60 > 0 ? `${c.duration_seconds % 60} Sek` : ""}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{new Date(c.occurred_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}</span>
                        {c.created_by && (() => {
                          const member = team.find((m) => m.id === c.created_by);
                          return member ? (
                            <>
                              <span>·</span>
                              <span>{member.name}</span>
                            </>
                          ) : null;
                        })()}
                        {c.tickets && (
                          <>
                            <span>·</span>
                            <Link
                              href={`/vorgaenge/${c.tickets.id}`}
                              className="text-orange-600 hover:text-orange-700 dark:text-orange-400 truncate"
                            >
                              ↗ {c.tickets.title}
                            </Link>
                          </>
                        )}
                        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isEmail && (c.channel !== "phone" || c.created_by === currentUserId) && (
                            <button
                              onClick={() => startEdit(c)}
                              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
                              title="Bearbeiten"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => remove(c)}
                            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                            title={isEmail ? "Verknüpfung entfernen" : "Löschen"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {c.subject && (
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">{c.subject}</p>
                      )}
                      {c.body && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-3 whitespace-pre-wrap">
                          {c.body}
                        </p>
                      )}
                      {c.channel === "phone" && (c.call_status || c.call_result || c.follow_up || c.sentiment || c.gatekeeper_bypassed) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {c.call_status && (
                            <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${CALL_STATUS_COLORS[c.call_status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>
                              {c.call_status}
                            </span>
                          )}
                          {c.gatekeeper_bypassed && (
                            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400 font-medium">
                              Assistent: {c.gatekeeper_bypassed}
                            </span>
                          )}
                          {c.call_result && (
                            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300">
                              {c.call_result}
                            </span>
                          )}
                          {c.follow_up && (
                            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
                              Follow-Up: {c.follow_up}
                            </span>
                          )}
                          {c.sentiment && (
                            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
                              {c.sentiment}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={editForm.channel}
                          onChange={(e) => setEditForm({ ...editForm, channel: e.target.value, duration_minutes: "" })}
                          className="text-sm rounded-lg border border-gray-200 bg-white px-2 py-1.5 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        >
                          {NOTE_CHANNELS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        {editForm.channel === "phone" ? (
                          <p className="text-sm px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            {new Date(editForm.occurred_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}
                          </p>
                        ) : (
                          <input
                            type="datetime-local"
                            value={editForm.occurred_at}
                            onChange={(e) => setEditForm({ ...editForm, occurred_at: e.target.value })}
                            className="text-sm rounded-lg border border-gray-200 bg-white px-2 py-1.5 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                          />
                        )}
                      </div>
                      {editForm.channel === "phone" && (
                        <>
                          <p className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            Dauer: {editForm.duration_seconds != null
                              ? `${Math.floor(editForm.duration_seconds / 60)} Min${editForm.duration_seconds % 60 > 0 ? ` ${editForm.duration_seconds % 60} Sek` : ""}`
                              : "–"}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Assistent vorbei?</label>
                              <Combobox value={editForm.gatekeeper_bypassed ?? ""} onChange={v => setEditForm(f => ({ ...f, gatekeeper_bypassed: v || null }))} options={GATEKEEPER_OPTIONS} placeholder="–" allowClear />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Status</label>
                              <Combobox value={editForm.call_status ?? ""} onChange={v => setEditForm(f => ({ ...f, call_status: v || null }))} options={STATUS_OPTIONS} placeholder="–" allowClear />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Ergebnis</label>
                              <Combobox value={editForm.call_result ?? ""} onChange={v => setEditForm(f => ({ ...f, call_result: v || null }))} options={RESULT_OPTIONS} placeholder="–" allowClear />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Follow-Up</label>
                              <Combobox value={editForm.follow_up ?? ""} onChange={v => setEditForm(f => ({ ...f, follow_up: v || null }))} options={FOLLOWUP_OPTIONS} placeholder="–" allowClear />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-400 mb-1">Stimmung</label>
                              <Combobox value={editForm.sentiment ?? ""} onChange={v => setEditForm(f => ({ ...f, sentiment: v || null }))} options={SENTIMENT_OPTIONS} placeholder="–" allowClear />
                            </div>
                          </div>
                        </>
                      )}
                      {editForm.channel !== "note" && (
                        <input
                          value={editForm.subject}
                          onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                          placeholder="Betreff"
                          className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-1.5 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        />
                      )}
                      <textarea
                        value={editForm.body}
                        onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                        rows={3}
                        placeholder="Inhalt"
                        className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-1.5 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditId(null)}
                          disabled={editSaving}
                          className="px-3 py-1 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                        >
                          Abbrechen
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={editSaving || (editForm.channel !== "phone" && !editForm.body.trim())}
                          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                        >
                          {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Speichern
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* E-Mail-Picker Modal */}
      {emailPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setEmailPickerOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">E-Mail dem Kontakt zuordnen</h3>
              <button
                onClick={() => setEmailPickerOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={emailSearch}
                  onChange={(e) => setEmailSearch(e.target.value)}
                  placeholder="Nach Betreff oder Absender suchen…"
                  className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {emailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : filteredEmails.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">
                  {emails.length === 0 ? "Keine E-Mails im Posteingang" : `Keine Treffer für „${emailSearch}"`}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredEmails.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => assignEmail(e.id)}
                        disabled={emailAssigning !== null}
                        className="w-full text-left px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-0.5">
                          <span className="truncate">{e.from_name} &lt;{e.from_address}&gt;</span>
                          <span>·</span>
                          <span className="flex-shrink-0">{new Date(e.date).toLocaleDateString("de-DE")}</span>
                          {emailAssigning === e.id && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                        </div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{e.subject}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
