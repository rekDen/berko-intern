import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  transportForAccount, renderHtml, htmlToText, baseUrl,
} from "@/lib/newsletter";

export const maxDuration = 60;

const RUNS_PER_HOUR = 12;      // passend zu einem 5-Minuten-Cron
const PER_RUN_TOTAL = 60;      // Sicherheitskappe pro Lauf (Timeout)

type AccountRow = {
  id: string; email: string; imap_host: string; imap_user: string; imap_password: string;
};

// POST/GET /api/newsletter/process
// Auth: Cron via `Authorization: Bearer CRON_SECRET` (alle Mandanten) ODER
// eingeloggter Nutzer (nur eigener Mandant, für „jetzt senden").
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let tenantScope: string | null = null;
  if (!isCron) {
    const { user, tenantId } = await withAuth();
    if (!user || !tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    tenantScope = tenantId;
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Fällige Kampagnen
  let cq = admin
    .from("newsletter_campaigns")
    .select("*")
    .in("status", ["scheduled", "sending"])
    .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
    .limit(5);
  if (tenantScope) cq = cq.eq("tenant_id", tenantScope);
  const { data: campaigns } = await cq;

  const summary: { campaign: string; sent: number; failed: number; done: boolean }[] = [];

  for (const c of campaigns ?? []) {
    if (c.status === "scheduled") {
      await admin.from("newsletter_campaigns").update({ status: "sending" }).eq("id", c.id);
    }

    // Absender: genau EIN Account (siehe Migrationskommentar – kein Verteilen
    // über mehrere Postfächer, um IONOS-Stundenlimits zu umgehen).
    const { data: acc } = c.sender_account_id
      ? await admin
          .from("email_accounts")
          .select("id, email, imap_host, imap_user, imap_password")
          .eq("id", c.sender_account_id)
          .single<AccountRow>()
      : { data: null };

    if (!acc) {
      summary.push({ campaign: c.id, sent: 0, failed: 0, done: false });
      continue;
    }

    // Sicherer Batch pro Lauf: throttle_per_hour verteilt auf RUNS_PER_HOUR
    // Cron-Durchläufe, zusätzlich hart gekappt auf PER_RUN_TOTAL.
    const perRunCap = Math.min(PER_RUN_TOTAL, Math.max(1, Math.ceil((c.throttle_per_hour || 30) / RUNS_PER_HOUR)));

    // Abmeldungen (könnten nach dem Materialisieren dazugekommen sein)
    const { data: unsubs } = await admin
      .from("newsletter_unsubscribes").select("email").eq("tenant_id", c.tenant_id);
    const suppressed = new Set((unsubs ?? []).map((u) => (u.email as string).toLowerCase()));

    // Ausstehende Empfänger für diesen Lauf (streng auf das sichere Limit begrenzt)
    const { data: pending } = await admin
      .from("newsletter_recipients")
      .select("id, email, name, token")
      .eq("campaign_id", c.id)
      .eq("status", "pending")
      .limit(perRunCap);

    let sent = 0, failed = 0;
    const transport = transportForAccount(acc);

    for (const r of pending ?? []) {
      // Nachträgliche Abmeldung respektieren
      if (suppressed.has((r.email as string).toLowerCase())) {
        await admin.from("newsletter_recipients").update({ status: "unsubscribed" }).eq("id", r.id);
        continue;
      }

      const unsubUrl = `${baseUrl()}/api/newsletter/unsubscribe/${r.token}`;
      const html = renderHtml(c.body_html, r.token as string, c.track_opens);

      try {
        await transport.sendMail({
          from: `"${c.name}" <${acc.email}>`,
          to: r.email as string,
          subject: c.subject,
          text: htmlToText(c.body_html),
          html,
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        await admin.from("newsletter_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
          .eq("id", r.id);
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Sendefehler";
        await admin.from("newsletter_recipients").update({ status: "failed", error: msg }).eq("id", r.id);
        failed++;
      }
    }

    transport.close();

    // Zähler aus der Wahrheit (recipients) neu berechnen
    const counts = await recipientCounts(admin, c.id);
    const done = counts.pending === 0;
    await admin.from("newsletter_campaigns").update({
      sent_count: counts.sent,
      failed_count: counts.failed,
      unsubscribed_count: counts.unsubscribed,
      opened_count: counts.opened,
      status: done ? "sent" : "sending",
      sent_at: done ? new Date().toISOString() : c.sent_at,
      updated_at: new Date().toISOString(),
    }).eq("id", c.id);

    summary.push({ campaign: c.id, sent, failed, done });
  }

  return NextResponse.json({ ok: true, processed: summary });
}

async function countStatus(admin: ReturnType<typeof createAdminClient>, campaignId: string, status: string) {
  const { count } = await admin
    .from("newsletter_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", status);
  return count ?? 0;
}

async function recipientCounts(admin: ReturnType<typeof createAdminClient>, campaignId: string) {
  const [pending, sent, failed, unsubscribed] = await Promise.all([
    countStatus(admin, campaignId, "pending"),
    countStatus(admin, campaignId, "sent"),
    countStatus(admin, campaignId, "failed"),
    countStatus(admin, campaignId, "unsubscribed"),
  ]);
  const { count: opened } = await admin
    .from("newsletter_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .not("opened_at", "is", null);
  return { pending, sent, failed, unsubscribed, opened: opened ?? 0 };
}

export const POST = handle;
export const GET = handle;
