/**
 * Backfill: contact_id für bestehende Ansprechpartner (contact_persons) nachtragen.
 *
 * Ansprechpartner, die vor Einführung der contact_id-Referenz angelegt wurden,
 * haben kein contact_id. Dieses Skript ordnet sie den passenden eigenständigen
 * Kontakten (natürliche Personen) desselben Mandanten zu – per Name + E-Mail.
 *
 * Zuordnungsregeln (konservativ, um Fehlverknüpfungen zu vermeiden):
 *   - Name (Vor- + Nachname) muss übereinstimmen.
 *   - Hat der Ansprechpartner eine E-Mail: der Kontakt muss dieselbe E-Mail haben.
 *   - Hat er keine E-Mail: nur verknüpfen, wenn der Name im Mandanten eindeutig ist.
 *   - Bereits gesetzte contact_id bleiben unangetastet.
 *
 * Dry-Run:  npx tsx --env-file=.env.local scripts/backfill-contact-person-ids.ts
 * Anwenden: npx tsx --env-file=.env.local scripts/backfill-contact-person-ids.ts --apply
 */
import { createAdminClient } from "../src/lib/supabase/admin";
import type { ContactPerson, EmailEntry } from "../src/types/crm";

const APPLY = process.argv.includes("--apply");
const admin = createAdminClient();

type ContactRow = {
  id: string;
  tenant_id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  emails: EmailEntry[] | null;
  contact_persons: ContactPerson[] | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const nameKey = (first: string | null, last: string | null) =>
  [first, last].map(norm).filter(Boolean).join(" ");

async function main() {
  const { data, error } = await admin
    .from("contacts")
    .select("id, tenant_id, type, first_name, last_name, company_name, emails, contact_persons");
  if (error) throw error;
  const contacts = (data ?? []) as ContactRow[];

  // Index natürlicher Personen je Mandant: name -> [{id, emails}]
  const byTenantName = new Map<string, { id: string; emails: string[] }[]>();
  for (const c of contacts) {
    if (c.type !== "natural_person") continue;
    const key = `${c.tenant_id}::${nameKey(c.first_name, c.last_name)}`;
    if (!key.endsWith("::")) {
      const emails = (c.emails ?? []).map((e) => norm(e.value)).filter(Boolean);
      const arr = byTenantName.get(key) ?? [];
      arr.push({ id: c.id, emails });
      byTenantName.set(key, arr);
    }
  }

  let personsTotal = 0;
  let alreadyLinked = 0;
  let matched = 0;
  let ambiguous = 0;
  let noMatch = 0;
  let contactsUpdated = 0;

  for (const c of contacts) {
    const persons = c.contact_persons ?? [];
    if (persons.length === 0) continue;

    let changed = false;
    const next = persons.map((p) => {
      personsTotal++;
      if (p.contact_id) { alreadyLinked++; return p; }

      const name = nameKey(p.first_name, p.last_name);
      if (!name) { noMatch++; return p; }

      // Nicht auf sich selbst verlinken (z. B. Person-Kontakt mit eigenem AP).
      const candidates = (byTenantName.get(`${c.tenant_id}::${name}`) ?? [])
        .filter((cand) => cand.id !== c.id);
      if (candidates.length === 0) { noMatch++; return p; }

      const email = norm(p.email);
      let target: string | null = null;
      if (email) {
        const withEmail = candidates.filter((cand) => cand.emails.includes(email));
        if (withEmail.length === 1) target = withEmail[0].id;
        else if (withEmail.length > 1) { ambiguous++; return p; }
        // keine E-Mail-Übereinstimmung → auf Namenslogik zurückfallen
      }
      if (!target) {
        if (candidates.length === 1) target = candidates[0].id;
        else { ambiguous++; return p; }
      }

      matched++;
      changed = true;
      console.log(
        `  ✓ ${c.company_name ?? nameKey(c.first_name, c.last_name)} → AP "${p.first_name} ${p.last_name}" verknüpft mit Kontakt ${target}`
      );
      return { ...p, contact_id: target };
    });

    if (changed) {
      contactsUpdated++;
      if (APPLY) {
        const { error: upErr } = await admin
          .from("contacts")
          .update({ contact_persons: next })
          .eq("id", c.id);
        if (upErr) console.log(`  ⚠ Update-Fehler bei ${c.id}: ${upErr.message}`);
      }
    }
  }

  console.log("\n──────── Zusammenfassung ────────");
  console.log(`Ansprechpartner gesamt:      ${personsTotal}`);
  console.log(`bereits verknüpft:           ${alreadyLinked}`);
  console.log(`neu verknüpft:               ${matched}`);
  console.log(`mehrdeutig (übersprungen):   ${ambiguous}`);
  console.log(`kein Treffer:                ${noMatch}`);
  console.log(`betroffene Kontakte:         ${contactsUpdated}`);
  console.log(APPLY ? "\n✅ Änderungen gespeichert." : "\nℹ️  Dry-Run – nichts geschrieben. Mit --apply anwenden.");
}

main().catch((e) => { console.error(e); process.exit(1); });
