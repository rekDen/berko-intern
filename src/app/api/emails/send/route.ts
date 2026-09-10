import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getImapCredentials } from "@/lib/imap";
import { uploadEmailAttachment } from "@/lib/email-attachments";
import type { EmailAttachment } from "@/types";

// POST /api/emails/send — E-Mail über SMTP (IONOS) versenden
export async function POST(request: NextRequest) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();

  const form = await request.formData();
  const to = form.get("to")?.toString() || "";
  const cc = form.get("cc")?.toString() || "";
  const bcc = form.get("bcc")?.toString() || "";
  const subject = form.get("subject")?.toString() || "";
  const text = form.get("text")?.toString() || "";
  const html = form.get("html")?.toString() || "";
  const in_reply_to = form.get("in_reply_to")?.toString() || "";
  const references = form.get("references")?.toString() || "";
  const draft_id = form.get("draft_id")?.toString() || "";
  const request_receipt = form.get("request_receipt")?.toString() === "1";

  if (!to || !subject || !text) {
    return badRequest("Pflichtfelder: to, subject, text");
  }

  // Angehängte Dateien in nodemailer-Attachments umwandeln
  const files = form.getAll("attachments").filter((f): f is File => f instanceof File);
  const attachments = await Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      content: Buffer.from(await f.arrayBuffer()),
      ...(f.type ? { contentType: f.type } : {}),
    }))
  );

  const admin = createAdminClient();
  const [credentials, profileResult] = await Promise.all([
    getImapCredentials(user.id),
    admin.from("profiles").select("name").eq("id", user.id).single(),
  ]);

  if (!credentials) {
    return NextResponse.json(
      { error: "IMAP/SMTP nicht konfiguriert" },
      { status: 400 }
    );
  }

  const fromName = profileResult.data?.name || credentials.user.split("@")[0];
  const smtpHost = credentials.host.replace("imap.", "smtp.");

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: 465,
    secure: true,
    auth: {
      user: credentials.user,
      pass: credentials.password,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${credentials.email}>`,
      to,
      ...(cc ? { cc } : {}),
      ...(bcc ? { bcc } : {}),
      subject,
      text,
      ...(html ? { html } : {}),
      ...(in_reply_to ? { inReplyTo: in_reply_to, references } : {}),
      ...(attachments.length ? { attachments } : {}),
      // Zugangsbestätigung: Standard-Header, die Mailclients als „Absender
      // bittet um Lese-/Empfangsbestätigung" auswerten (MDN, RFC 8098).
      ...(request_receipt ? {
        headers: {
          "Disposition-Notification-To": credentials.email,
          "Return-Receipt-To": credentials.email,
          "X-Confirm-Reading-To": credentials.email,
        },
      } : {}),
    });

    if (draft_id) {
      await admin.from("emails")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", draft_id);
    }

    // Anhänge in den Storage speichern, damit sie im „Gesendet"-Ordner
    // angezeigt und wieder geöffnet werden können.
    const storedAttachments: EmailAttachment[] = [];
    for (const a of attachments) {
      try {
        storedAttachments.push(
          await uploadEmailAttachment(
            admin,
            tenantId,
            a.filename,
            a.content,
            a.contentType || "application/octet-stream"
          )
        );
      } catch (e) {
        // Versand war erfolgreich – Speicherung ist best effort
        console.error("Anhang-Speicherung fehlgeschlagen:", e);
      }
    }

    await admin.from("emails").insert({
      tenant_id: tenantId,
      created_by: user.id,
      from_address: credentials.email,
      from_name: fromName,
      to_address: to,
      cc: cc || null,
      bcc: bcc || null,
      subject,
      body: text,
      date: new Date().toISOString(),
      folder: "sent",
      read: true,
      starred: false,
      ai_summary: "",
      ai_draft: "",
      message_id: info.messageId,
      attachments: storedAttachments,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SMTP-Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
