"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  Star,
  MapPin,
  UserPlus,
  Check,
  Loader2,
  ExternalLink,
  Globe,
} from "lucide-react";
import Combobox from "@/components/Combobox";
import { CITY_OPTIONS, getDistrictOptions, getStadtteilOptions } from "@/data/german-cities";

type SearchResult = {
  place_id: string;
  name: string;
  address: string;
  types: string[];
  rating: number | null;
  user_ratings_total: number;
  website?: string | null;
};

type ImportState = { state: "idle" | "loading" | "done" | "error"; contactId?: string };

const CATEGORIES = [
  "Hausverwaltung",
  "Anwaltskanzlei",
  "Handwerksbetrieb",
  "Steuerberater",
  "Immobilienmakler",
  "Notar",
  "Versicherungsmakler",
  "Bauunternehmen",
  "Architekturbüro",
];

const TYPE_LABELS: Record<string, string> = {
  lawyer: "Anwalt",
  real_estate_agency: "Immobilien",
  accounting: "Buchhaltung",
  insurance_agency: "Versicherung",
  general_contractor: "Bauunternehmen",
  electrician: "Elektriker",
  plumber: "Klempner",
  roofing_contractor: "Dachdecker",
  painter: "Maler",
  store: "Geschäft",
  finance: "Finanzen",
  lodging: "Unterkunft",
};

function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t.replace(/_/g, " ");
}

const inputCls =
  "text-sm rounded-xl border border-gray-200 bg-white px-4 py-2.5 dark:bg-gray-900 dark:border-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 placeholder:text-gray-400";

