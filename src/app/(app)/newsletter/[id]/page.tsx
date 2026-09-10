"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Loader2, Save, Send, Users, Eye, Ban, AlertCircle,
  Trash2, PlayCircle, Clock, ShieldAlert,
} from "lucide-react";
import { fetchAllContacts } from "@/lib/fetch-all-contacts";
import type {
  NewsletterCampaign, NewsletterRecipient, SenderAccount,
  CampaignSegment, ManualRecipient, CampaignStatus,
} from "@/types/newsletter";

type ContactRow = { category: string | null; lead_source: string | null };
type FullCampaign = NewsletterCampaign & { recipients: NewsletterRecipient[] };

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Entwurf", scheduled: "Geplant", sending: "Wird gesendet",
  paused: "Pausiert", sent: "Versendet", failed: "Fehler",
};

const input = "w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-akturio/30";
const label = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1";

function parseManual(text: string): ManualRecipient[] {
  return text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?)<([^>]+)>$/);
    if (m) return { name: m[1].trim() || null, email: m[2].trim() };
    return { email: line };
  }).filter((r) => r.email.includes("@"));
}
function manualToText(list: ManualRecipient[]): string {
  return (list ?? []).map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join("\n");
}

export default function CampaignEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [c, setC] = useState<FullCampaign | null>(null);
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [leadSources, setLeadSources] = useState<string[]>([]);
  const [manualText, setManualText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewHours, setPreviewHours] = useState<number | null>(null);
  const [schedule, setSchedule] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/newsletter/campaigns/${id}`);
    if (res.ok) {
      const data: FullCampaign = await res.json();
      setC(data);
      setManualText(manualToText(data.manual_recipients ?? []));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/newsletter/accounts").then((r) => r.ok ? r.json() : []).then(setAccounts);
    fetchAllContacts<ContactRow>().then((rows) => {
      setCategories([...new Set(rows.map((r) => r.category).filter((v): v is string => !!v))].sort());
      setLeadSources([...new Set(rows.map((r) => r.lead_source).filter((v): v is string => !!v))].sort());
    });
  }, [load]);

  function set<K extends keyof NewsletterCampaign>(key: K, value: NewsletterCampaign[K]) {
    setC((prev) => (prev ? { ...prev, [key]: value } : prev));
    setPreviewCount(null);
    setPreviewHours(null);
  }
  function setSegment(patch: Partial<CampaignSegment>) {
    if (!c) return;
    set("segment", { ...(c.segment ?? {}), ...patch });
  }
  function toggleArr(arr: string[] | undefined, val: string): string[] {
    const s = new Set(arr ?? []);
    s.has(val) ? s.delete(val) : s.add(val);
    return [...s];
  }

  const editable = c ? !["sending", "sent"].includes(c.status) : false;

  const body = () => ({
    name: c!.name, subject: c!.subject, body_html: c!.body_html,
    sender_account_id: c!.sender_account_id,
    throttle_per_hour: c!.throttle_per_hour, track_opens: c!.track_opens,
    segment: c!.segment, manual_recipients: parseManual(manualText),
  });

  async function save(): Promise<boolean> {
    if (!c) return false;
    setSaving(true);
    const res = await fetch(`/api/newsletter/campaigns/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body()),
    });
    setSaving(false);
    if (!res.ok) { alert("Speichern fehlgeschlagen"); return false; }
    return true;
  }

  async function preview() {
    if (!c) return;
    const res = await fetch(`/api/newsletter/campaigns/${id}/preview`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segment: c.segment, manual_recipients: parseManual(manualText),
        sender_account_id: c.sender_account_id, throttle_per_hour: c.throttle_per_hour,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setPreviewCount(data.count);
      setPreviewHours(data.estimated_hours);
    }
  }

  async function send(scheduledAt: string | null) {
    if (!c) return;
    if (!(await save())) return;
    const when = scheduledAt ? "geplant" : "jetzt gesendet";
    if (!confirm(`Kampagne „${c.name}" wird ${when}. Fortfahren?`)) return;
    const res = await fetch(`/api/newsletter/campaigns/${id}/send`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });
    if (!res.ok) { alert((await res.json()).error ?? "Versand fehlgeschlagen"); return; }
    const data = await res.json();
    alert(`${data.queued} Empfänger eingereiht.`);
    if (!scheduledAt) await triggerProcess();
    load();
  }

  async function triggerProcess() {
    await fetch("/api/newsletter/process", { method: "POST" });
    load();
  }

  async function remove() {
    if (!confirm("Kampagne wirklich löschen?")) return;
    const res = await fetch(`/api/newsletter/campaigns/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/newsletter");
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!c) return <div className="p-6 text-gray-400">Kampagne nicht gefunden.</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/newsletter" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft className="w-5 h-5" /></Link>
          <input
            value={c.name} disabled={!editable}
            onChange={(e) => set("name", e.target.value)}
            className="text-lg font-semibold bg-transparent text-gray-900 dark:text-white focus:outline-none min-w-0 disabled:opacity-70"
          />
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-akturio-100 text-akturio-700 dark:bg-akturio-500/10 dark:text-akturio-300 flex-shrink-0">{STATUS_LABEL[c.status]}</span>
        </div>
        <button onClick={remove} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
      </div>

      {/* Stats (wenn versendet/versendend) */}
      {["sending", "sent", "scheduled"].includes(c.status) && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Empfänger", value: c.total_recipients, icon: Users },
            { label: "Versendet", value: c.sent_count, icon: Send },
            { label: "Geöffnet", value: c.opened_count, icon: Eye },
            { label: "Abgemeldet", value: c.unsubscribed_count, icon: Ban },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-center">
              <s.icon className="w-4 h-4 mx-auto text-akturio mb-1" />
              <div className="text-lg font-semibold text-gray-900 dark:text-white">{s.value}</div>
              <div className="text-[11px] text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Inhalt */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Inhalt</h2>
        <div>
          <label className={label}>Betreff</label>
          <input value={c.subject} disabled={!editable} onChange={(e) => set("subject", e.target.value)} className={input} placeholder="Betreff der E-Mail" />
        </div>
        <div>
          <label className={label}>Inhalt (HTML)</label>
          <textarea value={c.body_html} disabled={!editable} onChange={(e) => set("body_html", e.target.value)} rows={10} className={`${input} font-mono text-xs`} placeholder="<h1>Hallo…</h1>  — Platzhalter {{abmelden}} für den Abmeldelink" />
        </div>
        {c.body_html.trim() && (
          <div>
            <p className={label}>Vorschau</p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white p-3 max-h-72 overflow-auto text-sm text-gray-900" dangerouslySetInnerHTML={{ __html: c.body_html }} />
          </div>
        )}
      </section>

      {/* Absender */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Absender-Account</h2>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const on = c.sender_account_id === a.id;
            return (
              <button
                key={a.id} disabled={!editable}
                onClick={() => set("sender_account_id", a.id)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${on ? "border-akturio bg-akturio/10 text-akturio-700 dark:text-akturio-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}
              >{a.email}</button>
            );
          })}
          {accounts.length === 0 && <span className="text-xs text-gray-400">Keine E-Mail-Accounts konfiguriert.</span>}
        </div>
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Bewusst nur ein Account wählbar: IONOS-Postfächer teilen sich Domain- und IP-Reputation, das Verteilen einer Kampagne über mehrere Accounts umgeht Sendelimits nicht, sondern wirkt wie ein Spam-Muster und riskiert eine Account-Sperre. Für echte Marketing-Kampagnen ist ein dedizierter E-Mail-Versanddienst (z. B. Brevo, SendGrid, Mailgun) die sichere Wahl.
        </p>
      </section>

      {/* Empfänger */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Empfänger</h2>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" disabled={!editable} checked={!!c.segment?.all} onChange={(e) => setSegment({ all: e.target.checked })} />
          Alle Kontakte
        </label>
        {!c.segment?.all && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Kategorien</label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button key={cat} disabled={!editable} onClick={() => setSegment({ categories: toggleArr(c.segment?.categories, cat) })}
                    className={`px-2 py-1 rounded-md text-xs border ${c.segment?.categories?.includes(cat) ? "border-akturio bg-akturio/10 text-akturio-700 dark:text-akturio-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}>{cat}</button>
                ))}
                {categories.length === 0 && <span className="text-xs text-gray-400">—</span>}
              </div>
            </div>
            <div>
              <label className={label}>Lead-Quellen</label>
              <div className="flex flex-wrap gap-1.5">
                {leadSources.map((ls) => (
                  <button key={ls} disabled={!editable} onClick={() => setSegment({ lead_sources: toggleArr(c.segment?.lead_sources, ls) })}
                    className={`px-2 py-1 rounded-md text-xs border ${c.segment?.lead_sources?.includes(ls) ? "border-akturio bg-akturio/10 text-akturio-700 dark:text-akturio-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}>{ls}</button>
                ))}
                {leadSources.length === 0 && <span className="text-xs text-gray-400">—</span>}
              </div>
            </div>
          </div>
        )}
        <div>
          <label className={label}>Zusätzliche Adressen (eine pro Zeile, „Name &lt;mail&gt;" oder nur E-Mail)</label>
          <textarea value={manualText} disabled={!editable} onChange={(e) => { setManualText(e.target.value); setPreviewCount(null); }} rows={3} className={`${input} font-mono text-xs`} placeholder="max@example.com&#10;Firma GmbH <info@firma.de>" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={preview} className="text-xs px-3 py-1.5 rounded-lg border border-akturio text-akturio hover:bg-akturio/10">Empfänger zählen</button>
          {previewCount !== null && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {previewCount} Empfänger{previewHours ? ` · Versand dauert bei aktueller Drosselung ca. ${previewHours} Std.` : ""}
            </span>
          )}
        </div>
      </section>

      {/* Einstellungen */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Drosselung (Mails pro Stunde)</label>
            <input
              type="number" min={1} max={200} disabled={!editable}
              value={c.throttle_per_hour}
              onChange={(e) => set("throttle_per_hour", Math.min(200, Math.max(1, parseInt(e.target.value || "1", 10))))}
              className={input}
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer self-end pb-2">
            <input type="checkbox" disabled={!editable} checked={c.track_opens} onChange={(e) => set("track_opens", e.target.checked)} />
            Öffnungen tracken
          </label>
        </div>
        <p className="text-xs text-gray-400">
          IONOS-Sendelimits sind nach Postfachalter gestaffelt: neue Postfächer vertragen oft nur ~50 Mails/Stunde, ältere einige hundert. 30/Std. ist ein sicherer Startwert – bei Unsicherheit lieber niedrig ansetzen statt zu riskieren, dass das Postfach gesperrt wird.
        </p>
      </section>

      {/* Aktionen */}
      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Speichern
          </button>
          <button onClick={() => send(null)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-akturio text-white hover:bg-akturio-dark">
            <Send className="w-4 h-4" /> Jetzt senden
          </button>
          <div className="flex items-center gap-1.5">
            <input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className={`${input} !w-auto`} />
            <button onClick={() => schedule && send(new Date(schedule).toISOString())} disabled={!schedule} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-akturio text-akturio hover:bg-akturio/10 disabled:opacity-50">
              <Clock className="w-4 h-4" /> Planen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button onClick={triggerProcess} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-akturio text-akturio hover:bg-akturio/10">
            <PlayCircle className="w-4 h-4" /> Queue verarbeiten
          </button>
          <span className="text-xs text-gray-400">Der Versand läuft gedrosselt im Hintergrund (Cron).</span>
        </div>
      )}

      {/* Empfängerliste */}
      {c.recipients.length > 0 && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-800">Empfänger ({c.recipients.length})</div>
          <div className="max-h-80 overflow-auto divide-y divide-gray-50 dark:divide-gray-800/50">
            {c.recipients.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{r.name ? `${r.name} · ` : ""}{r.email}</span>
                {r.opened_at && <Eye className="w-3.5 h-3.5 text-akturio flex-shrink-0" />}
                {r.error && <span title={r.error}><AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" /></span>}
                <span className={`text-xs flex-shrink-0 ${r.status === "sent" ? "text-emerald-600" : r.status === "failed" ? "text-red-500" : r.status === "unsubscribed" ? "text-gray-400" : "text-gray-400"}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
