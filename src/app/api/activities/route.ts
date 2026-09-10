import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();
  const { searchParams } = request.nextUrl;
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");
  const userId = searchParams.get("user_id");
  const limit = parseInt(searchParams.get("limit") ?? "100");
  let q = supabase.from("activities").select("*, profiles:user_id(name)").order("performed_at", { ascending: false }).limit(limit);
  if (entityType) q = q.eq("entity_type", entityType);
  if (entityId) q = q.eq("entity_id", entityId);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { supabase, user, tenantId } = await withAuth();
  if (!supabase || !user || !tenantId) return unauthorized();
  const body = await request.json();
  const { data, error } = await supabase.from("activities").insert({
    tenant_id: tenantId,
    user_id: user.id,
    entity_type: body.entity_type,
    entity_id: body.entity_id,
    type: body.type,
    title: body.title ?? null,
    description: body.description ?? null,
    metadata: body.metadata ?? {},
    performed_at: body.performed_at ?? new Date().toISOString(),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
