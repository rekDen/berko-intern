import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAttachmentSignedUrl } from "@/lib/email-attachments";

// GET /api/emails/attachment?path=...&name=... → Signed-URL zum Öffnen/Herunterladen
export async function GET(request: NextRequest) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();

  const path = request.nextUrl.searchParams.get("path") || "";
  const name = request.nextUrl.searchParams.get("name") || undefined;
  const download = request.nextUrl.searchParams.get("download") === "1";
  if (!path) return badRequest("Pflichtparameter: path");

  // Nur Anhänge des eigenen Tenants freigeben
  if (!path.startsWith(`${tenantId}/email/`)) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const admin = createAdminClient();
  const url = await createAttachmentSignedUrl(admin, path, download ? name : undefined);
  if (!url) {
    return NextResponse.json({ error: "Anhang nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ url });
}
