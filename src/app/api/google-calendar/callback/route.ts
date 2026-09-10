import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withAuth } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { newOAuthClient, appBaseUrl } from "@/lib/google/calendar";

// GET /api/google-calendar/callback?code=…&state=…
export async function GET(request: NextRequest) {
  const base = appBaseUrl();
  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/deadlines?google=error&reason=${encodeURIComponent(reason)}`);

  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return fail("nicht angemeldet");

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  if (error) return fail(error);
  if (!code) return fail("kein Code");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("g_oauth_state")?.value;
  cookieStore.delete("g_oauth_state");
  if (!expectedState || expectedState !== state) return fail("ungültiger State");

  const client = newOAuthClient();
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch {
    return fail("Token-Austausch fehlgeschlagen");
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    return fail("kein Refresh-Token erhalten – bitte Zugriff in Google erneut bestätigen");
  }

  // Look up the connected Google account email.
  let googleEmail: string | null = null;
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (res.ok) googleEmail = (await res.json()).email ?? null;
  } catch {
    /* non-fatal */
  }

  const admin = createAdminClient();
  const { error: upsertError } = await admin
    .from("google_calendar_connections")
    .upsert(
      {
        user_id: user.id,
        tenant_id: tenantId,
        google_email: googleEmail,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        sync_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (upsertError) return fail("Speichern fehlgeschlagen");

  return NextResponse.redirect(`${base}/deadlines?google=connected`);
}
