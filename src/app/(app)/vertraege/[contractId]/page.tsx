"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, Loader2, Calendar, Banknote, User,
  Trash2, Pencil, X, Check, FileSignature,
} from "lucide-react";
import { contactDisplayName } from "@/types/crm";
import ContractDocuments from "@/components/dms/ContractDocuments";
import Combobox from "@/components/Combobox";
import { fetchAllContacts } from "@/lib/fetch-all-contacts";

type ContractDetail = {
  id: string;
  title: string | null;
  description: string | null;
  amount: number | null;
  currency: string | null;
  expected_close_date: string | null;
  notes: string | null;
  created_at: string;
  contact_id: string | null;
  owner_id: string | null;
  created_by: string | null;
};

type EditableForm = {
  title: string;
  description: string;
  contact_id: string;
  amount: string;
  currency: string;
  expected_close_date: string;
  notes: string;
};

type ContactOption = {
  id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

type TeamMember = { id: string; name: string; initials: string | null };

function fmt(amount: number | null, currency = "EUR"): string {
  if (amount == null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(amount);
}

function fmtDate(d: string | null): string {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("de-DE");
}

function toForm(c: ContractDetail): EditableForm {
  return {
    title: c.title ?? "",
    description: c.description ?? "",
    contact_id: c.contact_id ?? "",
    amount: c.amount?.toString() ?? "",
    currency: c.currency ?? "EUR",
    expected_close_date: c.expected_close_date?.slice(0, 10) ?? "",
    notes: c.notes ?? "",
  };
}

export default function ContractDetailPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const router = useRouter();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditableForm | null>(null);
  const [error, setError] = useState("");

  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [contractRes, teamRes, contactsData] = await Promise.all([
      fetch(`/api/contracts/${contractId}`),
      fetch("/api/team"),
      fetchAllContacts<ContactOption>(),
    ]);
    if (contractRes.ok) setContract(await contractRes.json());
    if (teamRes.ok) setTeam(await teamRes.json());
    setContacts(contactsData);
    setLoading(false);
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    if (!contract) return;
    setForm(toForm(contract));
    setError("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
    setError("");
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError("");

    const payload: Record<string, unknown> = {
      title: form.title || null,
      description: form.description || null,
      contact_id: form.contact_id || null,
      amount: form.amount ? parseFloat(form.amount) : null,
      currency: form.currency || "EUR",
      expected_close_date: form.expected_close_date || null,
      notes: form.notes || null,
    };

    const res = await fetch(`/api/contracts/${contractId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    if (!confirm("Vertrag wirklich löschen?")) return;
    const res = await fetch(`/api/contracts/${contractId}`, { method: "DELETE" });
    if (res.ok) router.push("/vertraege");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-gray-950">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-gray-950">
        <p className="text-sm text-gray-400">Vertrag nicht gefunden</p>
      </div>
    );
  }

  const contactsById = new Map(contacts.map((c) => [c.id, c]));
  const teamById = new Map(team.map((m) => [m.id, m]));

  const ownerMember = contract.owner_id ? teamById.get(contract.owner_id) : null;
  const creatorMember = contract.created_by ? teamById.get(contract.created_by) : null;
  const responsibleMember = ownerMember ?? creatorMember;

  const inputCls =
    "w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30";

  return (
    <div className="min-h-screen px-6 py-8 max-w-5xl mx-auto bg-slate-50 dark:bg-gray-950">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-6">
        <Link href="/vertraege" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          Verträge
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">
          {contract.title ?? "Ohne Titel"}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex-1 min-w-0 mr-4">
          {editing && form ? (
            <div className="space-y-2">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Titel…"
                className="w-full text-xl font-bold rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Beschreibung…"
                className="w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {contract.title ?? <span className="italic text-gray-400">Ohne Titel</span>}
              </h1>
              {contract.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{contract.description}</p>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!editing ? (
            <>
              <button
                onClick={startEdit}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                  border border-gray-200 text-gray-600 hover:bg-gray-50
                  dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Bearbeiten
              </button>
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50
                  dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"
                title="Löschen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                  border border-gray-200 text-gray-600 hover:bg-gray-50
                  dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                  bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Speichern
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kontakt */}
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Kontakt</h3>
          {!editing ? (
            contract.contact_id ? (
              <Link
                href={`/kontakte/${contract.contact_id}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {(() => {
                    const c = contactsById.get(contract.contact_id!);
                    return c ? contactDisplayName(c) : contract.contact_id;
                  })()}
                </span>
              </Link>
            ) : (
              <p className="text-sm text-gray-400">Kein Kontakt</p>
            )
          ) : form && (
            <Combobox
              value={form.contact_id}
              onChange={(v) => setForm({ ...form, contact_id: v })}
              options={contacts.map((c) => ({ value: c.id, label: contactDisplayName(c) }))}
              placeholder="Kontakt suchen…"
            />
          )}
        </div>

        {/* Vertragsdaten */}
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Vertragsdaten</h3>
          {!editing ? (
            <div className="space-y-3">
              <Row icon={Banknote} label="Betrag" value={fmt(contract.amount, contract.currency ?? "EUR")} />
              <Row icon={Calendar} label="Abschluss" value={fmtDate(contract.expected_close_date)} />
              <Row icon={FileSignature} label="Erstellt" value={fmtDate(contract.created_at)} />
            </div>
          ) : form && (
            <div className="space-y-3">
              <Field label="Betrag (€)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0,00"
                  className={inputCls}
                />
              </Field>
              <Field label="Währung">
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className={inputCls}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="CHF">CHF</option>
                </select>
              </Field>
              <Field label="Abschlussdatum">
                <input
                  type="date"
                  value={form.expected_close_date}
                  onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Verantwortlicher */}
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Abgeschlossen von</h3>
          {responsibleMember ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {responsibleMember.initials ?? responsibleMember.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{responsibleMember.name}</p>
                <p className="text-xs text-gray-400">{fmtDate(contract.created_at)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Unbekannt</p>
          )}
        </div>
      </div>

      {/* Notizen */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Notizen</h3>
        {!editing ? (
          contract.notes ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{contract.notes}</p>
          ) : (
            <p className="text-sm text-gray-400">Keine Notizen</p>
          )
        ) : form && (
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={4}
            className={inputCls}
            placeholder="Notizen zum Vertrag…"
          />
        )}
      </div>

      {/* Dokumente */}
      <div className="mt-6">
        <ContractDocuments contractId={contract.id} />
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{value}</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
