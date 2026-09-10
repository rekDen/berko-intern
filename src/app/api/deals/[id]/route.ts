import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { id } = await params;

  const { data, error } = await supabase
    .from("contracts")
    .select(`
      id, title, description, deal_status, priority, amount, currency, probability,
      expected_close_date, actual_close_date, source, source_campaign, referral_contact_id,
      lost_reason, lost_to_competitor, lost_notes, last_activity_at, next_activity_at,
      forecast_category, owner_id, contact_id, notes, created_at
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const allowed = [
    "deal_status",
    "title", "description",
    "contact_id", "owner_id",
    "amount", "currency", "probability",
    "expected_close_date", "actual_close_date",
    "source", "source_campaign", "referral_contact_id",
    "priority", "last_activity_at", "next_activity_at",
    "forecast_category",
    "lost_reason", "lost_to_competitor", "lost_notes",
    "notes",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if ("deal_status" in body) {
    const now = new Date().toISOString();
    if (body.deal_status === "qualified") updates.qualified_at = now;
    if (body.deal_status === "demo") updates.demo_booked_at = now;
    if (body.deal_status === "won") updates.won_at = now;
    if (body.deal_status === "lost") updates.lost_at = now;
  }

  const { data, error } = await supabase
    .from("contracts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin
    .from("contracts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
