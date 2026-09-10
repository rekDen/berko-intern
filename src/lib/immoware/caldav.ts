import ICAL from "ical.js";

/**
 * Read-only CalDAV-Client für den Immoware24-Kalender. Nutzt ein einziges,
 * app-weites Basic-Auth-Konto (kein Pro-User-OAuth wie bei Google) — die
 * Zugangsdaten kommen aus IMMOWARE_CALDAV_*.
 */

export function immowareConfigured(): boolean {
  return Boolean(
    process.env.IMMOWARE_CALDAV_URL &&
      process.env.IMMOWARE_CALDAV_USER &&
      process.env.IMMOWARE_CALDAV_PASSWORD,
  );
}

function baseUrl(): string {
  return (process.env.IMMOWARE_CALDAV_URL ?? "").replace(/\/?$/, "/");
}

function authHeader(): string {
  const user = process.env.IMMOWARE_CALDAV_USER ?? "";
  const pass = process.env.IMMOWARE_CALDAV_PASSWORD ?? "";
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function davRequest(method: string, url: string, depth: string, body: string): Promise<string> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Depth: depth,
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
  });
  if (!res.ok && res.status !== 207) {
    throw new Error(`CalDAV ${method} ${url} -> HTTP ${res.status}`);
  }
  return res.text();
}

/** Extrahiert alle <d:response>…</d:response>-Blöcke aus einer WebDAV-Multistatus-Antwort. */
function splitResponses(xml: string): string[] {
  const matches = xml.match(/<[a-zA-Z0-9]*:response>[\s\S]*?<\/[a-zA-Z0-9]*:response>/g);
  return matches ?? [];
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<[a-zA-Z0-9]*:${tag}[^>]*>([\\s\\S]*?)<\\/[a-zA-Z0-9]*:${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

type SubCalendar = { href: string; name: string };

/** PROPFIND Depth:1 auf das Kalender-Home — listet alle Unterkalender auf. */
async function listCalendars(): Promise<SubCalendar[]> {
  const xml = await davRequest(
    "PROPFIND",
    baseUrl(),
    "1",
    `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
  </D:prop>
</D:propfind>`,
  );

  const calendars: SubCalendar[] = [];
  for (const block of splitResponses(xml)) {
    const href = extractTag(block, "href");
    const resourcetype = extractTag(block, "resourcetype") ?? "";
    if (!href || !/calendar\s*\/?>/i.test(resourcetype)) continue;
    // Home-Collection selbst überspringen (hat keinen eigenen Displaynamen/ist kein Kalender-Blatt)
    if (href.replace(/\/$/, "") === new URL(baseUrl()).pathname.replace(/\/$/, "")) continue;
    const name = decodeXmlEntities(extractTag(block, "displayname") ?? href);
    calendars.push({ href, name });
  }
  return calendars;
}

/** REPORT calendar-query mit Zeitfenster-Filter auf einem Unterkalender. */
async function fetchCalendarData(href: string, fromIso: string, toIso: string): Promise<string[]> {
  const url = new URL(href, baseUrl()).toString();
  const start = fromIso.replace(/[-:]/g, "") + "T000000Z";
  const end = toIso.replace(/[-:]/g, "") + "T235959Z";

  const xml = await davRequest(
    "REPORT",
    url,
    "1",
    `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${start}" end="${end}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`,
  );

  return splitResponses(xml)
    .map((block) => extractTag(block, "calendar-data"))
    .filter((d): d is string => Boolean(d))
    .map(decodeXmlEntities);
}

export type ImmowareEvent = {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string; // ISO date (allDay) oder ISO datetime
  end: string;
  allDay: boolean;
  calendarName: string;
};

/** Baut aus einem ICAL.Time einen ISO-String (datum- oder datetime-genau). */
function toIso(t: ICAL.Time): string {
  if (t.isDate) {
    return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
  }
  return t.toJSDate().toISOString();
}

/** Zerlegt ein VCALENDAR-Blob in (ggf. expandierte) Vorkommen innerhalb [from, to]. */
function expandEvents(icsText: string, calendarName: string, rangeStart: Date, rangeEnd: Date): ImmowareEvent[] {
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");
  const out: ImmowareEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (event.isRecurrenceException()) continue; // Overrides werden über getOccurrenceDetails() der Master-Instanz aufgelöst

    const summary = event.summary || "(ohne Titel)";
    const description = event.description || null;
    const location = event.location || null;

    if (!event.isRecurring()) {
      const s = event.startDate.toJSDate();
      const e = event.endDate.toJSDate();
      if (e < rangeStart || s > rangeEnd) continue;
      out.push({
        id: event.uid,
        summary,
        description,
        location,
        start: toIso(event.startDate),
        end: toIso(event.endDate),
        allDay: event.startDate.isDate,
        calendarName,
      });
      continue;
    }

    const iterator = event.iterator();
    let next: ICAL.Time | null;
    let guard = 0;
    while ((next = iterator.next()) && guard++ < 2000) {
      if (next.toJSDate() > rangeEnd) break;
      const details = event.getOccurrenceDetails(next);
      const e = details.endDate.toJSDate();
      if (e < rangeStart) continue;
      out.push({
        id: `${event.uid}-${next.toString()}`,
        summary: details.item.summary || summary,
        description: details.item.description || description,
        location: details.item.location || location,
        start: toIso(details.startDate),
        end: toIso(details.endDate),
        allDay: details.startDate.isDate,
        calendarName,
      });
    }
  }
  return out;
}

/** Lädt alle Termine aus allen Unterkalendern des Immoware24-Kalender-Homes für [fromIso, toIso] (YYYY-MM-DD). */
export async function listImmowareEvents(fromIso: string, toIso: string): Promise<ImmowareEvent[]> {
  const rangeStart = new Date(fromIso + "T00:00:00Z");
  const rangeEnd = new Date(toIso + "T23:59:59Z");

  const calendars = await listCalendars();
  const results = await Promise.all(
    calendars.map(async (cal) => {
      try {
        const blobs = await fetchCalendarData(cal.href, fromIso, toIso);
        return blobs.flatMap((ics) => {
          try {
            return expandEvents(ics, cal.name, rangeStart, rangeEnd);
          } catch {
            return [];
          }
        });
      } catch {
        return [];
      }
    }),
  );

  return results.flat().sort((a, b) => a.start.localeCompare(b.start));
}
