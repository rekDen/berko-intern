import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { getGoogleClient, listEvents } from "@/lib/google/calendar";

// GET /api/google-calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from und to erforderlich" }, { status: 400 });
  }

  const conn = await getGoogleClient(user.id);
  if (!conn) return NextResponse.json({ connected: false, events: [] });

  const events = await listEvents(conn.client, conn.connection.google_calendar_id, from, to);
  return NextResponse.json({ connected: true, events });
}
