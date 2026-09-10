import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

type Attachment = { name: string; url: string; size: number; mime_type: string; path: string };

export async function POST(request: NextRequest, { params }: Params) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();

  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Datei fehlt" }, { status: 400 });

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${tenantId}/${id}/${Date.now()}_${safeName}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("bug-features")
    .upload(path, Buffer.from(bytes), { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from("bug-features").getPublicUrl(path);

  const attachment: Attachment = { name: file.name, url: publicUrl, size: file.size, mime_type: file.type, path };

  const { data: existing } = await admin.from("bug_features").select("attachments").eq("id", id).single();
  const attachments: Attachment[] = [...((existing?.attachments as Attachment[]) ?? []), attachment];
  await admin.from("bug_features").update({ attachments }).eq("id", id);

  return NextResponse.json(attachment, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const { id } = await params;
  const { path } = await request.json() as { path: string };

  const admin = createAdminClient();
  await admin.storage.from("bug-features").remove([path]);

  const { data: existing } = await admin.from("bug_features").select("attachments").eq("id", id).single();
  const attachments = ((existing?.attachments as Attachment[]) ?? []).filter((a) => a.path !== path);
  await admin.from("bug_features").update({ attachments }).eq("id", id);

  return NextResponse.json({ success: true });
}
