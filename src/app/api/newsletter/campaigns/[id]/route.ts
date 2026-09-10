import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

// GET /api/newsletter/campaigns/:id — Kampagne inkl. Empfänger-Status
export async function GET(_req: NextRequest, { params }: Params) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();
  const { id } = await params;

  const admin = createAdminClient();
  const { data: campaign, error } = await admin
    .from("newsletter_campaigns")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (error || !campaign) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const { data: recipients } = await admin
    .from("newsletter_recipients")
    .select("id, email, name, status, error, opened_at, open_count, sent_at, account_id")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true })
    .limit(1000);

  return NextResponse.json({ ...campaign, recipients: recipients ?? [] });
}

const EDITABLE = [
  "name", "subject", "body_html", "sender_account_id",
  "throttle_per_hour", "track_opens", "segment", "manual_recipients",
];

// PATCH /api/newsletter/campaigns/:id — nur solange nicht im Versand
export async function PATCH(request: NextRequest, { params }: Params) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();
  const { id } = await params;
  const body = await request.json();

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("newsletter_campaigns")
    .select("status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (!existing) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  if (["sending", "sent"].includes(existing.status)) {
    return NextResponse.json({ error: "Kampagne wird bereits versendet und kann nicht mehr bearbeitet werden." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) updates[k] = body[k];
  // IONOS-Sendelimits: Drosselung immer hart deckeln, egal was das Formular schickt.
  if (typeof updates.throttle_per_hour === "number") {
    updates.throttle_per_hour = Math.min(200, Math.max(1, updates.throttle_per_hour));
  }

  const { data, error } = await admin
    .from("newsletter_campaigns")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/newsletter/campaigns/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();
  const { id } = await params;

  const admin = createAdminClient();
  const { error } = await admin
    .from("newsletter_campaigns")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
