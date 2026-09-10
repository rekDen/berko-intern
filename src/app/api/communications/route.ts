import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";

const ALLOWED_CHANNELS = [
  "email", "phone", "letter", "meeting", "online_meeting", "portal", "note",
];

// GET /api/communications?contact_id=…&ticket_id=…&property_id=…&unit_id=…&channel=phone&channel=note
export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const sp = request.nextUrl.searchParams;
  const contactId = sp.get("contact_id");
  const ticketId = sp.get("ticket_id");
  const propertyId = sp.get("property_id");
  const unitId = sp.get("unit_id");
  const channels = sp.getAll("channel");
  const createdBy = sp.get("created_by");
  const limit = parseInt(sp.get("limit") ?? "200");

  let query = supabase
    .from("communications")
    .select(`
      id, channel, direction, subject, body, occurred_at, created_by,
      ticket_id, contact_id, property_id, unit_id, duration_seconds,
      gatekeeper_bypassed, call_status, call_result, follow_up, sentiment, contact_person,
      tickets ( id, title ),
      contacts ( id, first_name, last_name, company_name, type, contact_persons, created_at, phones )
    `)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (contactId) query = query.eq("contact_id", contactId);
  if (ticketId) query = query.eq("ticket_id", ticketId);
  if (propertyId) query = query.eq("property_id", propertyId);
  if (unitId) query = query.eq("unit_id", unitId);
  if (channels.length) query = query.in("channel", channels);
  if (createdBy) query = query.eq("created_by", createdBy);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/communications
// Variante A: existierende E-Mail referenzieren  → { email_id, contact_id?, ticket_id? }
// Variante B: Notiz / Telefonat / Meeting        → { channel, body, subject?, occurred_at?, contact_id?, ticket_id? }
export async function POST(request: NextRequest) {
  const { supabase, user, tenantId } = await withAuth();
  if (!supabase || !user || !tenantId) return unauthorized();

  const body = await request.json();
  const contactId: string | null = body.contact_id ?? null;
  const ticketId: string | null = body.ticket_id ?? null;
  const propertyId: string | null = body.property_id ?? null;
  const unitId: string | null = body.unit_id ?? null;

  if (!contactId && !ticketId && !propertyId && !unitId) {
    return badRequest("contact_id, ticket_id, property_id oder unit_id erforderlich");
  }

  // Variante A: E-Mail zuordnen
  if (body.email_id) {
    const { data: email, error: emailErr } = await supabase
      .from("emails")
      .select("from_address, from_name, subject, body, date, to_address")
      .eq("id", body.email_id)
      .single();
    if (emailErr || !email) return badRequest("E-Mail nicht gefunden");

    const direction = body.direction ?? (email.to_address ? "outbound" : "inbound");

    let resolvedContactId = contactId;
    if (!resolvedContactId && ticketId) {
      const { data: t } = await supabase
        .from("tickets")
        .select("contact_id")
        .eq("id", ticketId)
        .single();
      resolvedContactId = t?.contact_id ?? null;
    }

    const { data, error } = await supabase
      .from("communications")
      .insert({
        tenant_id: tenantId,
        created_by: user.id,
        ticket_id: ticketId,
        contact_id: resolvedContactId,
        property_id: propertyId,
        unit_id: unitId,
        channel: "email",
        direction,
        subject: email.subject,
        body: email.body,
        occurred_at: email.date,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  // Variante B: Notiz / Telefonat / Meeting
  if (!body.channel || !ALLOWED_CHANNELS.includes(body.channel)) {
    return badRequest("channel ist erforderlich (phone, meeting, online_meeting, note, …)");
  }
  if (!body.body && body.channel !== "phone") return badRequest("body ist erforderlich");

  const direction = body.direction ?? "outbound";
  const occurredAt = body.occurred_at ?? new Date().toISOString();

  let resolvedContactId = contactId;
  if (!resolvedContactId && ticketId) {
    const { data: t } = await supabase
      .from("tickets")
      .select("contact_id")
      .eq("id", ticketId)
      .single();
    resolvedContactId = t?.contact_id ?? null;
  }

  const isPhone = body.channel === "phone";

  const { data, error } = await supabase
    .from("communications")
    .insert({
      tenant_id: tenantId,
      created_by: user.id,
      ticket_id: ticketId,
      contact_id: resolvedContactId,
      property_id: propertyId,
      unit_id: unitId,
      channel: body.channel,
      direction,
      subject: body.subject ?? null,
      body: body.body ?? null,
      occurred_at: occurredAt,
      duration_seconds: isPhone ? (body.duration_seconds ?? null) : null,
      // Anruf-Metadaten nur für Telefonate übernehmen, damit ein direkt in der
      // Anrufliste angelegter Eintrag alle Felder mitführt.
      ...(isPhone ? {
        gatekeeper_bypassed: body.gatekeeper_bypassed ?? null,
        call_status: body.call_status ?? null,
        call_result: body.call_result ?? null,
        follow_up: body.follow_up ?? null,
        sentiment: body.sentiment ?? null,
        contact_person: body.contact_person ?? null,
      } : {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
