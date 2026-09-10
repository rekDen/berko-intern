import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";

// GET /api/emails?folder=inbox&read=false
export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const read = searchParams.get("read");
  const folder = searchParams.get("folder");

  let query = supabase
    .from("emails")
    .select("*")
    .eq("created_by", user.id)
    .order("date", { ascending: false });

  if (folder) {
    query = query.eq("folder", folder);
  } else {
    query = query.eq("folder", "inbox");
  }

  if (read !== null) query = query.eq("read", read === "true");

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/emails
export async function POST(request: NextRequest) {
  const { supabase, user, tenantId } = await withAuth();
  if (!supabase || !user || !tenantId) return unauthorized();

  const body = await request.json();
  const { from_address, from_name, subject, body: emailBody } = body;

  if (!from_address || !from_name || !subject || !emailBody) {
    return badRequest("Pflichtfelder: from_address, from_name, subject, body");
  }

  const { data, error } = await supabase
    .from("emails")
    .insert({
      tenant_id: tenantId,
      created_by: user.id,
      from_address,
      from_name,
      subject,
      body: emailBody,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
