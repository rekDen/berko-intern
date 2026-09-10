"use client";

import { useState } from "react";
import { Calendar, X, MapPin, Loader2, CheckCircle2, Plus, Trash2, Mail } from "lucide-react";
import Combobox from "@/components/Combobox";
import { contactDisplayName } from "@/types/crm";

export interface DeadlineFormState {
  title: string;
  type: "frist" | "termin";
  date: string;
  time: string;
  description: string;
  assigned_to: string;
  location: string;
  contact_id: string;
  invite_emails: string[];
}

export interface DeadlineDialogContact {
  id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
}

export interface DeadlineDialogTeamMember {
  id: string;
  name: string;
  title?: string | null;
}

export interface DeadlineDialogEditing {
  title: string;
  type: "frist" | "termin";
  date: string;
  time: string | null;
  description: string;
  assigned_to: string;
  location: string;
  contact_id: string | null;
  invite_emails?: string[] | null;
}

export function emptyDeadlineForm(): DeadlineFormState {
  return {
    title: "",
    type: "termin",
    date: new Date().toISOString().split("T")[0],
    time: "",
    description: "",
    location: "",
    assigned_to: "",
    contact_id: "",
    invite_emails: [],
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DeadlineDialog({
  editing,
  onSave,
  onClose,
  teamMembers,
  contacts,
  defaultContactId,
}: {
  editing: DeadlineDialogEditing | null;
  onSave: (form: DeadlineFormState) => Promise<void>;
  onClose: () => void;
  teamMembers: DeadlineDialogTeamMember[];
  contacts: DeadlineDialogContact[];
  defaultContactId?: string;
}) {
  const [form, setForm] = useState<DeadlineFormState>(
    editing
      ? {
          title: editing.title,
          type: editing.type,
          date: editing.date,
          time: editing.time ?? "",
          description: editing.description,
          assigned_to: editing.assigned_to,
          location: editing.location,
          contact_id: editing.contact_id ?? "",
          invite_emails: editing.invite_emails ?? [],
        }
      : { ...emptyDeadlineForm(), contact_id: defaultContactId ?? "" }
  );
  const [saving, setSaving] = useState(false);
  const [inviteInput, setInviteInput] = useState("");

  function set<K extends keyof DeadlineFormState>(key: K, value: DeadlineFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addInvite() {
    const email = inviteInput.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return;
    if (form.invite_emails.includes(email)) {
      setInviteInput("");
      return;
    }
    set("invite_emails", [...form.invite_emails, email]);
    setInviteInput("");
  }

  function removeInvite(email: string) {
    set("invite_emails", form.invite_emails.filter((e) => e !== email));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    try {
      // Falls noch ein gültiger Wert im Eingabefeld steht, mit aufnehmen
      const pending = inviteInput.trim().toLowerCase();
      const emails =
        EMAIL_RE.test(pending) && !form.invite_emails.includes(pending)
          ? [...form.invite_emails, pending]
          : form.invite_emails;
      await onSave({ ...form, invite_emails: emails });
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg border transition-colors " +
    "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-500/50 " +
    "dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl border bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {editing ? "Eintrag bearbeiten" : "Neuer Eintrag"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Typ */}
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Typ</label>
            <div className="flex gap-2">
              {(["termin", "frist"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("type", t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === t
                      ? t === "frist"
                        ? "bg-red-500/15 border-red-400/40 text-red-600 dark:text-red-400"
                        : "bg-blue-500/15 border-blue-400/40 text-blue-600 dark:text-blue-400"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                  }`}
                >
                  {t === "frist" ? "Frist" : "Termin"}
                </button>
              ))}
            </div>
          </div>

          {/* Titel */}
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">
              Titel <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
              placeholder="z.B. Objektbesichtigung Musterstraße 1"
              className={inputCls}
            />
          </div>

          {/* Datum + Uhrzeit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">
                Datum <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">
                Uhrzeit <span className="text-gray-300 dark:text-gray-600">(optional)</span>
              </label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Mitarbeiter */}
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Zuständig</label>
            <select
              value={form.assigned_to}
              onChange={(e) => set("assigned_to", e.target.value)}
              className={inputCls}
            >
              <option value="">— Nicht zugewiesen —</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Bezogener Kontakt */}
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">
              Bezogener Kontakt <span className="text-gray-300 dark:text-gray-600">(optional)</span>
            </label>
            <Combobox
              value={form.contact_id}
              onChange={(v) => set("contact_id", v)}
              options={contacts.map((c) => ({ value: c.id, label: contactDisplayName(c) }))}
              placeholder="Kontakt suchen…"
              emptyLabel="Kein Kontakt gefunden"
              allowClear
            />
          </div>

          {/* Ort — nur bei Termin */}
          {form.type === "termin" && (
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Ort</label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="z.B. Musterstraße 1, 04109 Leipzig"
                  className={inputCls.replace("px-3", "pl-8 pr-3")}
                />
              </div>
            </div>
          )}

          {/* Eingeladene Personen */}
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">
              Personen einladen <span className="text-gray-300 dark:text-gray-600">(optional)</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addInvite();
                    }
                  }}
                  placeholder="name@beispiel.de"
                  className={inputCls.replace("px-3", "pl-8 pr-3")}
                />
              </div>
              <button
                type="button"
                onClick={addInvite}
                disabled={!EMAIL_RE.test(inviteInput.trim())}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border
                  border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400
                  dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {form.invite_emails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.invite_emails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs
                      bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeInvite(email)}
                      className="p-0.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-500/25"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {form.invite_emails.length > 0 && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                Die eingeladenen Personen erhalten eine E-Mail mit Kalender-Einladung (.ics).
              </p>
            )}
          </div>

          {/* Beschreibung */}
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Beschreibung</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="Optionale Notizen..."
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !form.title.trim() || !form.date}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-opacity
                bg-gradient-to-r from-indigo-500 to-cyan-500 text-white hover:opacity-90
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {saving ? "Speichert..." : editing ? "Speichern" : "Erstellen"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors
                border-gray-200 text-gray-600 hover:bg-gray-100
                dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
