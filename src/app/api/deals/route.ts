import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STATUSES = [
  "lead", "contacted", "on_hold", "qualified", "disqualified",
  "demo", "proposal", "negotiation", "won", "lost",
];

export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const contactId = searchParams.get("contact_id");
  const dealStatus = searchParams.get("deal_status");

  let query = supabase
    .from("contracts")
    .select(`
      id, title, deal_status, priority, amount, currency, probability,
      expected_close_date, source, notes, created_at, contact_id, owner_id
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (dealStatus) query = query.eq("deal_status", dealStatus);
  if (contactId) query = query.eq("contact_id", contactId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/deals  { ids: string[] }  – Bulk-Soft-Delete
export async function DELETE(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return badRequest("ids erforderlich");

  const admin = createAdminClient();
  const { error } = await admin
    .from("contracts")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: ids.length });
}

export async function POST(request: NextRequest) {
  const { supabase, user, tenantId } = await withAuth();
  if (!supabase || !user || !tenantId) return unauthorized();

  const body = await request.json();

  if (body.deal_status && !VALID_STATUSES.includes(body.deal_status)) {
    return badRequest("Ungültiger deal_status");
  }

  const dealStatus = body.deal_status ?? "lead";
  const now = new Date().toISOString();
  const statusTimestamps: Record<string, string> = {};
  if (dealStatus === "qualified") statusTimestamps.qualified_at = now;
  if (dealStatus === "demo") statusTimestamps.demo_booked_at = now;
  if (dealStatus === "won") statusTimestamps.won_at = now;
  if (dealStatus === "lost") statusTimestamps.lost_at = now;

  const { data, error } = await supabase
    .from("contracts")
    .insert({
      tenant_id: tenantId,
      created_by: user.id,
      owner_id: body.owner_id ?? user.id,
      deal_status: dealStatus,
      title: body.title ?? null,
      description: body.description ?? null,
      contact_id: body.contact_id ?? null,
      amount: body.amount ?? null,
      currency: body.currency ?? "EUR",
      probability: body.probability ?? null,
      expected_close_date: body.expected_close_date ?? null,
      source: body.source ?? null,
      source_campaign: body.source_campaign ?? null,
      referral_contact_id: body.referral_contact_id ?? null,
      priority: body.priority ?? null,
      next_activity_at: body.next_activity_at ?? null,
      forecast_category: body.forecast_category ?? null,
      lost_reason: body.lost_reason ?? null,
      notes: body.notes ?? null,
      ...statusTimestamps,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
