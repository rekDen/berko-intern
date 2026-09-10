// Lädt ALLE Kontakte für Auswahllisten (z. B. Hauptkontakt bei Deals).
//
// Die Route /api/contacts liefert pro Aufruf höchstens `limit` Datensätze
// (Default 100) und sortiert nach last_name aufsteigend. Firmen (legal_entity)
// haben last_name = null und landen dadurch ganz am Ende – bei vielen Kontakten
// fielen sie aus dem Fenster und waren nicht wählbar. Deshalb paginieren wir,
// bis alle Datensätze geladen sind.
export async function fetchAllContacts<T = unknown>(): Promise<T[]> {
  const pageSize = 500;
  let offset = 0;
  const all: T[] = [];
  for (;;) {
    const res = await fetch(`/api/contacts?limit=${pageSize}&offset=${offset}`);
    if (!res.ok) break;
    const page = (await res.json()) as unknown;
    if (!Array.isArray(page)) break;
    all.push(...(page as T[]));
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
