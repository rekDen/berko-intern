/**
 * Backfill: Anhänge für bereits synchronisierte Posteingangs-Mails nachtragen.
 *
 * Der IMAP-Sync überspringt bekannte UIDs, daher haben vor Einführung des
 * Anhang-Features synchronisierte Mails keine gespeicherten Anhänge. Dieses
 * Skript holt für alle Inbox-Mails mit `imap_uid` und leerem `attachments`
 * die Originalnachricht per UID nach, lädt echte Anhänge in den Storage und
 * aktualisiert die Zeile.
 *
 * Ausführen:  npx tsx --env-file=.env.local scripts/backfill-email-attachments.ts
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createAdminClient } from "../src/lib/supabase/admin";
import { getImapCredentials } from "../src/lib/imap";
import { uploadEmailAttachment } from "../src/lib/email-attachments";
import type { EmailAttachment } from "../src/types";

const admin = createAdminClient();

async function backfillUser(userId: string) {
  const creds = await getImapCredentials(userId);
  if (!creds) {
    console.log(`  ⚠ keine IMAP-Zugangsdaten für ${userId} – übersprungen`);
    return;
  }

  // Inbox-Mails mit UID, deren attachments noch leer sind
  const { data: rows, error } = await admin
    .from("emails")
    .select("id, imap_uid, attachments")
    .eq("created_by", userId)
    .eq("folder", "inbox")
    .not("imap_uid", "is", null)
    .is("deleted_at", null);
  if (error) {
    console.log(`  ⚠ DB-Fehler: ${error.message}`);
    return;
  }

  const needsBackfill = new Map<number, string>(); // uid -> rowId
  for (const r of rows ?? []) {
    const atts = (r.attachments as EmailAttachment[] | null) ?? [];
    if (atts.length === 0 && r.imap_uid != null) needsBackfill.set(r.imap_uid, r.id);
  }
  if (needsBackfill.size === 0) {
    console.log(`  ✓ nichts zu tun (${creds.email})`);
    return;
  }
  console.log(`  ${needsBackfill.size} Kandidaten für ${creds.email}`);

  const client = new ImapFlow({
    host: creds.host, port: creds.port, secure: true,
    auth: { user: creds.user, pass: creds.password }, logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  let updated = 0;
  try {
    const uids = [...needsBackfill.keys()].sort((a, b) => a - b);
    for await (const msg of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
      const rowId = needsBackfill.get(msg.uid);
      if (!rowId || !msg.source) continue;
      const parsed = await simpleParser(msg.source as Buffer);

      const stored: EmailAttachment[] = [];
      for (const att of parsed.attachments ?? []) {
        if (att.related) continue;
        const content = att.content as Buffer | undefined;
        if (!content || content.length === 0) continue;
        const filename = att.filename || `anhang-${stored.length + 1}`;
        try {
          stored.push(
            await uploadEmailAttachment(admin, creds.tenantId, filename, content, att.contentType || "application/octet-stream")
          );
        } catch (e) {
          console.log(`    ⚠ Upload-Fehler uid=${msg.uid}: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (stored.length === 0) continue;

      const { error: upErr } = await admin.from("emails").update({ attachments: stored }).eq("id", rowId);
      if (upErr) console.log(`    ⚠ Update-Fehler uid=${msg.uid}: ${upErr.message}`);
      else { updated++; console.log(`    ✓ uid=${msg.uid}: ${stored.map(s => s.filename).join(", ")}`); }
    }
  } finally {
    lock.release();
    await client.logout();
  }
  console.log(`  → ${updated} Mail(s) aktualisiert`);
}

(async () => {
  const { data: accounts, error } = await admin.from("email_accounts").select("user_id");
  if (error) { console.error("Fehler beim Laden der Konten:", error.message); process.exit(1); }
  console.log(`${accounts?.length ?? 0} E-Mail-Konto/-Konten gefunden.`);
  for (const acc of accounts ?? []) {
    console.log(`\nKonto ${acc.user_id}:`);
    await backfillUser(acc.user_id as string);
  }
  console.log("\nFertig.");
})().catch((e) => { console.error("FEHLER:", e.message); process.exit(1); });
