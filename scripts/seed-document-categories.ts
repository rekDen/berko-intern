/**
 * Seed der globalen DMS-Kategorie-Taxonomie (document_categories).
 *
 * Liest die `insert into document_categories … values …;`-Blöcke aus
 * scripts/seed-dms.sql (NUR Kategorien – Marker & Test-Dokumente werden
 * ignoriert) und fügt sie über den Service-Role-Client idempotent ein
 * (bereits vorhandene IDs werden übersprungen).
 *
 * Dry-Run:  npx tsx --env-file=.env.local scripts/seed-document-categories.ts
 * Anwenden: npx tsx --env-file=.env.local scripts/seed-document-categories.ts --apply
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createAdminClient } from "../src/lib/supabase/admin";

const APPLY = process.argv.includes("--apply");
const admin = createAdminClient();

const COLUMNS = [
  "id", "parent_id", "code", "group_code", "name_de", "name_en", "name_ru",
  "level", "allowed_roles", "supports_fiscal_year", "search_synonyms", "sort_order",
] as const;

// Split auf oberster Ebene (respektiert einfache Quotes und optional Klammern).
function splitTop(s: string, open?: string, close?: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQ = false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === "'") {
        if (s[i + 1] === "'") { buf += "''"; i++; continue; } // escaptes Quote
        inQ = false; buf += c; continue;
      }
      buf += c; continue;
    }
    if (c === "'") { inQ = true; buf += c; continue; }
    if (open && c === open) { depth++; if (depth === 1) continue; buf += c; continue; }
    if (close && c === close) { depth--; if (depth === 0) { out.push(buf); buf = ""; continue; } buf += c; continue; }
    if (!open && c === "," && depth === 0) { out.push(buf); buf = ""; continue; }
    if (open) { if (depth > 0) buf += c; continue; }
    buf += c;
  }
  if (!open && buf.trim()) out.push(buf);
  return out;
}

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  // String in einfachen Quotes → Quotes entfernen, '' → '
  const inner = v.replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'");
  // Postgres-Array '{a,b}' → JS-Array
  if (inner.startsWith("{") && inner.endsWith("}")) {
    const body = inner.slice(1, -1).trim();
    return body ? body.split(",").map((x) => x.trim()).filter(Boolean) : [];
  }
  return inner;
}

function main() {
  const sql = readFileSync(join(process.cwd(), "scripts/seed-dms.sql"), "utf8");

  // Alle document_categories-Insert-Blöcke einsammeln.
  const blockRe = /insert\s+into\s+document_categories\s*\([^)]*\)\s*values([\s\S]*?);/gi;
  const rows: Record<string, unknown>[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(sql)) !== null) {
    const tuples = splitTop(m[1], "(", ")");
    for (const t of tuples) {
      const fields = splitTop(t).map((f) => f.trim());
      if (fields.length !== COLUMNS.length) {
        throw new Error(`Feldanzahl ${fields.length} ≠ ${COLUMNS.length} bei Tuple: ${t.slice(0, 80)}…`);
      }
      const row: Record<string, unknown> = {};
      COLUMNS.forEach((col, i) => { row[col] = parseScalar(fields[i]); });
      rows.push(row);
    }
  }

  const byLevel: Record<string, number> = {};
  for (const r of rows) byLevel[r.level as string] = (byLevel[r.level as string] ?? 0) + 1;
  console.log(`Geparste Kategorien: ${rows.length}`);
  console.log("nach level:", byLevel);
  console.log("Beispiele:");
  for (const r of rows.slice(0, 3)) console.log("  ", JSON.stringify(r));
  const contractLeaves = rows.filter((r) => r.level === "contract" && String(r.code).includes("."));
  console.log(`\ncontract-Kategorien mit '.' (für Deals/Verträge relevant): ${contractLeaves.length}`);
  contractLeaves.forEach((r) => console.log(`   ${r.code} — ${r.name_de}`));

  if (!APPLY) {
    console.log("\nℹ️  Dry-Run – nichts geschrieben. Mit --apply einspielen.");
    return;
  }

  // Groups (parent_id null) zuerst, dann Blätter → self-FK sicher erfüllt.
  const groups = rows.filter((r) => r.parent_id == null);
  const leaves = rows.filter((r) => r.parent_id != null);

  (async () => {
    for (const [label, batch] of [["Gruppen", groups], ["Unterkategorien", leaves]] as const) {
      const { error } = await admin
        .from("document_categories")
        .upsert(batch, { onConflict: "id", ignoreDuplicates: true });
      if (error) { console.error(`⚠ Fehler (${label}):`, error.message); process.exit(1); }
      console.log(`✓ ${label}: ${batch.length} eingespielt/vorhanden`);
    }
    const { count } = await admin.from("document_categories").select("*", { count: "exact", head: true });
    console.log(`\n✅ document_categories enthält jetzt ${count} Einträge.`);
  })();
}

main();
