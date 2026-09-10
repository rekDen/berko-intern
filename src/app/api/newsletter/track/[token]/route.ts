import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ token: string }> };

// 1×1 transparentes GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

// GET /api/newsletter/track/:token — Öffnungs-Tracking (öffentlich).
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;

  try {
    const admin = createAdminClient();
    const { data: rec } = await admin
      .from("newsletter_recipients")
      .select("id, campaign_id, opened_at, open_count")
      .eq("token", token)
      .single();

    if (rec) {
      const firstOpen = !rec.opened_at;
      await admin.from("newsletter_recipients").update({
        opened_at: rec.opened_at ?? new Date().toISOString(),
        open_count: (rec.open_count ?? 0) + 1,
      }).eq("id", rec.id);

      if (firstOpen) {
        // Öffnungszähler der Kampagne aus der Wahrheit (recipients) aktualisieren.
        const { count } = await admin
          .from("newsletter_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", rec.campaign_id)
          .not("opened_at", "is", null);
        await admin.from("newsletter_campaigns")
          .update({ opened_count: count ?? 0 }).eq("id", rec.campaign_id);
      }
    }
  } catch {
    // Tracking-Fehler dürfen die Bildauslieferung nie blockieren.
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Content-Length": String(PIXEL.length),
    },
  });
}
