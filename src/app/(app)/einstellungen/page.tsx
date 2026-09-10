"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Check } from "lucide-react";

interface ProfileData {
  first_name: string;
  last_name: string;
  title: string;
  initials: string;
  firm_name: string;
  language: string;
  email: string | null;
}

export default function EinstellungenPage() {
  const [profile, setProfile] = useState<ProfileData>({
    first_name: "",
    last_name: "",
    title: "",
    initials: "",
    firm_name: "",
    language: "de",
    email: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        const fullName: string = data.name ?? "";
        const spaceIdx = fullName.indexOf(" ");
        const first = spaceIdx !== -1 ? fullName.slice(0, spaceIdx) : fullName;
        const last = spaceIdx !== -1 ? fullName.slice(spaceIdx + 1) : "";
        setProfile({
          first_name: first,
          last_name: last,
          title: data.title ?? "",
          initials: data.initials ?? "",
          firm_name: data.firm_name ?? "",
          language: data.language ?? "de",
          email: data.email ?? null,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fullName || null,
        title: profile.title || null,
        initials: profile.initials || null,
        firm_name: profile.firm_name || null,
        language: profile.language || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Fehler beim Speichern");
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  function field(
    label: string,
    key: keyof Omit<ProfileData, "email">,
    placeholder?: string,
    hint?: string
  ) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
        <input
          type="text"
          value={(profile[key] as string) ?? ""}
          onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Lade Einstellungen…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
          <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Einstellungen</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Profil und Account</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Account info */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Konto
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              E-Mail-Adresse
            </label>
            <input
              type="text"
              value={profile.email ?? ""}
              disabled
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700
                bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 text-sm cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field("Vorname", "first_name", "z.B. Max")}
            {field("Nachname", "last_name", "z.B. Mustermann")}
          </div>
          {field("Titel / Position", "title", "z.B. Vertriebsleiter, Inhaber", "Wird in der E-Mail-Signatur angezeigt")}
          {field(
            "Initialen",
            "initials",
            "z.B. DT",
            "Kürzel für den Avatar — wird automatisch aus dem Namen berechnet, wenn leer"
          )}
        </div>

        {/* Company */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Unternehmen
          </h2>
          {field("Firmenname", "firm_name", "z.B. Berko AI GmbH")}
        </div>

        {/* Save */}
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
              bg-indigo-600 hover:bg-indigo-700 text-white
              disabled:opacity-60 transition-colors"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                Gespeichert
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {saving ? "Wird gespeichert…" : "Speichern"}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
