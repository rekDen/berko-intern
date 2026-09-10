import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/newsletter/campaigns — Kampagnenliste des Mandanten
export async function GET() {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("newsletter_campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/newsletter/campaigns — neue Kampagne (Entwurf)
export async function POST(request: NextRequest) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();

  const body = await request.json();
  if (!body.name?.trim()) return badRequest("Pflichtfeld: name");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("newsletter_campaigns")
    .insert({
      tenant_id: tenantId,
      created_by: user.id,
      name: body.name.trim(),
      subject: body.subject ?? "",
      body_html: body.body_html ?? "",
      sender_account_id: typeof body.sender_account_id === "string" ? body.sender_account_id : null,
      // IONOS-Sendelimits: konservativer Default (30/Std.), hart gedeckelt bei
      // 200/Std. – siehe Migrationskommentar zu throttle_per_hour.
      throttle_per_hour: Number.isFinite(body.throttle_per_hour)
        ? Math.min(200, Math.max(1, body.throttle_per_hour))
        : 30,
      track_opens: body.track_opens !== false,
      segment: body.segment ?? {},
      manual_recipients: Array.isArray(body.manual_recipients) ? body.manual_recipients : [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
