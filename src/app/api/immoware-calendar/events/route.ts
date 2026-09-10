import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { immowareConfigured, listImmowareEvents } from "@/lib/immoware/caldav";

// GET /api/immoware-calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from und to erforderlich" }, { status: 400 });
  }

  if (!immowareConfigured()) {
    return NextResponse.json({ connected: false, events: [] });
  }

  try {
    const events = await listImmowareEvents(from, to);
    return NextResponse.json({ connected: true, events });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Immoware-Kalender-Sync fehlgeschlagen";
    return NextResponse.json({ connected: true, events: [], error: message }, { status: 200 });
  }
}
