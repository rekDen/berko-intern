import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/communications/:id
export async function PATCH(request: NextRequest, { params }: Params) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const { data: existing } = await supabase
    .from("communications")
    .select("created_by")
    .eq("id", id)
    .single();

  if (!existing || existing.created_by !== user.id) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const allowed = ["channel", "direction", "subject", "body", "occurred_at", "duration_seconds",
    "gatekeeper_bypassed", "call_status", "call_result", "follow_up", "sentiment", "contact_person"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from("communications")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/communications/:id — creator or admin (dennis@berko.ai) may delete
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { id } = await params;

  const { data: existing } = await supabase
    .from("communications")
    .select("created_by")
    .eq("id", id)
    .single();

  const isAdmin = user.email === "dennis@berko.ai";
  if (!existing || (!isAdmin && existing.created_by !== user.id)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const { error } = await supabase.from("communications").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
