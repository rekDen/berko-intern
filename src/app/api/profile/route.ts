import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/profile — load current user's profile
export async function GET() {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("name, title, initials, firm_name, language")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ id: user.id, name: null, title: null, initials: null, firm_name: null, language: null });
  }

  return NextResponse.json({ ...data, id: user.id, email: user.email });
}

// PATCH /api/profile — update current user's profile
export async function PATCH(request: NextRequest) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();

  const body = await request.json();
  const { name, title, initials, firm_name, language } = body;

  if (name !== undefined && typeof name !== "string") return badRequest("name must be a string");

  const updates: Record<string, string | null> = {};
  if (name !== undefined) updates.name = name || null;
  if (title !== undefined) updates.title = title || null;
  if (initials !== undefined) updates.initials = initials || null;
  if (firm_name !== undefined) updates.firm_name = firm_name || null;
  if (language !== undefined) updates.language = language || null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("name, title, initials, firm_name, language")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...data, email: user.email });
}
