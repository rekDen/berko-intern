import { NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

const TWILIO_INBOUND_NUMBER = "+493075678957";

interface TwilioCall {
  sid: string;
  from: string;
  to: string;
  start_time: string;
  end_time: string | null;
  duration: string;
  status: string;
  caller_name: string | null;
  direction: string;
}

interface TwilioCallsResponse {
  calls: TwilioCall[];
  next_page_uri: string | null;
}

type PhoneEntry = { type: string; value: string };
type ContactPerson = {
  first_name: string;
  last_name: string;
  position?: string | null;
  phones?: PhoneEntry[];
};

interface ContactRow {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  phones: PhoneEntry[];
  contact_persons: ContactPerson[];
}

function normalizePhone(raw: string): string {
  let s = raw.replace(/[\s\-\(\)\/\.]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (s.startsWith("0") && !s.startsWith("0+")) s = "+49" + s.slice(1);
  return s;
}

function isGermanMobile(normalized: string): boolean {
  return /^\+49(15|16|17)\d/.test(normalized);
}

function phonesMatch(a: string, b: string): "exact" | "prefix" | null {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (na === nb) return "exact";
  // Prefix match only for non-mobile landlines, prefix must be >= 6 digits
  if (!isGermanMobile(na) && !isGermanMobile(nb)) {
    const da = na.replace(/\D/g, "");
    const db = nb.replace(/\D/g, "");
    const prefixLen = Math.min(da.length, db.length) - 4;
    if (prefixLen >= 6 && da.slice(0, prefixLen) === db.slice(0, prefixLen)) {
      return "prefix";
    }
  }
  return null;
}

function contactDisplayName(c: ContactRow): string {
  if (c.type === "legal_entity") return c.company_name ?? "";
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}

export async function GET() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  if (!accountSid || !apiKeySid || !apiKeySecret) {
    return NextResponse.json({ error: "Twilio-Zugangsdaten nicht konfiguriert" }, { status: 500 });
  }

  // Twilio supports Basic auth with API Key SID + Secret in place of Account SID + Auth Token
  const credentials = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString("base64");

  // Fetch incoming calls to our number (up to 200 entries, 2 pages)
  const calls: TwilioCall[] = [];
  let pageUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?To=${encodeURIComponent(TWILIO_INBOUND_NUMBER)}&Direction=inbound&PageSize=100`;

  for (let page = 0; page < 2; page++) {
    const res = await fetch(pageUrl, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!res.ok) {
      const msg = await res.text();
      return NextResponse.json({ error: `Twilio-Fehler: ${msg}` }, { status: res.status });
    }
    const json = (await res.json()) as TwilioCallsResponse;
    calls.push(...(json.calls ?? []));
    if (!json.next_page_uri) break;
    pageUrl = `https://api.twilio.com${json.next_page_uri}`;
  }

  // Fetch all contacts including contact_persons phones
  const admin = createAdminClient();
  const { data: contacts } = await admin
    .from("contacts")
    .select("id, type, first_name, last_name, company_name, phones, contact_persons")
    .is("deleted_at", null);

  const contactList: ContactRow[] = (contacts ?? []) as ContactRow[];

  // Enrich each call with matched contact/person (skip calls from our own number)
  const enriched = calls.filter((call) => call.from !== TWILIO_INBOUND_NUMBER).map((call) => {
    type MatchResult = {
      contact: { id: string; name: string };
      person: { name: string; position: string | null } | null;
      type: "exact" | "prefix";
    };

    let best: MatchResult | null = null;

    for (const contact of contactList) {
      // Check contact's own phones
      for (const phone of contact.phones ?? []) {
        const mt = phonesMatch(call.from, phone.value);
        if (mt) {
          const candidate: MatchResult = {
            contact: { id: contact.id, name: contactDisplayName(contact) },
            person: null,
            type: mt,
          };
          if (!best || mt === "exact") best = candidate;
          if (mt === "exact") break;
        }
      }
      if (best?.type === "exact") break;

      // Check contact persons
      for (const person of contact.contact_persons ?? []) {
        for (const phone of person.phones ?? []) {
          const mt = phonesMatch(call.from, phone.value);
          if (mt) {
            const candidate: MatchResult = {
              contact: { id: contact.id, name: contactDisplayName(contact) },
              person: {
                name: [person.first_name, person.last_name].filter(Boolean).join(" "),
                position: person.position ?? null,
              },
              type: mt,
            };
            if (!best || mt === "exact") best = candidate;
            if (mt === "exact") break;
          }
        }
        if (best?.type === "exact") break;
      }
      if (best?.type === "exact") break;
    }

    return {
      sid: call.sid,
      from: call.from,
      caller_name: call.caller_name ?? null,
      start_time: call.start_time,
      end_time: call.end_time ?? null,
      duration_seconds: call.duration ? parseInt(call.duration) : 0,
      status: call.status,
      contact: best?.contact ?? null,
      contact_person: best?.person ?? null,
      match_type: best?.type ?? null,
    };
  });

  return NextResponse.json(enriched);
}
