import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

function sanitizePath(raw: string): string {
  return raw.split("/").filter((s) => s && s !== ".." && s !== ".").join("/");
}

async function listAllFiles(
  admin: ReturnType<typeof createAdminClient>,
  prefix: string
): Promise<string[]> {
  const { data, error } = await admin.storage
    .from("documents")
    .list(prefix, { limit: 1000 });

  if (error || !data) return [];

  const results: string[] = [];
  for (const item of data) {
    const fullPath = `${prefix}/${item.name}`;
    if (item.id === null) {
      const nested = await listAllFiles(admin, fullPath);
      results.push(...nested);
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export async function POST(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const body = await request.json();
  const raw: string = body.path ?? "";
  const sanitized = sanitizePath(raw);
  if (!sanitized) return badRequest("Ungültiger Pfad");

  const admin = createAdminClient();
  const keepPath = `dokumente/${sanitized}/.keep`;

  const { error } = await admin.storage
    .from("documents")
    .upload(keepPath, new Uint8Array(0), {
      upsert: true,
      contentType: "application/octet-stream",
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const body = await request.json();
  const rawOld: string = body.oldPath ?? "";
  const rawNew: string = body.newPath ?? "";

  const oldSanitized = sanitizePath(rawOld);
  const newSanitized = sanitizePath(rawNew);

  if (!oldSanitized || !newSanitized) return badRequest("oldPath und newPath erforderlich");

  const admin = createAdminClient();
  const oldPrefix = `dokumente/${oldSanitized}`;
  const newPrefix = `dokumente/${newSanitized}`;

  const allFiles = await listAllFiles(admin, oldPrefix);

  for (const fromPath of allFiles) {
    const relativePart = fromPath.slice(oldPrefix.length + 1);
    const toPath = `${newPrefix}/${relativePart}`;
    const { error } = await admin.storage.from("documents").move(fromPath, toPath);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (allFiles.length === 0) {
    const { error } = await admin.storage
      .from("documents")
      .upload(`${newPrefix}/.keep`, new Uint8Array(0), {
        upsert: true,
        contentType: "application/octet-stream",
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
