import { NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import twilio from "twilio";

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

export async function GET() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return NextResponse.json({ error: "Twilio nicht konfiguriert" }, { status: 503 });
  }

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
}
