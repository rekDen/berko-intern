import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

function sanitizePath(raw: string): string {
  return raw.split("/").filter((s) => s && s !== ".." && s !== ".").join("/");
}

export async function GET(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const raw = request.nextUrl.searchParams.get("path") ?? "";
  const sanitized = sanitizePath(raw);
  if (!sanitized) return badRequest("Ungültiger Pfad");

  const admin = createAdminClient();
  const storagePath = `dokumente/${sanitized}`;

  const { data, error } = await admin.storage
    .from("documents")
    .createSignedUrl(storagePath, 300);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Fehler beim Erstellen der URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
