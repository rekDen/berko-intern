import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRecipients } from "@/lib/newsletter";
import type { NewsletterCampaign } from "@/types/newsletter";

type Params = { params: Promise<{ id: string }> };

// POST /api/newsletter/campaigns/:id/send
// Body: { scheduled_at?: string|null }  → materialisiert Empfänger und plant/startet den Versand.
export async function POST(request: NextRequest, { params }: Params) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const scheduledAt: string | null = body.scheduled_at ?? null;

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("newsletter_campaigns")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single<NewsletterCampaign>();
  if (!campaign) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  if (["sending", "sent"].includes(campaign.status)) {
    return badRequest("Kampagne wird bereits versendet.");
  }
  if (!campaign.subject?.trim() || !campaign.body_html?.trim()) {
    return badRequest("Betreff und Inhalt dürfen nicht leer sein.");
  }
  if (!campaign.sender_account_id) {
    return badRequest("Bitte einen Absender-Account wählen.");
  }

  // Empfängerliste bauen und materialisieren (Duplikate ignorieren).
  const recipients = await buildRecipients(admin, campaign);
  if (recipients.length === 0) return badRequest("Keine Empfänger gefunden (Segment leer oder alle abgemeldet).");

  const { error: insErr } = await admin
    .from("newsletter_recipients")
    .upsert(recipients, { onConflict: "campaign_id,email", ignoreDuplicates: true });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { count } = await admin
    .from("newsletter_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", id);

  const future = scheduledAt ? new Date(scheduledAt).getTime() > Date.now() : false;
  const { data: updated, error: upErr } = await admin
    .from("newsletter_campaigns")
    .update({
      status: future ? "scheduled" : "sending",
      scheduled_at: scheduledAt ?? new Date().toISOString(),
      total_recipients: count ?? recipients.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ...updated, queued: count ?? recipients.length });
}
