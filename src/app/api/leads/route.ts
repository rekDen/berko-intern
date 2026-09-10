import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";

const API_KEY = "79ap-8MQU-niR9iEvRnqXfJ34ycddyTuD-j";

// Absender-/Empfänger-Konto für Lead-Benachrichtigungen. Muss ein real
// konfiguriertes Konto in email_accounts sein (anna@akturio.com existiert nicht).
const NOTIFY_EMAIL = "dennis@akturio.com";

export async function POST(request: NextRequest) {
  if (request.headers.get("api_key") !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { summary, name, phone_number, company_name } = body;

  if (!summary || !name || !phone_number) {
    return NextResponse.json(
      { error: "Pflichtfelder: summary, name, phone_number" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  // Gezielt EIN reales Konto laden. Zuvor .single() ohne Filter → schlug fehl,
  // sobald mehr als ein email_accounts-Eintrag existiert (aktuell 6).
  const { data: account } = await admin
    .from("email_accounts")
    .select("email, imap_host, imap_user, imap_password")
    .eq("email", NOTIFY_EMAIL)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "SMTP nicht konfiguriert" }, { status: 500 });
  }

  const smtpHost = account.imap_host.replace("imap.", "smtp.");
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: 465,
    secure: true,
    auth: { user: account.imap_user, pass: account.imap_password },
  });

  const subject = company_name
    ? `Neuer Lead: ${name} (${company_name})`
    : `Neuer Lead: ${name}`;

  const text = [
    `Name: ${name}`,
    company_name ? `Firma: ${company_name}` : null,
    `Telefon: ${phone_number}`,
    ``,
    `Zusammenfassung:`,
    summary,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await transporter.sendMail({
      // From muss dem authentifizierten Postfach entsprechen, sonst weist
      // IONOS den Versand ab (lisa@/anna@ existieren nicht als Konto).
      from: `"Lisa (Berko AI)" <${account.email}>`,
      to: NOTIFY_EMAIL,
      subject,
      text,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SMTP-Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
