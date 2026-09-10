import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

export async function GET(_request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { data, error } = await supabase
    .from("bug_features")
    .select("id, title, description, type, status, attachments, created_by, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { supabase, user, tenantId } = await withAuth();
  if (!supabase || !user || !tenantId) return unauthorized();

  const body = await request.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "Titel ist erforderlich" }, { status: 400 });

  const { data, error } = await supabase
    .from("bug_features")
    .insert({
      tenant_id: tenantId,
      created_by: user.id,
      title: body.title.trim(),
      description: body.description || null,
      type: body.type === "bug" ? "bug" : "feature",
      status: body.status ?? "backlog",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
