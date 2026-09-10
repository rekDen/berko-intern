import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRecipients } from "@/lib/newsletter";
import type { NewsletterCampaign } from "@/types/newsletter";

type Params = { params: Promise<{ id: string }> };

// POST /api/newsletter/campaigns/:id/preview
// Body darf segment / manual_recipients / sender_account_id überschreiben
// (für Live-Zählung während der Bearbeitung). Sendet nichts.
export async function POST(request: NextRequest, { params }: Params) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();
  const { id } = await params;
  const overrides = await request.json().catch(() => ({}));

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("newsletter_campaigns")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single<NewsletterCampaign>();
  if (!campaign) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const merged: NewsletterCampaign = {
    ...campaign,
    segment: overrides.segment ?? campaign.segment,
    manual_recipients: overrides.manual_recipients ?? campaign.manual_recipients,
    sender_account_id: overrides.sender_account_id ?? campaign.sender_account_id,
  };

  const recipients = await buildRecipients(admin, merged);
  const throttle = overrides.throttle_per_hour ?? campaign.throttle_per_hour ?? 30;
  return NextResponse.json({
    count: recipients.length,
    // Grobe Laufzeitschätzung bei der eingestellten Drosselung – macht sichtbar,
    // dass große Listen bei sicheren IONOS-Limits mehrere Stunden dauern.
    estimated_hours: Math.ceil(recipients.length / Math.max(1, throttle)),
    sample: recipients.slice(0, 20).map((r) => ({ email: r.email, name: r.name })),
  });
}
