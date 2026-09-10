import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleClient, createEvent, updateEvent, deleteEvent } from "@/lib/google/calendar";

export type DeadlineRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  date: string;
  time: string | null;
  type: "frist" | "termin";
  google_event_id: string | null;
};

function toInput(d: DeadlineRow) {
  return {
    title: d.title,
    description: d.description,
    location: d.location,
    date: d.date,
    time: d.time,
    type: d.type,
  };
}

/**
 * Mirrors an Berko AI deadline to the user's Google Calendar. Best-effort:
 * any failure is swallowed so the core CRUD operation is never blocked.
 */
export async function mirrorUpsert(userId: string, d: DeadlineRow): Promise<void> {
  try {
    const conn = await getGoogleClient(userId);
    if (!conn || !conn.connection.sync_enabled) return;
    const calId = conn.connection.google_calendar_id;

    if (d.google_event_id) {
      await updateEvent(conn.client, calId, d.google_event_id, toInput(d));
      return;
    }
    const eventId = await createEvent(conn.client, calId, toInput(d));
    if (eventId) {
      await createAdminClient()
        .from("deadlines")
        .update({ google_event_id: eventId })
        .eq("id", d.id);
    }
  } catch {
    /* best effort */
  }
}

export async function mirrorDelete(userId: string, googleEventId: string | null): Promise<void> {
  if (!googleEventId) return;
  try {
    const conn = await getGoogleClient(userId);
    if (!conn) return;
    await deleteEvent(conn.client, conn.connection.google_calendar_id, googleEventId);
  } catch {
    /* best effort */
  }
}
