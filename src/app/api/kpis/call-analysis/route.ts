import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

const CRITERIA = ["call_status", "call_result", "follow_up", "sentiment", "gatekeeper_bypassed"] as const;
type Criterion = typeof CRITERIA[number];

type Buckets = Record<Criterion, Record<string, number>>;

function emptyBuckets(): Buckets {
  return {
    call_status: {},
    call_result: {},
    follow_up: {},
    sentiment: {},
    gatekeeper_bypassed: {},
  };
}

type Agg = {
  total: number;
  durationSec: number;
  buckets: Buckets;
};

function newAgg(): Agg {
  return { total: 0, durationSec: 0, buckets: emptyBuckets() };
}

const NONE = "Ohne Angabe";

type DateBucket = { key: string; label: string };

// Erzeugt Zeit-Buckets (Tag oder Monat) für [start, end].
function generateDateBuckets(start: string, end: string, gran: "day" | "month"): DateBucket[] {
  const out: DateBucket[] = [];
  if (gran === "month") {
    let [y, m] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      out.push({ key, label: new Date(`${key}-15`).toLocaleDateString("de-DE", { month: "short", year: "2-digit" }) });
      if (m === 12) { m = 1; y++; } else { m++; }
    }
    return out;
  }
  const cur = new Date(start + "T12:00:00");
  const last = new Date(end + "T12:00:00");
  while (cur <= last) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    out.push({ key, label: cur.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function bucketKeyFor(occurredAt: string, gran: "day" | "month"): string {
  return gran === "month" ? occurredAt.slice(0, 7) : occurredAt.slice(0, 10);
}

// GET /api/kpis/call-analysis?range_start=YYYY-MM-DD&range_end=YYYY-MM-DD
// Auswertung der Anrufliste, pro Nutzer + gesamt. Ohne Range = gesamte Liste.
export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const rangeStart = searchParams.get("range_start");
  const rangeEnd = searchParams.get("range_end");
  const granularity = searchParams.get("granularity") === "month" ? "month" : "day";

  // Tenant-weite Telefon-Kommunikation (SELECT ist über RLS auf den Tenant beschränkt).
  let query = supabase
    .from("communications")
    .select("created_by, occurred_at, duration_seconds, call_status, call_result, follow_up, sentiment, gatekeeper_bypassed")
    .eq("channel", "phone");

  if (rangeStart) query = query.gte("occurred_at", rangeStart);
  if (rangeEnd) query = query.lte("occurred_at", rangeEnd + "T23:59:59");

  const { data: rows, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const calls = rows ?? [];

  // Namen der Nutzer auflösen
  const userIds = [...new Set(calls.map((c) => c.created_by).filter(Boolean) as string[])];
  const nameMap: Record<string, string> = {};
  if (userIds.length) {
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles").select("id, name").in("id", userIds);
    for (const p of profiles ?? []) nameMap[p.id] = p.name ?? "Unbekannt";
  }

  const total = newAgg();
  const perUser = new Map<string, Agg>();

  function record(agg: Agg, row: typeof calls[number]) {
    agg.total += 1;
    agg.durationSec += row.duration_seconds ?? 0;
    for (const crit of CRITERIA) {
      const raw = (row[crit] as string | null) ?? null;
      const key = raw && String(raw).trim() ? String(raw) : NONE;
      agg.buckets[crit][key] = (agg.buckets[crit][key] ?? 0) + 1;
    }
  }

  for (const row of calls) {
    record(total, row);
    const uid = (row.created_by as string) ?? "__none__";
    if (!perUser.has(uid)) perUser.set(uid, newAgg());
    record(perUser.get(uid)!, row);
  }

  const users = [...perUser.entries()]
    .map(([uid, agg]) => ({
      user_id: uid,
      name: nameMap[uid] ?? "Unbekannt",
      ...agg,
    }))
    .sort((a, b) => b.total - a.total);

  // Pro Datum: wer wieviele Anrufe — nur wenn ein Zeitraum gewählt ist
  let byDate: { key: string; label: string; total: number; counts: Record<string, number> }[] = [];
  if (rangeStart && rangeEnd) {
    const buckets = generateDateBuckets(rangeStart, rangeEnd, granularity);
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    const rowsOut = buckets.map((b) => ({ key: b.key, label: b.label, total: 0, counts: {} as Record<string, number> }));
    for (const call of calls) {
      if (!call.occurred_at) continue;
      const key = bucketKeyFor(call.occurred_at as string, granularity);
      const i = index.get(key);
      if (i === undefined) continue;
      const uid = (call.created_by as string) ?? "__none__";
      rowsOut[i].counts[uid] = (rowsOut[i].counts[uid] ?? 0) + 1;
      rowsOut[i].total += 1;
    }
    byDate = rowsOut;
  }

  return NextResponse.json({ total, users, byDate });
}
