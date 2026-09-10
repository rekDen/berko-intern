"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ScrollText, Loader2, Search, X, Plus, FileText } from "lucide-react";
import { contactDisplayName } from "@/types/crm";

type ContactSnap = {
  id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

type ContractRow = {
  id: string;
  title: string | null;
  amount: number | null;
  currency: string | null;
  expected_close_date: string | null;
  created_at: string;
  contact_id: string | null;
  owner_id: string | null;
  created_by: string | null;
  contacts: ContactSnap | null;
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

export default function ContractListPage() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/contracts").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/team").then((r) => (r.ok ? r.json() : [])),
    ]).then(([contractData, teamData]) => {
      setContracts(contractData);
      setTeam(teamData);
      setLoading(false);
    });
  }, []);

  const teamById = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) => {
      const contactName = c.contacts ? contactDisplayName(c.contacts) : "";
      const company = c.contacts?.company_name ?? "";
      const ownerName = (c.owner_id ? teamById.get(c.owner_id)?.name : null)
        ?? (c.created_by ? teamById.get(c.created_by)?.name : null)
        ?? "";
      return [c.title, contactName, company, ownerName]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [contracts, search, teamById]);

  return (
    <div className="min-h-screen px-6 py-8 max-w-6xl mx-auto bg-slate-50 dark:bg-gray-950">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Verträge</h1>
        <Link
          href="/vertraege/neu"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Neuer Vertrag
        </Link>
      </div>

      {/* Suche */}
      <div className="relative flex-1 max-w-lg mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Titel, Kontakt, Firma, Nutzer…"
          className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          <ScrollText className="w-12 h-12 mb-3" />
          <p className="text-sm">{search ? "Keine Treffer" : "Keine Verträge gefunden"}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400">Titel</th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden sm:table-cell">Kontakt</th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden md:table-cell">Firma</th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden lg:table-cell">Nutzer</th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden md:table-cell">Betrag</th>
                <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden lg:table-cell">Abschluss</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const owner = (c.owner_id ? teamById.get(c.owner_id) : null)
                  ?? (c.created_by ? teamById.get(c.created_by) : null);
                const contactName = c.contacts ? contactDisplayName(c.contacts) : null;
                const company = c.contacts?.company_name ?? null;

                return (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-2.5">
                      <Link href={`/vertraege/${c.id}`} className="font-medium text-gray-800 dark:text-gray-200 hover:text-orange-600 dark:hover:text-orange-400">
                        {c.title ?? <span className="italic text-gray-400">Ohne Titel</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                      {contactName ? (
                        <Link href={`/kontakte/${c.contact_id}`} className="hover:text-orange-500 transition-colors">
                          {contactName}
                        </Link>
                      ) : "–"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      {company ?? "–"}
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      {owner ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                            {owner.initials ?? owner.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-sm text-gray-600 dark:text-gray-300">{owner.name}</span>
                        </span>
                      ) : <span className="text-gray-400">–</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      {fmt(c.amount, c.currency ?? "EUR")}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                      {fmtDate(c.expected_close_date)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/vertraege/${c.id}`} className="text-gray-400 hover:text-orange-500 transition-colors">
                        <FileText className="w-4 h-4" />
                      </Link>
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
