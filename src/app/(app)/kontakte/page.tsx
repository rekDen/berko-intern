"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, Loader2, Users, Globe, Pencil, Trash2 } from "lucide-react";
import { type RoleType, contactDisplayName } from "@/types/crm";
import PersonAvatar from "@/components/crm/PersonAvatar";
import RoleChip from "@/components/crm/RoleChip";
import Checkbox from "@/components/Checkbox";
import Combobox from "@/components/Combobox";

type ContactRow = {
  id: string;
  type: "natural_person" | "legal_entity";
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  emails: { type: string; value: string }[];
  phones: { type: string; value: string }[];
  website: string | null;
  owner_id: string | null;
  owner: { name: string; initials: string | null } | null;
  language: string;
  lead_source: string | null;
  created_at: string;
};


const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Alle Kategorien" },
  { value: "Hausverwaltung", label: "Hausverwaltung" },
  { value: "Anwaltskanzlei", label: "Anwaltskanzlei" },
  { value: "Handwerksbetrieb", label: "Handwerksbetrieb" },
  { value: "Steuerberater", label: "Steuerberater" },
  { value: "Immobilienmakler", label: "Immobilienmakler" },
  { value: "Notar", label: "Notar" },
  { value: "Versicherungsmakler", label: "Versicherungsmakler" },
  { value: "Bauunternehmen", label: "Bauunternehmen" },
  { value: "Architekturbüro", label: "Architekturbüro" },
];

type TeamMember = { id: string; name: string };

export default function ContactListPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/team").then(r => r.ok ? r.json() : []).then(setTeamMembers);
  }, []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const someSelected = selected.size > 0 && selected.size < contacts.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    if (!confirm("Kontakt wirklich löschen?")) return;
    const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  async function handleBulkDelete() {
    const count = selected.size;
    if (!confirm(`${count} Kontakt${count > 1 ? "e" : ""} wirklich löschen?`)) return;
    setBulkDeleting(true);
    const res = await fetch("/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => !selected.has(c.id)));
      setSelected(new Set());
    }
    setBulkDeleting(false);
  }

  useEffect(() => {
    setSelected(new Set());
    setLoading(true);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      if (ownerFilter) params.set("owner_id", ownerFilter);

      const res = await fetch(`/api/contacts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
      setLoading(false);
    }, search ? 300 : 0);

    return () => clearTimeout(timerRef.current);
  }, [search, categoryFilter, ownerFilter]);

  return (
    <div className="min-h-screen px-6 py-8 max-w-7xl mx-auto bg-slate-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Kontakte</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60"
            >
              {bulkDeleting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Trash2 className="w-4 h-4" />}
              {selected.size} Kontakt{selected.size > 1 ? "e" : ""} löschen
            </button>
          )}
          <Link
            href="/kontakte/neu"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
              bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Neuer Kontakt
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Name, E-Mail, Firma suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white
              dark:bg-gray-900 dark:border-gray-800 dark:text-white
              placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
        </div>
        <Combobox
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={CATEGORY_OPTIONS.filter(o => o.value !== "")}
          placeholder="Alle Kategorien"
          allowClear
          className="sm:w-52"
        />
        <Combobox
          value={ownerFilter}
          onChange={setOwnerFilter}
          options={teamMembers.map(m => ({ value: m.id, label: m.name }))}
          placeholder="Verantwortliche Person"
          allowClear
          className="sm:w-52"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <Users className="w-12 h-12 mb-3" />
          <p className="text-sm">
            {search ? `Keine Ergebnisse für "${search}"` : "Noch keine Kontakte angelegt"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Name
                </th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  E-Mail
                </th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Telefon
                </th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Webseite
                </th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Typ
                </th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Verantwortlich
                </th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Leadquelle
                </th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const isChecked = selected.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className={`group border-b border-gray-50 dark:border-gray-800/50 transition-colors ${
                      isChecked
                        ? "bg-orange-50/60 dark:bg-orange-500/5"
                        : "hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
                    }`}
                  >
                    <td className="w-10 px-4 py-2.5">
                      <Checkbox checked={isChecked} onChange={() => toggleOne(c.id)} />
                    </td>
                    <td className="px-4 py-2.5 max-w-[220px]">
                      <Link
                        href={`/kontakte/${c.id}`}
                        className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                      >
                        <PersonAvatar
                          firstName={c.first_name}
                          lastName={c.last_name}
                          companyName={c.company_name}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 dark:text-gray-200 break-words">
                            {contactDisplayName(c)}
                          </p>
                          {(c as unknown as { _roles?: RoleType[] })._roles && (
                            <div className="flex gap-1 mt-0.5">
                              {(c as unknown as { _roles: RoleType[] })._roles.map((r) => (
                                <RoleChip key={r} role={r} />
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                      {c.emails?.[0]?.value ?? "–"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                      {c.phones?.[0]?.value ?? "–"}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.website ? (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate max-w-[180px]">
                            {c.website.replace(/^https?:\/\/(www\.)?/, "")}
                          </span>
                        </a>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {c.type === "legal_entity" ? "Firma" : "Person"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.owner ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                              {c.owner.initials ?? c.owner.name.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[140px]">
                            {c.owner.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      {c.lead_source ? (
                        <span className="inline-block text-xs text-gray-500 dark:text-gray-400 truncate max-w-full" title={c.lead_source}>
                          {c.lead_source}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">–</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.preventDefault(); router.push(`/kontakte/${c.id}/bearbeiten`); }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-orange-500 hover:bg-orange-50 dark:text-gray-400 dark:hover:text-orange-400 dark:hover:bg-orange-500/10 transition-colors"
                          title="Bearbeiten"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, c.id)}
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
  );
}