export default function AkquisitionPage() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [stadtteil, setStadtteil] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [importStates, setImportStates] = useState<Record<string, ImportState>>({});

  const districtOptions = getDistrictOptions(city);
  const stadtteilOptions = getStadtteilOptions(city, district);

  async function fetchPage(token?: string): Promise<{ results: SearchResult[]; next_page_token: string | null }> {
    const location = [city, district, stadtteil].filter(Boolean).join(" ");
    const params = new URLSearchParams({ q: query.trim(), city: location });
    if (token) params.set("pagetoken", token);
    const res = await fetch(`/api/akquisition/search?${params}`);
    if (!res.ok) return { results: [], next_page_token: null };
    const data = await res.json();
    return { results: data.results ?? [], next_page_token: data.next_page_token ?? null };
  }

  async function enrichWithWebsites(items: SearchResult[]) {
    const BATCH = 10;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (item) => {
          try {
            const res = await fetch(`/api/akquisition/details?place_id=${item.place_id}`);
            if (!res.ok) return;
            const data = await res.json();
            setResults((prev) =>
              prev.map((r) => (r.place_id === item.place_id ? { ...r, website: data.website ?? null } : r))
            );
          } catch {
            // ignore individual failures
          }
        })
      );
    }
  }

  async function checkExisting(items: SearchResult[]) {
    const ids = items.map((r) => r.place_id).join(",");
    const res = await fetch(`/api/akquisition/check-existing?ids=${ids}`);
    if (!res.ok) return;
    const existing: Record<string, string> = await res.json();
    if (Object.keys(existing).length === 0) return;
    setImportStates((prev) => {
      const next = { ...prev };
      for (const [placeId, contactId] of Object.entries(existing)) {
        if (!next[placeId] || next[placeId].state === "idle") {
          next[placeId] = { state: "done", contactId };
        }
      }
      return next;
    });
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    setImportStates({});

    const { results: page1, next_page_token: token2 } = await fetchPage();
    setResults(page1);
    setHasSearched(true);
    setSearching(false);
    enrichWithWebsites(page1);
    checkExisting(page1);

    if (!token2) return;

    // Auto-load remaining pages (Google allows up to 3 pages = 60 results total)
    setLoadingMore(true);
    // Google requires a short delay before the pagetoken becomes active
    await new Promise((r) => setTimeout(r, 2000));
    const { results: page2, next_page_token: token3 } = await fetchPage(token2);
    setResults((prev) => [...prev, ...page2]);
    enrichWithWebsites(page2);
    checkExisting(page2);

    if (token3) {
      await new Promise((r) => setTimeout(r, 2000));
      const { results: page3 } = await fetchPage(token3);
      setResults((prev) => [...prev, ...page3]);
      enrichWithWebsites(page3);
      checkExisting(page3);
    }

    setLoadingMore(false);
  }

  async function importAsContact(result: SearchResult) {
    setImportStates((prev) => ({ ...prev, [result.place_id]: { state: "loading" } }));

    try {
      const detailsRes = await fetch(`/api/akquisition/details?place_id=${result.place_id}`);
      if (!detailsRes.ok) throw new Error();
      const details = await detailsRes.json();

      const website = result.website ?? details.website ?? null;
      const hasAddress = details.address?.city;
      const matchedCategory = CATEGORIES.includes(query.trim()) ? query.trim() : null;
      const contactBody = {
        type: "legal_entity",
        company_name: result.name,
        phones: details.phone ? [{ type: "landline", value: details.phone }] : [],
        addresses: hasAddress
          ? [
              {
                type: "postal",
                street: details.address.street || "",
                house_number: details.address.house_number || "",
                zip_code: details.address.zip_code || "",
                city: details.address.city || "",
                country: details.address.country || "Deutschland",
              },
            ]
          : [],
        website: website,
        category: matchedCategory,
        lead_source: `Leadsuche · Google Places API${query.trim() ? ` · ${query.trim()}` : ""}${city ? ` · ${[city, district, stadtteil].filter(Boolean).join(", ")}` : ""}`,
        notes: [
          "Via Akquise-Suche importiert.",
          `[place_id:${result.place_id}]`,
          !hasAddress && details.formatted_address ? `Adresse: ${details.formatted_address}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      };

      const contactRes = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactBody),
      });
      if (!contactRes.ok) throw new Error();
      const contact = await contactRes.json();

      setImportStates((prev) => ({
        ...prev,
        [result.place_id]: { state: "done", contactId: contact.id },
      }));
    } catch {
      setImportStates((prev) => ({
        ...prev,
        [result.place_id]: { state: "error" },
      }));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 px-6 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Lead-Suche</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Finde deutschlandweit passende Unternehmen und füge sie direkt als Kontakt hinzu.
          </p>
        </div>

        {/* Search card */}
        <div className="rounded-2xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-6 mb-6">
          {/* Category chips */}
          <div className="flex flex-wrap gap-2 mb-5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setQuery(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  query === cat
                    ? "bg-orange-500 border-orange-500 text-white"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-orange-400 hover:text-orange-600 dark:hover:text-orange-400"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Inputs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="Branche oder Unternehmenstyp…"
              className={`${inputCls} flex-1`}
            />
            <Combobox
              value={city}
              onChange={(v) => { setCity(v); setDistrict(""); setStadtteil(""); }}
              options={CITY_OPTIONS}
              placeholder="Stadt wählen…"
              emptyLabel="Keine Stadt gefunden"
              allowClear
              className="sm:w-52"
            />
            {city && districtOptions.length > 0 && (
              <Combobox
                value={district}
                onChange={(v) => { setDistrict(v); setStadtteil(""); }}
                options={districtOptions}
                placeholder="Bezirk (optional)…"
                emptyLabel="Kein Bezirk gefunden"
                allowClear
                className="sm:w-52"
              />
            )}
            {district && stadtteilOptions.length > 0 && (
              <Combobox
                value={stadtteil}
                onChange={setStadtteil}
                options={stadtteilOptions}
                placeholder="Stadtteil (optional)…"
                emptyLabel="Kein Stadtteil gefunden"
                allowClear
                className="sm:w-52"
              />
            )}
            <button
              onClick={search}
              disabled={!query.trim() || searching}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                bg-orange-500 text-white hover:bg-orange-600 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Suchen
            </button>
          </div>
        </div>

        {/* Results */}
        {hasSearched && (
          <>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-2">
              {results.length} Ergebnisse{city ? ` in ${[city, district, stadtteil].filter(Boolean).join(", ")}` : " · Deutschlandweit"}
              {loadingMore && (
                <span className="flex items-center gap-1 text-orange-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Lade weitere…
                </span>
              )}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((result) => {
                const imp = importStates[result.place_id] ?? { state: "idle" };
                return (
                  <div
                    key={result.place_id}
                    className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug truncate">
                          {result.name}
                        </h3>
                        {result.rating && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {result.rating.toFixed(1)}{" "}
                              <span className="text-gray-400">({result.user_ratings_total})</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {imp.state === "done" ? (
                        <Link
                          href={`/kontakte/${imp.contactId}`}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors flex-shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Hinzugefügt
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </Link>
                      ) : imp.state === "error" ? (
                        <button
                          onClick={() => importAsContact(result)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25 transition-colors flex-shrink-0"
                        >
                          Erneut versuchen
                        </button>
                      ) : (
                        <button
                          onClick={() => importAsContact(result)}
                          disabled={imp.state === "loading"}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            bg-indigo-600 text-white hover:bg-indigo-700 transition-colors
                            disabled:opacity-60 flex-shrink-0"
                        >
                          {imp.state === "loading" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="w-3.5 h-3.5" />
                          )}
                          Als Kontakt
                        </button>
                      )}
                    </div>

                    <div className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{result.address}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <Globe className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                      {result.website === undefined ? (
                        <span className="text-gray-300 dark:text-gray-600 italic">Lädt…</span>
                      ) : result.website ? (
                        <a
                          href={result.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 truncate max-w-[220px]"
                        >
                          {result.website.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600">Keine Website</span>
                      )}
                    </div>

                    {result.types.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.types.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                          >
                            {typeLabel(t)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                <Search className="w-10 h-10 mb-3" />
                <p className="text-sm">Keine Ergebnisse gefunden</p>
                <p className="text-xs mt-1">Versuche einen anderen Suchbegriff oder eine andere Stadt</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
