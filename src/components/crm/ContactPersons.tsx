"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Check, X, Phone, Mail, UserRound, Loader2, ExternalLink } from "lucide-react";
import CallButton from "@/components/CallButton";
import Combobox from "@/components/Combobox";
import { fetchAllContacts } from "@/lib/fetch-all-contacts";
import type { ContactPerson, EmailEntry, PhoneEntry } from "@/types/crm";

type Props = {
  contactId: string;
  persons: ContactPerson[];
  onChange: () => void;
};

// Schlanke Kontakt-Zeile für die Dublettenprüfung / Auswahl bestehender Kontakte.
type ContactRow = {
  id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  emails: EmailEntry[] | null;
  phones: PhoneEntry[] | null;
};

function rowName(c: Pick<ContactRow, "first_name" | "last_name">): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}

const PHONE_TYPES = [
  { value: "landline", label: "Festnetz" },
  { value: "mobile", label: "Mobil" },
  { value: "fax", label: "Fax" },
];

const inputCls =
  "w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 " +
  "dark:bg-gray-900 dark:border-gray-700 dark:text-white " +
  "focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500";

function emptyPerson(): ContactPerson {
  return { first_name: "", last_name: "", position: null, email: null, phones: [{ type: "landline", value: "" }], contact_id: null };
}

