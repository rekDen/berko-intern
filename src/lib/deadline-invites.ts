import nodemailer from "nodemailer";
import { getImapCredentials } from "@/lib/imap";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildIcs } from "@/lib/ics";

// Termin-/Frist-Daten, die für Einladungs- und Absage-Mails benötigt werden.
export type DeadlineForInvite = {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string | null;
  type: string;
};

// Nur gültige, eindeutige E-Mail-Adressen (Vergleich case-insensitiv).
export function normalizeInviteEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of value) {
    if (typeof e !== "string") continue;
    const trimmed = e.trim();
    if (!trimmed.includes("@")) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

type MailContext = {
  organizerName: string;
  organizerEmail: string;
  transporter: nodemailer.Transporter;
};

async function mailContext(userId: string): Promise<MailContext | null> {
  const credentials = await getImapCredentials(userId);
  if (!credentials) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .single();
  const organizerName = profile?.name ?? credentials.user.split("@")[0];

  const transporter = nodemailer.createTransport({
    host: credentials.host.replace("imap.", "smtp."),
    port: 465,
    secure: true,
    auth: { user: credentials.user, pass: credentials.password },
  });

  return { organizerName, organizerEmail: credentials.email, transporter };
}

function whenLabel(d: DeadlineForInvite): string {
  return d.time ? `${d.date} um ${d.time} Uhr` : `${d.date} (ganztägig)`;
}

function kindLabel(d: DeadlineForInvite): string {
  return d.type === "frist" ? "Frist" : "Termin";
}

// Versendet Kalender-Einladungen (.ics, METHOD:REQUEST) an neue Teilnehmer.
export async function sendDeadlineInvitations(
  userId: string,
  emails: string[],
  d: DeadlineForInvite
): Promise<number> {
  if (emails.length === 0) return 0;
  const ctx = await mailContext(userId);
  if (!ctx) return 0;

  const ics = buildIcs({
    uid: `${d.id}@akturio`,
    title: d.title,
    description: d.description,
    location: d.location,
    date: d.date,
    time: d.time,
    organizerName: ctx.organizerName,
    organizerEmail: ctx.organizerEmail,
    attendees: emails,
    method: "REQUEST",
  });

  const kind = kindLabel(d);
  const text = [
    `Hallo,`,
    ``,
    `${ctx.organizerName} lädt Sie zu folgendem ${kind} ein:`,
    ``,
    `${d.title}`,
    `Datum: ${whenLabel(d)}`,
    ...(d.location ? [`Ort: ${d.location}`] : []),
    ...(d.description ? [``, d.description] : []),
    ``,
    `Die Einladung ist als Kalenderdatei (.ics) angehängt – damit können Sie den ${kind} direkt in Ihren Kalender übernehmen.`,
  ].join("\n");

  let sent = 0;
  await Promise.all(
    emails.map(async (to) => {
      try {
        await ctx.transporter.sendMail({
          from: `"${ctx.organizerName}" <${ctx.organizerEmail}>`,
          to,
          subject: `Einladung: ${d.title}`,
          text,
          icalEvent: { method: "REQUEST", filename: "einladung.ics", content: ics },
        });
        sent++;
      } catch {
        // einzelne Fehlschläge ignorieren
      }
    })
  );
  return sent;
}

// Versendet Absagen (.ics, METHOD:CANCEL) an entfernte Teilnehmer –
// der Termin wird dadurch aus deren Kalender entfernt.
export async function sendDeadlineCancellations(
  userId: string,
  emails: string[],
  d: DeadlineForInvite
): Promise<number> {
  if (emails.length === 0) return 0;
  const ctx = await mailContext(userId);
  if (!ctx) return 0;

  const ics = buildIcs({
    uid: `${d.id}@akturio`,
    title: d.title,
    description: d.description,
    location: d.location,
    date: d.date,
    time: d.time,
    organizerName: ctx.organizerName,
    organizerEmail: ctx.organizerEmail,
    attendees: emails,
    method: "CANCEL",
    sequence: 1, // höher als die ursprüngliche Einladung (SEQUENCE:0)
  });

  const kind = kindLabel(d);
  const text = [
    `Hallo,`,
    ``,
    `${ctx.organizerName} hat Sie als Teilnehmer:in von folgendem ${kind} entfernt:`,
    ``,
    `${d.title}`,
    `Datum: ${whenLabel(d)}`,
    ...(d.location ? [`Ort: ${d.location}`] : []),
    ``,
    `Sie sind kein Teilnehmer mehr. Der ${kind} wird aus Ihrem Kalender entfernt (siehe angehängte Absage).`,
  ].join("\n");

  let sent = 0;
  await Promise.all(
    emails.map(async (to) => {
      try {
        await ctx.transporter.sendMail({
          from: `"${ctx.organizerName}" <${ctx.organizerEmail}>`,
          to,
          subject: `Absage: ${d.title}`,
          text,
          icalEvent: { method: "CANCEL", filename: "absage.ics", content: ics },
        });
        sent++;
      } catch {
        // einzelne Fehlschläge ignorieren
      }
    })
  );
  return sent;
}
