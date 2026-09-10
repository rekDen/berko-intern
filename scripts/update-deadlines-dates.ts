/**
 * Update-Script: Verschiebt alle bestehenden Fristen & Termine auf nächste Woche.
 *
 * Ausführen: npx tsx scripts/update-deadlines-dates.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Nächste Woche: Mo 09.06. – Fr 13.06.2026
const NEXT_WEEK_DATES = [
  "2026-06-09",
  "2026-06-09",
  "2026-06-10",
  "2026-06-10",
  "2026-06-11",
  "2026-06-11",
  "2026-06-12",
  "2026-06-12",
  "2026-06-13",
];

async function main() {
  console.log("Lade bestehende Fristen & Termine…");

  const { data: deadlines, error: fetchError } = await admin
    .from("deadlines")
    .select("id, date, title")
    .order("date", { ascending: true });

  if (fetchError) {
    console.error("Fehler beim Laden:", fetchError.message);
    process.exit(1);
  }

  if (!deadlines || deadlines.length === 0) {
    console.log("Keine Einträge gefunden.");
    return;
  }

  console.log(`${deadlines.length} Einträge gefunden. Aktualisiere Datum…\n`);

  for (let i = 0; i < deadlines.length; i++) {
    const newDate = NEXT_WEEK_DATES[i % NEXT_WEEK_DATES.length];
    const { error } = await admin
      .from("deadlines")
      .update({ date: newDate })
      .eq("id", deadlines[i].id);

    if (error) {
      console.error(`  Fehler bei "${deadlines[i].title}":`, error.message);
    } else {
      console.log(`  ${deadlines[i].date} → ${newDate}  |  ${deadlines[i].title}`);
    }
  }

  console.log("\nAlle Termine & Fristen aktualisiert.");
}

main().catch((err) => {
  console.error("Unerwarteter Fehler:", err);
  process.exit(1);
});
