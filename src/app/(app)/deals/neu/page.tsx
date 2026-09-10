"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { contactDisplayName, type DealStatus } from "@/types/crm";
import Combobox from "@/components/Combobox";
import { fetchAllContacts } from "@/lib/fetch-all-contacts";
import { DEAL_STATUS_LABELS } from "../page";

type ContactOption = {
  id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};
type TeamMember = { id: string; name: string | null; email: string | null };

const DEAL_STATUSES: DealStatus[] = [
  "lead", "contacted", "on_hold", "qualified", "disqualified",
  "demo", "proposal", "negotiation", "won", "lost",
];

export default function DealCreatePageWrapper() {
  return <Suspense fallback={null}><DealCreatePage /></Suspense>;
}

function DealCreatePage() {
  const router = useRouter();
  const params = useSearchParams();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dealStatus, setDealStatus] = useState<DealStatus>("lead");

  const [contactId, setContactId] = useState(params.get("contact_id") ?? "");
  const [ownerId, setOwnerId] = useState("");

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [probability, setProbability] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");

  const [source, setSource] = useState("");
  const [sourceCampaign, setSourceCampaign] = useState("");
  const [referralContactId, setReferralContactId] = useState("");

  const [priority, setPriority] = useState("");
  const [nextActivityAt, setNextActivityAt] = useState("");
  const [forecastCategory, setForecastCategory] = useState("");

  const [notes, setNotes] = useState("");

  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);

  useEffect(() => {
    Promise.all([
      fetchAllContacts<ContactOption>(),
      fetch("/api/team").then((r) => (r.ok ? r.json() : [])),
    ]).then(([c, t]) => { setContacts(c); setTeam(t); });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || null,
        description: description || null,
        deal_status: dealStatus,
        contact_id: contactId || null,
        owner_id: ownerId || null,
        amount: amount ? parseFloat(amount) : null,
        currency: currency || "EUR",
        probability: probability ? parseInt(probability) : null,
        expected_close_date: expectedCloseDate || null,
        source: source || null,
        source_campaign: sourceCampaign || null,
        referral_contact_id: referralContactId || null,
        priority: priority || null,
        next_activity_at: nextActivityAt || null,
        forecast_category: forecastCategory || null,
        notes: notes || null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/deals/${data.id}`);
    } else {
      const err = await res.json().catch(() => ({ error: "Fehler beim Speichern" }));
      setError(err.error);
      setSaving(false);
    }
  }

  const inputCls = "w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:bg-gray-900 dark:border-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30";
  const labelCls = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5";

  return (
    <div className="min-h-screen px-6 py-8 max-w-2xl mx-auto bg-slate-50 dark:bg-gray-950">
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-6">
        <Link href="/deals" className="hover:text-gray-600 dark:hover:text-gray-300">Deals</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">Neuer Deal</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Neuer Deal</h1>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Identität & Bezug */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Identität & Bezug
          </legend>
          <div>
            <label className={labelCls}>Titel *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. WEG Lindenau – Erweiterung Verwaltung"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Pipeline-Status *</label>
            <select value={dealStatus} onChange={(e) => setDealStatus(e.target.value as DealStatus)} className={inputCls} required>
              {DEAL_STATUSES.map((s) => <option key={s} value={s}>{DEAL_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Beschreibung</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Freitext…"
              className={inputCls}
            />
          </div>
        </fieldset>

        {/* Beziehungen */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Beziehungen
          </legend>
          <div>
            <label className={labelCls}>Hauptkontakt</label>
            <Combobox
              value={contactId}
              onChange={setContactId}
              options={contacts.map((c) => ({ value: c.id, label: contactDisplayName(c) }))}
              placeholder="Kontakt suchen…"
            />
          </div>
          <div>
            <label className={labelCls}>Verantwortlicher</label>
            <Combobox
              value={ownerId}
              onChange={setOwnerId}
              options={team.map((m) => ({ value: m.id, label: m.name ?? m.email ?? m.id }))}
              placeholder="Teammitglied suchen…"
            />
          </div>
        </fieldset>

        {/* Wert & Zeit */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Wert & Zeit
          </legend>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Erwarteter Wert</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Währung</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="CHF">CHF</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Wahrscheinlichkeit (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                placeholder="0–100"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Erwarteter Abschluss</label>
              <input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </fieldset>

        {/* Source-Tracking */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Source-Tracking
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quelle</label>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
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
              <input
                value={sourceCampaign}
                onChange={(e) => setSourceCampaign(e.target.value)}
                placeholder="Kampagnenname"
                className={inputCls}
              />
            </div>
          </div>
          {source === "referral" && (
            <div>
              <label className={labelCls}>Empfohlen von</label>
              <Combobox
                value={referralContactId}
                onChange={setReferralContactId}
                options={contacts.map((c) => ({ value: c.id, label: contactDisplayName(c) }))}
                placeholder="Kontakt suchen…"
              />
            </div>
          )}
        </fieldset>

        {/* Aktivität & Forecast */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Aktivität & Forecast
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Priorität</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                <option value="">–</option>
                <option value="low">Niedrig</option>
                <option value="medium">Mittel</option>
                <option value="high">Hoch</option>
                <option value="urgent">Dringend</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Nächste Aktivität</label>
              <input
                type="date"
                value={nextActivityAt}
                onChange={(e) => setNextActivityAt(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Forecast-Kategorie</label>
            <select value={forecastCategory} onChange={(e) => setForecastCategory(e.target.value)} className={inputCls}>
              <option value="">–</option>
              <option value="pipeline">Pipeline</option>
              <option value="best_case">Best Case</option>
              <option value="commit">Commit</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </fieldset>

        {/* Notizen */}
        <div>
          <label className={labelCls}>Notizen</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anmerkungen…"
            className={inputCls}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Deal erstellen
          </button>
          <Link
            href="/deals"
            className="px-6 py-3 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            Abbrechen
          </Link>
        </div>
      </form>
    </div>
  );
}
