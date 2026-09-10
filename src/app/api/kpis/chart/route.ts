import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

type Granularity = "day" | "month";

function generateBuckets(rangeStart: string, rangeEnd: string, granularity: Granularity) {
  const buckets: { start: string; end: string; label: string }[] = [];

  if (granularity === "day") {
    const cur = new Date(rangeStart + "T12:00:00");
    const end = new Date(rangeEnd + "T12:00:00");
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      buckets.push({
        start: dateStr,
        end: dateStr,
        label: cur.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }),
      });
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    let [year, month] = rangeStart.split("-").map(Number);
    const [endYear, endMonth] = rangeEnd.split("-").map(Number);
    while (year < endYear || (year === endYear && month <= endMonth)) {
      const ms = `${year}-${String(month).padStart(2, "0")}`;
      const lastDay = new Date(year, month, 0).getDate();
      buckets.push({
        start: `${ms}-01`,
        end: `${ms}-${String(lastDay).padStart(2, "0")}`,
        label: new Date(`${ms}-15`).toLocaleDateString("de-DE", { month: "short" }),
      });
      if (month === 12) { month = 1; year++; } else { month++; }
    }
  }

  return buckets;
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const userId = searchParams.get("user_id") ?? user.id;
  const isAll = userId === "all";
  const rangeStart = searchParams.get("range_start") ?? "";
  const rangeEnd = searchParams.get("range_end") ?? "";
  const granularity = (searchParams.get("granularity") ?? "day") as Granularity;

  if (!rangeStart || !rangeEnd) {
    return NextResponse.json({ error: "range_start and range_end required" }, { status: 400 });
  }

  let activitiesQuery = supabase
    .from("activities")
    .select("type, performed_at")
    .gte("performed_at", rangeStart)
    .lte("performed_at", rangeEnd + "T23:59:59");
  if (!isAll) activitiesQuery = activitiesQuery.eq("user_id", userId);

  let contractsQuery = supabase
    .from("contracts")
    .select("qualified_at, demo_booked_at, demo_happened_at, won_at, lost_at, amount, mrr_value")
    .is("deleted_at", null);
  if (!isAll) contractsQuery = contractsQuery.eq("owner_id", userId);

  const [activitiesRes, contractsRes] = await Promise.all([activitiesQuery, contractsQuery]);

  const acts = activitiesRes.data ?? [];
  const deals = contractsRes.data ?? [];
  const buckets = generateBuckets(rangeStart, rangeEnd, granularity);

  const result = buckets.map(({ start, end, label }) => {
    const bucketActs = acts.filter(a => {
      const d = a.performed_at.slice(0, 10);
      return d >= start && d <= end;
    });

    const inBucket = (ts: string | null) => {
      if (!ts) return false;
      const d = ts.slice(0, 10);
      return d >= start && d <= end;
    };

    const wonInBucket = deals.filter(d => inBucket(d.won_at));

    return {
      date: start,
      label,
      calls: bucketActs.filter(a => a.type === "call").length,
      meetingsOnsite: bucketActs.filter(a => a.type === "meeting").length,
      meetingsOnline: bucketActs.filter(a => a.type === "online_meeting").length,
      qualifiedLeads: deals.filter(d => inBucket(d.qualified_at)).length,
      demoBooked: deals.filter(d => inBucket(d.demo_booked_at)).length,
      demoHappened: deals.filter(d => inBucket(d.demo_happened_at)).length,
      wonDeals: wonInBucket.length,
      lostDeals: deals.filter(d => inBucket(d.lost_at)).length,
      mrrNew: wonInBucket.reduce((s, d) => s + (d.mrr_value ?? 0), 0),
      revenue: wonInBucket.reduce((s, d) => s + (d.amount ?? 0), 0),
    };
  });

  return NextResponse.json({ buckets: result });
}
