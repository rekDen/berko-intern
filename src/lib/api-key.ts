import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Vergleicht einen übermittelten API-Key in konstanter Zeit mit dem
 * erwarteten Wert. Fehlt der erwartete Wert (Env-Variable nicht gesetzt),
 * wird immer abgelehnt.
 */
export function apiKeyMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  // Hashen gleicht die Länge an, damit timingSafeEqual nichts über die Länge verrät.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
