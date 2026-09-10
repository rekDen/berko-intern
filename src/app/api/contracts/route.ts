import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";

export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const contactId = searchParams.get("contact_id");
  const dealStatus = searchParams.get("deal_status");

  let query = supabase
    .from("contracts")
    .select(`
      id, title, amount, currency,
      expected_close_date, created_at, contact_id, owner_id, created_by,
      contacts!contracts_contact_id_fkey(id, first_name, last_name, company_name, type)
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (dealStatus) query = query.eq("deal_status", dealStatus);
  if (contactId) query = query.eq("contact_id", contactId);

  const { data, error } = await query;
  if (error) {
    console.error("contracts GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { supabase, user, tenantId } = await withAuth();
  if (!supabase || !user || !tenantId) return unauthorized();

  const body = await request.json();

  const VALID_DEAL_STATUSES = [
    "lead", "contacted", "on_hold", "qualified", "disqualified",
    "demo", "proposal", "negotiation", "won", "lost",
  ];
  if (body.deal_status && !VALID_DEAL_STATUSES.includes(body.deal_status)) {
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
      contract_data: body.contract_data ?? null,
      ...statusTimestamps,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
