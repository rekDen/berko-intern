/**
 * Helper zum Speichern und Abrufen von E-Mail-Anhängen.
 *
 * Dateien liegen im privaten 'documents'-Storage-Bucket unter
 *   {tenant_id}/email/{uuid}.{ext}
 * Die Metadaten (Dateiname, Größe, Typ, Pfad) werden als JSON auf der
 * emails-Zeile (Spalte `attachments`) abgelegt.
 *
 * Nur serverseitig verwenden (nutzt den service_role-Admin-Client).
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailAttachment } from "@/types";

export const EMAIL_ATTACHMENT_BUCKET = "documents";

/** Dateiendung aus einem Dateinamen ableiten (inkl. Punkt), sonst "" */
function extFromName(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) return "";
  const ext = filename.slice(idx + 1).toLowerCase();
  // nur einfache Endungen zulassen
  return /^[a-z0-9]{1,10}$/.test(ext) ? `.${ext}` : "";
}

/**
 * Lädt einen einzelnen Anhang in den Storage-Bucket hoch und liefert
 * die Metadaten. Wirft bei Upload-Fehler.
 */
export async function uploadEmailAttachment(
  admin: SupabaseClient,
  tenantId: string,
  filename: string,
  content: Buffer,
  contentType: string
): Promise<EmailAttachment> {
  const path = `${tenantId}/email/${randomUUID()}${extFromName(filename)}`;
  const { error } = await admin.storage
    .from(EMAIL_ATTACHMENT_BUCKET)
    .upload(path, content, {
      contentType: contentType || "application/octet-stream",
      upsert: false,
    });
  if (error) throw new Error(`Anhang-Upload fehlgeschlagen (${filename}): ${error.message}`);

  return {
    filename,
    size: content.length,
    contentType: contentType || "application/octet-stream",
    path,
  };
}

/**
 * Erzeugt eine zeitlich begrenzte Signed-URL zum Öffnen/Herunterladen
 * eines Anhangs. `download` erzwingt einen Download statt Inline-Anzeige.
 */
export async function createAttachmentSignedUrl(
  admin: SupabaseClient,
  path: string,
  filename?: string,
  expiresInSeconds = 120
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(EMAIL_ATTACHMENT_BUCKET)
    .createSignedUrl(path, expiresInSeconds, filename ? { download: filename } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}
