import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();
  const { searchParams } = request.nextUrl;
  const userId = searchParams.get("user_id") ?? user.id;
  const periodType = searchParams.get("period_type") ?? "monthly";
  const periodStart = searchParams.get("period_start");
  let q = supabase.from("sales_targets").select("*").eq("user_id", userId).eq("period_type", periodType).order("period_start", { ascending: false });
  if (periodStart) q = q.eq("period_start", periodStart);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { supabase, user, tenantId } = await withAuth();
  if (!supabase || !user || !tenantId) return unauthorized();
  const body = await request.json();
  const { data, error } = await supabase.from("sales_targets").upsert({
    tenant_id: tenantId,
    user_id: body.user_id ?? user.id,
    period_type: body.period_type,
    period_start: body.period_start,
    target_qualified_leads: body.target_qualified_leads ?? null,
    target_demo_bookings: body.target_demo_bookings ?? null,
    target_demo_show_ups: body.target_demo_show_ups ?? null,
    target_new_customers: body.target_new_customers ?? null,
    target_revenue_eur: body.target_revenue_eur ?? null,
    target_mrr_eur: body.target_mrr_eur ?? null,
    target_win_rate: body.target_win_rate ?? null,
    cac_eur: body.cac_eur ?? null,
  }, { onConflict: "tenant_id,user_id,period_type,period_start" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
