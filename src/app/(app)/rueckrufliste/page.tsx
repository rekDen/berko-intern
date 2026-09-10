"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PhoneIncoming, RefreshCw, UserCheck, Building2, User, AlertCircle } from "lucide-react";

interface CallLogEntry {
  sid: string;
  from: string;
  caller_name: string | null;
  start_time: string;
  end_time: string | null;
  duration_seconds: number;
  status: string;
  contact: { id: string; name: string } | null;
  contact_person: { name: string; position: string | null } | null;
  match_type: "exact" | "prefix" | null;
}

const STATUS_LABELS: Record<string, { label: string; classes: string }> = {
  completed:   { label: "Geführt",      classes: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  "no-answer": { label: "Nicht angenommen", classes: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  busy:        { label: "Besetzt",      classes: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  failed:      { label: "Fehlgeschlagen", classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  canceled:    { label: "Abgebrochen",  classes: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" },
  ringing:     { label: "Klingelt",     classes: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  "in-progress": { label: "Aktiv",     classes: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
};

function formatDuration(seconds: number): string {
  if (!seconds) return "–";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} Sek`;
  return `${m} Min ${s > 0 ? s + " Sek" : ""}`.trim();
}

function formatDateTime(raw: string): string {
  try {
    return new Date(raw).toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return raw;
  }
}

function formatNumber(raw: string): string {
  // Display as-is but clean up formatting
  return raw || "–";
}

export default function RueckruflistePage() {
  const [entries, setEntries] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMatched, setFilterMatched] = useState<"all" | "matched" | "unmatched">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/twilio/call-log");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Fehler beim Laden");
      }
      setEntries(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter((e) => {
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (filterMatched === "matched" && !e.contact) return false;
    if (filterMatched === "unmatched" && e.contact) return false;
    return true;
  });

  const uniqueStatuses = [...new Set(entries.map((e) => e.status))].sort();

  const needsCallback = entries.filter(
    (e) => (e.status === "no-answer" || e.status === "busy") && e.contact
  ).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PhoneIncoming className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rückrufliste</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Eingehende Anrufe auf +49 30 75678957
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Gesamt" value={entries.length} color="indigo" />
          <StatCard
            label="Rückruf ausstehend"
            value={needsCallback}
            color="orange"
          />
          <StatCard
            label="Erkannte Kontakte"
            value={entries.filter((e) => e.contact).length}
            color="green"
          />
          <StatCard
            label="Unbekannt"
            value={entries.filter((e) => !e.contact).length}
            color="gray"
          />
        </div>
      )}

      {/* Filters */}
      {!error && (
        <div className="flex flex-wrap gap-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Alle Status</option>
            {uniqueStatuses.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]?.label ?? s}</option>
            ))}
          </select>
          <select
            value={filterMatched}
            onChange={(e) => setFilterMatched(e.target.value as typeof filterMatched)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Alle Anrufer</option>
            <option value="matched">Erkannte Kontakte</option>
            <option value="unmatched">Unbekannte Nummern</option>
          </select>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Datum / Uhrzeit
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Anrufer
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Dauer
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">
                    Kontakt
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">
                    Ansprechpartner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                      Keine Einträge gefunden
                    </td>
                  </tr>
                ) : (
                  filtered.map((entry) => {
                    const statusInfo = STATUS_LABELS[entry.status];
                    const needsCall = entry.status === "no-answer" || entry.status === "busy";
                    return (
                      <tr
                        key={entry.sid}
                        className={`${
                          needsCall
                            ? "bg-orange-50/40 dark:bg-orange-900/10"
                            : "bg-white dark:bg-gray-900"
                        } hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`}
                      >
                        {/* Date / Time */}
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                          {formatDateTime(entry.start_time)}
                        </td>

                        {/* Caller number */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {needsCall && (
                              <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" title="Rückruf ausstehend" />
                            )}
                            <span className="font-mono text-gray-900 dark:text-white">
                              {formatNumber(entry.from)}
                            </span>
                            {entry.caller_name && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({entry.caller_name})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Duration */}
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                          {formatDuration(entry.duration_seconds)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              statusInfo?.classes ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                            }`}
                          >
                            {statusInfo?.label ?? entry.status}
                          </span>
                        </td>

                        {/* Contact */}
                        <td className="px-4 py-3">
                          {entry.contact ? (
                            <div className="flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                              <Link
                                href={`/kontakte/${entry.contact.id}`}
                                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                              >
                                {entry.contact.name}
                              </Link>
                              {entry.match_type === "prefix" && (
                                <span
                                  className="text-xs text-gray-400 dark:text-gray-500"
                                  title="Treffer über Rufnummernpräfix (letzten 4 Stellen abweichend)"
                                >
                                  ~
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-600 text-xs">Unbekannt</span>
                          )}
                        </td>

                        {/* Contact Person */}
                        <td className="px-4 py-3">
                          {entry.contact_person ? (
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300">
                                {entry.contact_person.name}
                              </span>
                              {entry.contact_person.position && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  · {entry.contact_person.position}
                                </span>
                              )}
                            </div>
                          ) : entry.contact ? (
                            <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-600">
                              <Building2 className="w-3.5 h-3.5" />
                              <span className="text-xs">Direkt</span>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      {!loading && !error && filtered.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-600">
          <span className="font-medium">~</span> = Treffer über Rufnummernpräfix (gleicher Anschluss, Durchwahl abweichend)
          &nbsp;&nbsp;
          <span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1" />
          = Rückruf ausstehend
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: "text-indigo-600 dark:text-indigo-400",
    orange: "text-orange-600 dark:text-orange-400",
    green:  "text-green-600 dark:text-green-400",
    gray:   "text-gray-600 dark:text-gray-400",
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color] ?? colorMap.gray}`}>{value}</p>
    </div>
  );
}
