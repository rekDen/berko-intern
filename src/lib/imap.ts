/**
 * IMAP-Helper für die Anbindung an IONOS-Postfächer.
 *
 * Wird ausschließlich serverseitig (API-Routes) verwendet.
 * Nutzt den service_role-Admin-Client, um die gespeicherten
 * Zugangsdaten aus Supabase zu lesen (umgeht RLS).
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadEmailAttachment } from "@/lib/email-attachments";
import type { EmailAttachment } from "@/types";

// ─── Typen ─────────────────────────────────────────────────────────────────

export interface ImapCredentials {
  email: string;
  host: string;
  port: number;
  user: string;
  password: string;
  tenantId: string;
}

export interface SyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}


// ─── Zugangsdaten aus Supabase lesen ───────────────────────────────────────

export async function getImapCredentials(
  userId: string
): Promise<ImapCredentials | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_accounts")
    .select("email, imap_host, imap_port, imap_user, imap_password, tenant_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return {
    email: data.email,
    host: data.imap_host,
    port: data.imap_port,
    user: data.imap_user,
    password: data.imap_password,
    tenantId: data.tenant_id as string,
  };
}

// ─── Haupt-Sync-Funktion ───────────────────────────────────────────────────

/**
 * Verbindet mit dem IMAP-Server, liest die letzten `limit` Nachrichten
 * aus INBOX und speichert neue E-Mails in der Supabase-Tabelle `emails`.
 * Bereits vorhandene Nachrichten (anhand imap_uid) werden übersprungen.
 */
export async function syncImapEmails(
  credentials: ImapCredentials,
  userId: string,
  limit = 75
): Promise<SyncResult> {
  const admin = createAdminClient();
  const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

  // Bereits synchronisierte UIDs laden (für Deduplizierung in O(1))
  const { data: existingRows } = await admin
    .from("emails")
    .select("imap_uid")
    .eq("tenant_id", credentials.tenantId)
    .eq("created_by", userId)
    .not("imap_uid", "is", null);

  const existingUids = new Set<number>(
    (existingRows ?? []).map((r) => r.imap_uid as number)
  );

  // Gelöschte UIDs laden — diese dürfen nicht erneut importiert werden
  const { data: accountData } = await admin
    .from("email_accounts")
    .select("deleted_uids")
    .eq("user_id", userId)
    .single();

  const deletedUids = new Set<number>(
    ((accountData?.deleted_uids as number[]) ?? [])
  );

  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: true,
    auth: {
      user: credentials.user,
      pass: credentials.password,
    },
    logger: false,
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const total = (client.mailbox as { exists: number }).exists ?? 0;
      if (total === 0) return result;

      // Nur die letzten `limit` Nachrichten abrufen
      const startSeq = Math.max(1, total - limit + 1);
      const range = `${startSeq}:*`;

      for await (const msg of client.fetch(range, {
        uid: true,
        source: true,
      })) {
        // Bereits bekannte oder gelöschte UIDs überspringen
        if (existingUids.has(msg.uid) || deletedUids.has(msg.uid)) {
          result.skipped++;
          continue;
        }

        try {
          if (!msg.source) {
            result.skipped++;
            continue;
          }

          const parsed = await simpleParser(msg.source as Buffer);

          const fromAddr = parsed.from?.value?.[0];
          const fromAddress = fromAddr?.address ?? "";
          const fromName = fromAddr?.name || fromAddress;
          const subject = parsed.subject ?? "(Kein Betreff)";
          const rawHtml = typeof parsed.html === "string" ? parsed.html : "";
          const body = parsed.text ?? stripHtml(rawHtml);
          const date = parsed.date ?? new Date();
          const messageId = parsed.messageId ?? null;
          const trimmedBody = body.trim() || "(kein Inhalt)";

          // Echte Anhänge in den Storage speichern (eingebettete Inline-Teile
          // wie Signatur-Logos überspringen).
          const storedAttachments: EmailAttachment[] = [];
          for (const att of parsed.attachments ?? []) {
            if (att.related) continue;
            const content = att.content as Buffer | undefined;
            if (!content || content.length === 0) continue;
            const filename = att.filename || `anhang-${storedAttachments.length + 1}`;
            try {
              storedAttachments.push(
                await uploadEmailAttachment(
                  admin,
                  credentials.tenantId,
                  filename,
                  content,
                  att.contentType || "application/octet-stream"
                )
              );
            } catch (e) {
              result.errors.push(
                `UID ${msg.uid} Anhang: ${e instanceof Error ? e.message : "Upload-Fehler"}`
              );
            }
          }

          const { error: insertError } = await admin.from("emails").insert({
            tenant_id: credentials.tenantId,
            created_by: userId,
            from_address: fromAddress,
            from_name: fromName || fromAddress,
            subject,
            body: trimmedBody,
            date: date.toISOString(),
            read: false,
            starred: false,
            ai_summary: "",
            ai_draft: "",
            imap_uid: msg.uid,
            message_id: messageId,
            attachments: storedAttachments,
          });

          if (insertError) {
            // Duplikat-Fehler (message_id-Kollision) leise ignorieren
            if (!insertError.message.includes("duplicate")) {
              result.errors.push(`UID ${msg.uid}: ${insertError.message}`);
            } else {
              result.skipped++;
            }
          } else {
            result.synced++;
          }
        } catch (parseErr) {
          result.errors.push(
            `UID ${msg.uid}: ${
              parseErr instanceof Error ? parseErr.message : "Parse-Fehler"
            }`
          );
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  // Letzten Sync-Zeitstempel und ggf. Fehler speichern
  await admin
    .from("email_accounts")
    .update({
      last_sync_at: new Date().toISOString(),
      sync_error:
        result.errors.length > 0 ? result.errors.slice(0, 3).join("; ") : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return result;
}

// ─── Verbindungstest ───────────────────────────────────────────────────────

export async function testImapConnection(
  credentials: Pick<ImapCredentials, 'host' | 'port' | 'user' | 'password'>
): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: true,
    auth: {
      user: credentials.user,
      pass: credentials.password,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Verbindung fehlgeschlagen",
    };
  }
}

// ─── E-Mail auf IMAP-Server löschen ───────────────────────────────────────

/**
 * Löscht eine E-Mail auf dem IMAP-Server anhand der UID.
 * Setzt das \Deleted-Flag und führt EXPUNGE aus.
 */
export async function deleteImapEmail(
  credentials: ImapCredentials,
  imapUid: number
): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: true,
    auth: { user: credentials.user, pass: credentials.password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // messageDelete setzt \Deleted + EXPUNGE in einem Schritt
      const result = await client.messageDelete(String(imapUid), { uid: true });
      console.log("[IMAP] Gelöscht UID:", imapUid, "Ergebnis:", result);
    } finally {
      lock.release();
    }

    await client.logout();
    return { ok: true };
  } catch (err) {
    console.error("[IMAP] Löschfehler UID:", imapUid, err);
    try { await client.logout(); } catch { /* ignore */ }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "IMAP-Löschfehler",
    };
  }
}


function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}
