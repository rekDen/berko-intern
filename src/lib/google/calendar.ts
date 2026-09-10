import { OAuth2Client } from "google-auth-library";
import { createAdminClient } from "@/lib/supabase/admin";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Base URL of this app, used to build the OAuth redirect URI. */
export function appBaseUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
}

export function redirectUri(): string {
  return `${appBaseUrl()}/api/google-calendar/callback`;
}

export function newOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri(),
  );
}

export type GoogleConnection = {
  user_id: string;
  tenant_id: string;
  google_email: string | null;
  access_token: string;
  refresh_token: string;
  token_expiry: string | null;
  google_calendar_id: string;
  sync_enabled: boolean;
};

/**
 * Loads the stored connection for a user and returns an OAuth client with valid
 * credentials. Transparently refreshes the access token and persists the new
 * one. Returns null if the user has no connection.
 */
export async function getGoogleClient(
  userId: string,
): Promise<{ client: OAuth2Client; connection: GoogleConnection } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!data) return null;
  const connection = data as GoogleConnection;

  const client = newOAuthClient();
  client.setCredentials({
    access_token: connection.access_token,
    refresh_token: connection.refresh_token,
    expiry_date: connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined,
  });

  // Refresh if expired or expiring within 60s.
  const expiresAt = connection.token_expiry ? new Date(connection.token_expiry).getTime() : 0;
  if (!expiresAt || expiresAt - Date.now() < 60_000) {
    try {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      await admin
        .from("google_calendar_connections")
        .update({
          access_token: credentials.access_token ?? connection.access_token,
          token_expiry: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      connection.access_token = credentials.access_token ?? connection.access_token;
    } catch {
      // Refresh token revoked/invalid → caller should treat as disconnected.
      return null;
    }
  }

  return { client, connection };
}

const CAL_API = "https://www.googleapis.com/calendar/v3";

async function authedFetch(client: OAuth2Client, url: string, init?: RequestInit) {
  const { token } = await client.getAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export type GoogleEvent = {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;        // ISO date or datetime
  allDay: boolean;
  htmlLink: string | null;
};

/** Lists events in [from, to] (ISO dates). */
export async function listEvents(
  client: OAuth2Client,
  calendarId: string,
  fromIso: string,
  toIso: string,
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date(fromIso + "T00:00:00").toISOString(),
    timeMax: new Date(toIso + "T23:59:59").toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await authedFetch(
    client,
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.items ?? [])
    .filter((e: { status?: string }) => e.status !== "cancelled")
    .map((e: Record<string, unknown>) => {
      const start = e.start as { date?: string; dateTime?: string } | undefined;
      const allDay = Boolean(start?.date);
      return {
        id: e.id as string,
        summary: (e.summary as string) ?? "(ohne Titel)",
        description: (e.description as string) ?? null,
        location: (e.location as string) ?? null,
        start: (start?.dateTime ?? start?.date ?? "") as string,
        allDay,
        htmlLink: (e.htmlLink as string) ?? null,
      } as GoogleEvent;
    });
}

type DeadlineEventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  date: string;          // YYYY-MM-DD
  time?: string | null;  // HH:MM or null for all-day
  type: "frist" | "termin";
};

function toGoogleEventBody(d: DeadlineEventInput) {
  const summary = `${d.type === "frist" ? "[Frist] " : "[Termin] "}${d.title}`;
  if (!d.time) {
    const end = new Date(d.date + "T12:00:00Z");
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      summary,
      description: d.description ?? undefined,
      location: d.location ?? undefined,
      start: { date: d.date },
      end: { date: end.toISOString().slice(0, 10) },
    };
  }
  const [h, m] = d.time.split(":").map(Number);
  const endH = String(h + 1).padStart(2, "0");
  return {
    summary,
    description: d.description ?? undefined,
    location: d.location ?? undefined,
    start: { dateTime: `${d.date}T${d.time}:00`, timeZone: "Europe/Berlin" },
    end: { dateTime: `${d.date}T${endH}:${String(m).padStart(2, "0")}:00`, timeZone: "Europe/Berlin" },
  };
}

export async function createEvent(
  client: OAuth2Client,
  calendarId: string,
  d: DeadlineEventInput,
): Promise<string | null> {
  const res = await authedFetch(
    client,
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(toGoogleEventBody(d)) },
  );
  if (!res.ok) return null;
  const json = await res.json();
  return (json.id as string) ?? null;
}

export async function updateEvent(
  client: OAuth2Client,
  calendarId: string,
  eventId: string,
  d: DeadlineEventInput,
): Promise<void> {
  await authedFetch(
    client,
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify(toGoogleEventBody(d)) },
  );
}

export async function deleteEvent(
  client: OAuth2Client,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await authedFetch(
    client,
    `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}
