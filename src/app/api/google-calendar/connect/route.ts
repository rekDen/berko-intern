import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { newOAuthClient, googleConfigured, GOOGLE_SCOPES } from "@/lib/google/calendar";

// GET /api/google-calendar/connect → redirect to Google consent
export async function GET() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  if (!googleConfigured()) {
    return NextResponse.json(
      { error: "Google ist nicht konfiguriert (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET fehlen)." },
      { status: 503 },
    );
  }

  const state = crypto.randomUUID();
  (await cookies()).set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const url = newOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
    include_granted_scopes: true,
  });

  return NextResponse.redirect(url);
}
