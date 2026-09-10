import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized, badRequest } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/contacts?search=müller&role=owner&category=Hausverwaltung
export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search");
  const role = searchParams.get("role");
  const category = searchParams.get("category");
  const ownerId = searchParams.get("owner_id");
  const propertyId = searchParams.get("property_id");
  const limit = parseInt(searchParams.get("limit") ?? "100");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  if (role || propertyId) {
    const includeEnded = searchParams.get("include_ended") === "true";

    let query = supabase
      .from("contact_roles")
      .select(`
        id,
        contact_id,
        role,
        valid_from,
        valid_to,
        is_primary,
        property_id,
        unit_id,
        contacts!inner (
          id, type, salutation, first_name, last_name, company_name,
          emails, phones, language
        ),
        units ( id, unit_number, floor )
      `)
      .is("deleted_at", null);

    if (role) query = query.eq("role", role);
    if (propertyId) query = query.eq("property_id", propertyId);
    if (!includeEnded) {
      query = query.or("valid_to.is.null,valid_to.gt." + new Date().toISOString().split("T")[0]);
    }
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  let query = supabase
    .from("contacts")
    .select("id, type, salutation, first_name, last_name, company_name, emails, phones, website, owner_id, language, category, lead_source, created_at")
    .order("last_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(
      `last_name.ilike.%${search}%,first_name.ilike.%${search}%,company_name.ilike.%${search}%`
    );
  }
  if (category) query = query.eq("category", category);
  if (ownerId) query = query.eq("owner_id", ownerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ownerIds = [...new Set((data ?? []).map((c) => c.owner_id).filter(Boolean))];
  let profileMap: Record<string, { name: string; initials: string | null }> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, initials")
      .in("id", ownerIds);
    for (const p of profiles ?? []) profileMap[p.id] = { name: p.name, initials: p.initials };
  }

  const result = (data ?? []).map((c) => ({ ...c, owner: profileMap[c.owner_id] ?? null }));
  return NextResponse.json(result);
}

// DELETE /api/contacts  { ids: string[] }  – Bulk-Soft-Delete
export async function DELETE(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return badRequest("ids erforderlich");

  const admin = createAdminClient();
  const { error } = await admin
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deleted: ids.length });
}

// POST /api/contacts
export async function POST(request: NextRequest) {
  const { supabase, user, tenantId } = await withAuth();
  if (!supabase || !user || !tenantId) return unauthorized();

  const body = await request.json();

  if (!body.type) return badRequest("Pflichtfeld: type");
  if (body.type === "natural_person" && !body.last_name) {
    return badRequest("Pflichtfeld: last_name (für natürliche Personen)");
  }
  if (body.type === "legal_entity" && !body.company_name) {
    return badRequest("Pflichtfeld: company_name (für juristische Personen)");
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      tenant_id: tenantId,
      created_by: user.id,
      owner_id: body.owner_id ?? user.id,
      type: body.type,
      salutation: body.salutation ?? null,
      academic_title: body.academic_title ?? null,
      first_name: body.first_name ?? null,
      last_name: body.last_name ?? null,
      company_name: body.company_name ?? null,
      date_of_birth: body.date_of_birth ?? null,
      nationality: body.nationality ?? null,
      language: body.language ?? "de",
      emails: body.emails ?? [],
      phones: body.phones ?? [],
      addresses: body.addresses ?? [],
      tax_id: body.tax_id ?? null,
      vat_id: body.vat_id ?? null,
      gwg_data: body.gwg_data ?? null,
      gdpr_consents: body.gdpr_consents ?? [],
      notes: body.notes ?? null,
      availability: body.availability ?? null,
      website: body.website ?? null,
      category: body.category ?? null,
      lead_source: body.lead_source ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
