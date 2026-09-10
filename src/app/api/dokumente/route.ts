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

export async function GET(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const admin = createAdminClient();
  const raw = request.nextUrl.searchParams.get("path") ?? "";
  const sanitized = sanitizePath(raw);
  const storagePath = sanitized ? `dokumente/${sanitized}` : "dokumente";

  const { data, error } = await admin.storage
    .from("documents")
    .list(storagePath, { limit: 1000, sortBy: { column: "name", order: "asc" } });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const folders: { name: string }[] = [];
  const files: {
    name: string;
    size: number;
    contentType: string;
    updatedAt: string;
    storagePath: string;
  }[] = [];

  for (const item of data ?? []) {
    if (item.name === ".keep") continue;
    if (item.id === null) {
      folders.push({ name: item.name });
    } else {
      files.push({
        name: item.name,
        size: item.metadata?.size ?? 0,
        contentType: item.metadata?.mimetype ?? "application/octet-stream",
        updatedAt: item.updated_at ?? item.created_at ?? "",
        storagePath: `${sanitized ? sanitized + "/" : ""}${item.name}`,
      });
    }
  }

  return NextResponse.json({ folders, files });
}

export async function DELETE(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const admin = createAdminClient();
  const { searchParams } = request.nextUrl;
  const raw = searchParams.get("path") ?? "";
  const type = searchParams.get("type");

  if (!raw || !type) return badRequest("path und type erforderlich");
  if (type !== "folder" && type !== "file") return badRequest("type muss folder oder file sein");

  const sanitized = sanitizePath(raw);
  if (!sanitized) return badRequest("Ungültiger Pfad");

  if (type === "file") {
    const fullPath = `dokumente/${sanitized}`;
    const { error } = await admin.storage.from("documents").remove([fullPath]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const folderPrefix = `dokumente/${sanitized}`;
  const allFiles = await listAllFiles(admin, folderPrefix);

  if (allFiles.length > 0) {
    const { error } = await admin.storage.from("documents").remove(allFiles);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