async function savePatch(contactId: string, persons: ContactPerson[]) {
  return fetch(`/api/contacts/${contactId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact_persons: persons }),
  });
}

// Legt aus einem Ansprechpartner zusätzlich einen eigenständigen Kontakt an,
// damit die Person z. B. als Deal-Hauptkontakt verfügbar ist.
async function createContactFromPerson(p: ContactPerson) {
  const emails = p.email?.trim()
    ? [{ type: "business" as const, value: p.email.trim() }]
    : [];
  const phones = p.phones
    .filter((ph) => ph.value.trim())
    .map((ph) => ({ type: ph.type, value: ph.value.trim() }));

  return fetch("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "natural_person",
      first_name: p.first_name.trim() || null,
      // last_name ist bei natürlichen Personen Pflicht – ggf. auf den Vornamen ausweichen.
      last_name: p.last_name.trim() || p.first_name.trim(),
      emails,
      phones,
      notes: p.position?.trim() ? `Funktion: ${p.position.trim()}` : null,
    }),
  });
}

export default function ContactPersons({ contactId, persons, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [form, setForm] = useState<ContactPerson>(emptyPerson());
  const [saving, setSaving] = useState(false);

  // Bestehende Kontakte (nur natürliche Personen) für Dublettenprüfung/Auswahl.
  const [allContacts, setAllContacts] = useState<ContactRow[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [linkedContactId, setLinkedContactId] = useState("");
  const [dupError, setDupError] = useState("");

  async function ensureContacts() {
    if (contactsLoaded) return;
    const rows = await fetchAllContacts<ContactRow>();
    setAllContacts(rows.filter((c) => c.type === "natural_person"));
    setContactsLoaded(true);
  }

  // Sucht einen bestehenden Kontakt mit identischem Namen UND identischer E-Mail.
  function findExisting(p: ContactPerson): ContactRow | undefined {
    const name = rowName(p).trim().toLowerCase();
    const email = (p.email ?? "").trim().toLowerCase();
    if (!name || !email) return undefined; // Kriterium ist Name + E-Mail
    return allContacts.find((c) => {
      const cEmails = (c.emails ?? []).map((e) => e.value.trim().toLowerCase());
      return rowName(c).trim().toLowerCase() === name && cEmails.includes(email);
    });
  }

  function selectExisting(id: string) {
    setLinkedContactId(id);
    setDupError("");
    const c = allContacts.find((x) => x.id === id);
    if (!c) {
      setForm((f) => ({ ...f, contact_id: null }));
      return;
    }
    setForm((f) => ({
      ...f,
      contact_id: c.id,
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      email: c.emails?.[0]?.value ?? f.email,
      phones: c.phones && c.phones.length ? c.phones.map((p) => ({ ...p })) : f.phones,
    }));
  }

  function openAdd() {
    setForm(emptyPerson());
    setEditIndex(null);
    setLinkedContactId("");
    setDupError("");
    setAddOpen(true);
    ensureContacts();
  }

  function openEdit(i: number) {
    setForm({ ...persons[i], phones: persons[i].phones.map(p => ({ ...p })) });
    setEditIndex(i);
    setLinkedContactId("");
    setDupError("");
    setAddOpen(true);
  }

  function cancel() {
    setAddOpen(false);
    setEditIndex(null);
    setLinkedContactId("");
    setDupError("");
  }

  async function save() {
    if (!form.first_name.trim() && !form.last_name.trim()) return;
    const isNew = editIndex === null;

    // contact_id des Ansprechpartners bestimmen (bestehend, verknüpft oder neu).
    let personContactId: string | null = form.contact_id ?? null;

    if (isNew) {
      if (linkedContactId) {
        personContactId = linkedContactId;
      } else {
        // Prüfen, ob bereits ein Kontakt mit gleichem Namen + E-Mail existiert.
        // Falls ja, keinen Doppel-Kontakt anlegen, sondern zur Auswahl auffordern.
        const existing = findExisting(form);
        if (existing) {
          setLinkedContactId(existing.id);
          setDupError(
            "Ein Kontakt mit diesem Namen und dieser E-Mail existiert bereits und wurde oben ausgewählt. Zum Verknüpfen erneut auf „Speichern“ klicken."
          );
          return;
        }
        // Name + E-Mail sind neu → eigenständigen Kontakt anlegen und dessen ID übernehmen.
        setSaving(true);
        const contactRes = await createContactFromPerson(form);
        if (contactRes.ok) {
          const created = await contactRes.json().catch(() => null);
          personContactId = created?.id ?? null;
          setContactsLoaded(false); // neuen Kontakt beim nächsten Öffnen berücksichtigen
        } else {
          alert("Der zugehörige Kontakt konnte nicht angelegt werden. Ansprechpartner wird ohne Verknüpfung gespeichert.");
        }
      }
    }

    setSaving(true);
    const personToSave: ContactPerson = { ...form, contact_id: personContactId };
    const next = [...persons];
    if (editIndex !== null) {
      next[editIndex] = personToSave;
    } else {
      next.push(personToSave);
    }
    const res = await savePatch(contactId, next);
    if (res.ok) {
      onChange();
      cancel();
    }
    setSaving(false);
  }

  async function remove(i: number) {
    if (!confirm("Ansprechpartner löschen?")) return;
    const next = persons.filter((_, idx) => idx !== i);
    await savePatch(contactId, next);
    onChange();
  }

  function addPhone() {
    setForm(f => ({ ...f, phones: [...f.phones, { type: "landline", value: "" }] }));
  }

  function updatePhone(i: number, field: "type" | "value", val: string) {
    setForm(f => {
      const phones = f.phones.map((p, idx) => idx === i ? { ...p, [field]: val } : p);
      return { ...f, phones };
    });
  }

  function removePhone(i: number) {
    setForm(f => ({ ...f, phones: f.phones.filter((_, idx) => idx !== i) }));
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <UserRound className="w-4 h-4 text-gray-400" />
          Ansprechpartner ({persons.length})
        </h3>
        {!addOpen && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            Hinzufügen
          </button>
        )}
      </div>

      {/* Form */}
      {addOpen && (
        <div className="mb-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-3">
          {editIndex === null && (
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">
                Bestehenden Kontakt auswählen (optional)
              </label>
              <Combobox
                value={linkedContactId}
                onChange={selectExisting}
                options={allContacts.map((c) => ({
                  value: c.id,
                  label: rowName(c) + (c.emails?.[0]?.value ? ` · ${c.emails[0].value}` : ""),
                }))}
                placeholder="Kontakt suchen…"
                emptyLabel={contactsLoaded ? "Keine Treffer" : "Lädt…"}
              />
              <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                Leer lassen, um einen neuen Kontakt anzulegen – ein bestehender wird bei gleichem Namen &amp; E-Mail automatisch erkannt.
              </p>
            </div>
          )}
          {dupError && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-md px-2.5 py-1.5">
              {dupError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.first_name}
              onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              placeholder="Vorname"
              className={inputCls}
            />
            <input
              value={form.last_name}
              onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
              placeholder="Nachname"
              className={inputCls}
            />
          </div>
          <input
            value={form.position ?? ""}
            onChange={e => setForm(f => ({ ...f, position: e.target.value || null }))}
            placeholder="Funktion / Position (z.B. Geschäftsführer)"
            className={inputCls}
          />
          <input
            type="email"
            value={form.email ?? ""}
            onChange={e => setForm(f => ({ ...f, email: e.target.value || null }))}
            placeholder="E-Mail-Adresse"
            className={inputCls}
          />
          {form.phones.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                value={p.type}
                onChange={e => updatePhone(i, "type", e.target.value)}
                className="text-sm rounded-lg border border-gray-200 bg-white px-2 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 flex-shrink-0"
              >
                {PHONE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                value={p.value}
                onChange={e => updatePhone(i, "value", e.target.value)}
                placeholder="Telefonnummer"
                className={`${inputCls} flex-1`}
              />
              <button onClick={() => removePhone(i)} className="p-1 text-gray-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            onClick={addPhone}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-600 dark:hover:text-orange-400"
          >
            <Plus className="w-3.5 h-3.5" />
            Telefon hinzufügen
          </button>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={cancel}
              className="px-3 py-1.5 text-xs rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Abbrechen
            </button>
            <button
              onClick={save}
              disabled={saving || (!form.first_name.trim() && !form.last_name.trim())}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Speichern
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {persons.length === 0 && !addOpen ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">
          Keine Ansprechpartner eingetragen
        </p>
      ) : (
        <div className="space-y-3">
          {persons.map((p, i) => (
            <div key={i} className="group flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
              <div className="min-w-0 space-y-1">
                {p.contact_id ? (
                  <Link
                    href={`/kontakte/${p.contact_id}`}
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-orange-600 dark:hover:text-orange-400"
                  >
                    <span className="truncate">
                      {[p.first_name, p.last_name].filter(Boolean).join(" ") || "–"}
                    </span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0 text-gray-400" />
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") || "–"}
                  </p>
                )}
                {p.position && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">{p.position}</p>
                )}
                {p.email && (
                  <a
                    href={`mailto:${p.email}`}
                    className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400"
                  >
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    {p.email}
                  </a>
                )}
                {p.phones.map((ph, j) => (
                  <div key={j} className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <a
                      href={`tel:${ph.value}`}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400"
                    >
                      {ph.value}
                    </a>
                    <span className="text-xs text-gray-300 dark:text-gray-600">
                      {PHONE_TYPES.find(t => t.value === ph.type)?.label}
                    </span>
                    {ph.value && (
                      <CallButton phoneNumber={ph.value} contactId={contactId} />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => openEdit(i)}
                  className="p-1 rounded text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => remove(i)}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
