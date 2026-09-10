import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function escapeIcal(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    out.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return out.join("\r\n");
}

function icalStart(dateStr: string, timeStr: string | null): string {
  if (!timeStr) return `DTSTART;VALUE=DATE:${dateStr.replace(/-/g, "")}`;
  const dt = `${dateStr.replace(/-/g, "")}T${timeStr.replace(":", "")}00`;
  return `DTSTART;TZID=Europe/Berlin:${dt}`;
}

function icalEnd(dateStr: string, timeStr: string | null): string {
  if (!timeStr) {
    const d = new Date(dateStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return `DTEND;VALUE=DATE:${d.toISOString().slice(0, 10).replace(/-/g, "")}`;
  }
  const [h, m] = timeStr.split(":").map(Number);
  const endH = String(h + 1).padStart(2, "0");
  return `DTEND;TZID=Europe/Berlin:${dateStr.replace(/-/g, "")}T${endH}${String(m).padStart(2, "0")}00`;
}

// GET /api/deadlines/ical?token=<ical_token>
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Token fehlt", { status: 400 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, tenant_id")
    .eq("ical_token", token)
    .single();

  if (!profile?.tenant_id) {
    return new NextResponse("Ungültiger Token", { status: 401 });
  }

  const { data: deadlines } = await admin
    .from("deadlines")
    .select("id, date, time, title, description, type, location, assigned_to, completed")
    .eq("tenant_id", profile.tenant_id)
    .is("deleted_at", null)
    .order("date", { ascending: true });

  const now = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

  const events = (deadlines ?? []).map((d) => {
    const prefix = d.type === "frist" ? "[Frist] " : "[Termin] ";
    const lines: string[] = [
      "BEGIN:VEVENT",
      `UID:deadline-${d.id}@akturio`,
      `DTSTAMP:${now}`,
      foldLine(icalStart(d.date, d.time ?? null)),
      foldLine(icalEnd(d.date, d.time ?? null)),
      foldLine(`SUMMARY:${escapeIcal(prefix + d.title)}`),
    ];
    if (d.description) lines.push(foldLine(`DESCRIPTION:${escapeIcal(d.description)}`));
    if (d.location) lines.push(foldLine(`LOCATION:${escapeIcal(d.location)}`));
    lines.push(`CATEGORIES:${d.type === "frist" ? "Frist" : "Termin"}`);
    lines.push(`STATUS:${d.completed ? "CANCELLED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
    return lines.join("\r\n");
  });

  const cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Berko AI CRM//Fristen und Termine//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Fristen & Termine – Berko AI",
    "X-WR-TIMEZONE:Europe/Berlin",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(cal, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="akturio-kalender.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
