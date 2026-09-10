import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import twilio from "twilio";

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

// POST /api/twilio/test-token — erzeugt Token mit explizit übergebenen Credentials (nur für /twilio-test)
export async function POST(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const body = await request.json();
  const { accountSid, apiKeySid, apiKeySecret, twimlAppSid } = body;

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return NextResponse.json({ error: "Fehlende Felder: accountSid, apiKeySid, apiKeySecret, twimlAppSid" }, { status: 400 });
  }

  try {
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: false,
    });

    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity: user.id,
      ttl: 3600,
    });
    token.addGrant(voiceGrant);

    return NextResponse.json({ token: token.toJwt() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Token-Fehler" }, { status: 500 });
  }
}
