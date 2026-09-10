import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

// GET /api/akquisition/check-existing?ids=ChIJ1,ChIJ2,...
// Returns { [place_id]: contact_id } for already-imported contacts
export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) return NextResponse.json({});

  const { data, error } = await supabase
    .from("contacts")
    .select("id, notes")
    .is("deleted_at", null)
    .like("notes", "%[place_id:%");

  if (error) return NextResponse.json({}, { status: 500 });

  const result: Record<string, string> = {};
  for (const contact of data ?? []) {
    const match = contact.notes?.match(/\[place_id:([^\]]+)\]/);
    if (match && ids.includes(match[1])) {
      result[match[1]] = contact.id;
    }
  }

  return NextResponse.json(result);
}
