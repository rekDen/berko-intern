import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsletterCampaign } from "@/types/newsletter";
import type { EmailEntry } from "@/types/crm";

export function baseUrl(): string {
  const u = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  return u.replace(/\/$/, "");
}

// Primäre E-Mail eines Kontakts (bevorzugt geschäftlich).
export function primaryEmail(emails: EmailEntry[] | null | undefined): string | null {
  const list = (emails ?? []).filter((e) => e?.value?.trim());
  if (list.length === 0) return null;
  const business = list.find((e) => e.type === "business");
  return (business ?? list[0]).value.trim();
}

// Rohes HTML → lesbarer Nur-Text (multipart/alternative-Fallback).
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Fertiges HTML für einen Empfänger: Abmeldelink + optionaler Tracking-Pixel.
export function renderHtml(
  bodyHtml: string,
  token: string,
  trackOpens: boolean,
): string {
  const base = baseUrl();
  const unsubUrl = `${base}/api/newsletter/unsubscribe/${token}`;

  let html = bodyHtml;
  // Platzhalter im Body ersetzen, falls vorhanden …
  const hadPlaceholder = /\{\{\s*(unsubscribe|abmelden)\s*\}\}/i.test(html);
  html = html.replace(/\{\{\s*(unsubscribe|abmelden)\s*\}\}/gi, unsubUrl);

  // … sonst einen Abmelde-Footer anhängen (DSGVO).
  if (!hadPlaceholder) {
    html += `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;font-family:-apple-system,Helvetica,Arial,sans-serif;line-height:1.5">Sie erhalten diese E-Mail als Kontakt von AKTURIO. <a href="${unsubUrl}" style="color:#888">Vom Newsletter abmelden</a>.</div>`;
  }

  if (trackOpens && base) {
    html += `<img src="${base}/api/newsletter/track/${token}" width="1" height="1" alt="" style="display:none;width:1px;height:1px" />`;
  }
  return html;
}

type AccountRow = {
  id: string;
  email: string;
  imap_host: string;
  imap_user: string;
  imap_password: string;
};

export function transportForAccount(acc: AccountRow): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: acc.imap_host.replace("imap.", "smtp."),
    port: 465,
    secure: true,
    auth: { user: acc.imap_user, pass: acc.imap_password },
  });
}

type RecipientInsert = {
  campaign_id: string;
  tenant_id: string;
  contact_id: string | null;
  email: string;
  name: string | null;
  account_id: string | null;
  status: "pending";
};

// Baut die materialisierte Empfängerliste (Segment-Kontakte + manuelle Adressen),
// dedupliziert und entfernt Abgemeldete. Absender ist immer EIN Account
// (campaign.sender_account_id) – kein Verteilen über mehrere Postfächer,
// siehe Migrationskommentar zu newsletter_campaigns.sender_account_id.
export async function buildRecipients(
  admin: SupabaseClient,
  campaign: NewsletterCampaign,
): Promise<RecipientInsert[]> {
  const tenantId = campaign.tenant_id;
  const accountId = campaign.sender_account_id;

  // Suppression-Liste
  const { data: unsubs } = await admin
    .from("newsletter_unsubscribes")
    .select("email")
    .eq("tenant_id", tenantId);
  const suppressed = new Set((unsubs ?? []).map((u) => (u.email as string).toLowerCase()));

  const seen = new Set<string>();
  const out: Omit<RecipientInsert, "account_id">[] = [];

  // 1) Kontakte aus dem Segment
  const seg = campaign.segment ?? {};
  const wantContacts = seg.all || (seg.categories?.length ?? 0) > 0 || (seg.lead_sources?.length ?? 0) > 0;
  if (wantContacts) {
    let q = admin
      .from("contacts")
      .select("id, first_name, last_name, company_name, emails, category, lead_source")
      .eq("tenant_id", tenantId);
    if (!seg.all) {
      const ors: string[] = [];
      if (seg.categories?.length) ors.push(`category.in.(${seg.categories.map((c) => `"${c}"`).join(",")})`);
      if (seg.lead_sources?.length) ors.push(`lead_source.in.(${seg.lead_sources.map((c) => `"${c}"`).join(",")})`);
      if (ors.length) q = q.or(ors.join(","));
    }
    const { data: contacts } = await q;
    for (const c of contacts ?? []) {
      const email = primaryEmail(c.emails as EmailEntry[] | null);
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key) || suppressed.has(key)) continue;
      seen.add(key);
      const name = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
      out.push({ campaign_id: campaign.id, tenant_id: tenantId, contact_id: c.id as string, email, name, status: "pending" });
    }
  }

  // 2) Manuelle Adressen
  for (const m of campaign.manual_recipients ?? []) {
    const email = (m.email ?? "").trim();
    if (!email.includes("@")) continue;
    const key = email.toLowerCase();
    if (seen.has(key) || suppressed.has(key)) continue;
    seen.add(key);
    out.push({ campaign_id: campaign.id, tenant_id: tenantId, contact_id: null, email, name: m.name ?? null, status: "pending" });
  }

  // 3) Absender: für alle Empfänger derselbe, einzelne Account.
  return out.map((r) => ({ ...r, account_id: accountId }));
}
