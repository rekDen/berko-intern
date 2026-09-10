// Minimaler iCalendar-Generator (RFC 5545) für Termin-/Frist-Einladungen.

type IcsInput = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  date: string;          // "YYYY-MM-DD"
  time?: string | null;  // "HH:MM" oder leer/null = ganztägig
  organizerName?: string;
  organizerEmail?: string;
  attendees?: string[];  // E-Mail-Adressen
  method?: "REQUEST" | "PUBLISH" | "CANCEL";
  sequence?: number;     // muss bei Updates/Absagen höher sein als zuvor
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function stamp(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

// Escaping gemäß RFC 5545 (Kommas, Semikolons, Backslashes, Zeilenumbrüche).
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function buildIcs(input: IcsInput): string {
  const method = input.method ?? "REQUEST";
  const day = input.date.slice(0, 10).replace(/-/g, "");
  const hasTime = !!(input.time && input.time.trim());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Berko AI//CRM//DE",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
  ];

  if (hasTime) {
    // Floating local time (kein TZID/Z) – wird im Kalender des Empfängers als lokale Zeit interpretiert.
    const [h, m] = input.time!.split(":");
    const start = `${day}T${pad(parseInt(h, 10))}${pad(parseInt(m, 10))}00`;
    // Standarddauer: 1 Stunde
    const endH = (parseInt(h, 10) + 1) % 24;
    const end = `${day}T${pad(endH)}${pad(parseInt(m, 10))}00`;
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
  } else {
    // Ganztägiger Eintrag
    const next = new Date(`${input.date.slice(0, 10)}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const endDay =
      next.getUTCFullYear().toString() + pad(next.getUTCMonth() + 1) + pad(next.getUTCDate());
    lines.push(`DTSTART;VALUE=DATE:${day}`);
    lines.push(`DTEND;VALUE=DATE:${endDay}`);
  }

  lines.push(`SUMMARY:${esc(input.title)}`);
  if (input.description) lines.push(`DESCRIPTION:${esc(input.description)}`);
  if (input.location) lines.push(`LOCATION:${esc(input.location)}`);

  if (input.organizerEmail) {
    const cn = input.organizerName ? `;CN=${esc(input.organizerName)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${input.organizerEmail}`);
  }

  for (const email of input.attendees ?? []) {
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}`
    );
  }

  // Bei einer Absage muss der Empfänger-Client den Termin entfernen können.
  lines.push(method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED");
  lines.push(`SEQUENCE:${input.sequence ?? 0}`);
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  // RFC 5545: CRLF-Zeilenenden
  return lines.join("\r\n");
}
