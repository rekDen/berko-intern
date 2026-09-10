import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ token: string }> };

function page(title: string, message: string): NextResponse {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f5f5f5;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:40px;max-width:420px;text-align:center">
<h1 style="font-size:18px;color:#0a1829;margin:0 0 12px">${title}</h1>
<p style="font-size:14px;color:#555;line-height:1.6;margin:0">${message}</p>
</div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// GET /api/newsletter/unsubscribe/:token — öffentliche Abmeldung.
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: rec } = await admin
    .from("newsletter_recipients")
    .select("id, email, tenant_id, campaign_id, status")
    .eq("token", token)
    .single();

  if (!rec) {
    return page("Link ungültig", "Dieser Abmelde-Link ist ungültig oder abgelaufen.");
  }

  // Auf die mandantenweite Suppression-Liste setzen (idempotent).
  await admin.from("newsletter_unsubscribes").upsert(
    { tenant_id: rec.tenant_id, email: rec.email, campaign_id: rec.campaign_id },
    { onConflict: "tenant_id,email", ignoreDuplicates: true },
  );

  if (rec.status !== "unsubscribed") {
    await admin.from("newsletter_recipients").update({ status: "unsubscribed" }).eq("id", rec.id);
    const { count } = await admin
      .from("newsletter_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", rec.campaign_id)
      .eq("status", "unsubscribed");
    await admin.from("newsletter_campaigns")
      .update({ unsubscribed_count: count ?? 0 }).eq("id", rec.campaign_id);
  }

  return page(
    "Erfolgreich abgemeldet",
    `Die Adresse <strong>${rec.email}</strong> erhält keine weiteren Newsletter von AKTURIO. Sie können dieses Fenster schließen.`,
  );
}
