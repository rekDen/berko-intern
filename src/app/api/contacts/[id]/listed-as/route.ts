import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import type { ContactPerson } from "@/types/crm";

type Params = { params: Promise<{ id: string }> };

// GET /api/contacts/:id/listed-as
// Liefert alle anderen Kontakte, die diese Person in ihren Ansprechpartnern
// (contact_persons[].contact_id) führen – inkl. der dort hinterlegten Funktion
// & Kontaktdaten. Exakte Zuordnung über die contact_id-Referenz.
export async function GET(_request: NextRequest, { params }: Params) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { id } = await params;

  // JSONB-Containment: Kontakte, deren contact_persons ein Element mit dieser
  // contact_id enthalten (RLS beschränkt bereits auf den Mandanten).
  // Hinweis: .contains() serialisiert Array-of-Objects für JSONB falsch
  // ("invalid input syntax for type json"). Daher der cs-Operator (@>) mit
  // korrekt als JSON-String übergebenem Wert.
  const { data: candidates, error } = await supabase
    .from("contacts")
    .select("id, type, first_name, last_name, company_name, contact_persons")
    .neq("id", id)
    .filter("contact_persons", "cs", JSON.stringify([{ contact_id: id }]));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (candidates ?? []).flatMap((c) => {
    const person = ((c.contact_persons ?? []) as ContactPerson[]).find(
      (p) => p.contact_id === id
    );
    if (!person) return [];
    return [{
      contact_id: c.id,
      contact_type: c.type,
      contact_label:
        c.type === "legal_entity"
          ? c.company_name ?? "—"
          : [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
      position: person.position ?? null,
      email: person.email ?? null,
      phones: person.phones ?? [],
    }];
  });

  return NextResponse.json(results);
}
