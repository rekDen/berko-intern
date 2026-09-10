import { NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

// GET /api/twilio/validate — prüft die Twilio-Credentials gegen die REST API
export async function GET() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const accountSid   = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid    = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const twimlAppSid  = process.env.TWILIO_TWIML_APP_SID;
  const phoneNumber  = process.env.TWILIO_PHONE_NUMBER;

  const missing = [
    !accountSid   && "TWILIO_ACCOUNT_SID",
    !apiKeySid    && "TWILIO_API_KEY_SID",
    !apiKeySecret && "TWILIO_API_KEY_SECRET",
    !twimlAppSid  && "TWILIO_TWIML_APP_SID",
    !phoneNumber  && "TWILIO_PHONE_NUMBER",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `Fehlende Env-Vars: ${missing.join(", ")}`,
      details: { missing },
    });
  }

  // Teste API Key + Secret gegen Twilio REST API
  const basicAuth = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString("base64");

  let accountOk = false;
  let accountError: string | null = null;
  let accountFriendlyName: string | null = null;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      { headers: { 'Authorization': 'Basic ' + basicAuth } }
    );
    if (res.ok) {
      const data = await res.json();
      accountOk = true;
      accountFriendlyName = data.friendly_name ?? null;
    } else {
      const data = await res.json().catch(() => ({}));
      accountError = `HTTP ${res.status}: ${data?.message ?? res.statusText}`;
    }
  } catch (e) {
    accountError = e instanceof Error ? e.message : "Netzwerkfehler";
  }

  // Teste ob TwiML App existiert
  let appOk = false;
  let appError: string | null = null;
  let appFriendlyName: string | null = null;
  let appVoiceUrl: string | null = null;

  if (accountOk) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${twimlAppSid}.json`,
        { headers: { 'Authorization': 'Basic ' + basicAuth } }
      );
      if (res.ok) {
        const data = await res.json();
        appOk = true;
        appFriendlyName = data.friendly_name ?? null;
        appVoiceUrl = data.voice_url ?? null;
      } else {
        const data = await res.json().catch(() => ({}));
        appError = `HTTP ${res.status}: ${data?.message ?? res.statusText}`;
      }
    } catch (e) {
      appError = e instanceof Error ? e.message : "Netzwerkfehler";
    }
  }

  return NextResponse.json({
    ok: accountOk,
    credentials: {
      accountSid: maskSid(accountSid!),
      apiKeySid:  maskSid(apiKeySid!),
      twimlAppSid: maskSid(twimlAppSid!),
      phoneNumber: phoneNumber!,
    },
    account: accountOk
      ? { ok: true, friendlyName: accountFriendlyName }
      : { ok: false, error: accountError },
    twimlApp: accountOk
      ? appOk
        ? { ok: true, friendlyName: appFriendlyName, voiceUrl: appVoiceUrl }
        : { ok: false, error: appError }
      : null,
  });
}

function maskSid(sid: string): string {
  if (sid.length <= 8) return sid;
  return `${sid.slice(0, 6)}…${sid.slice(-4)}`;
}
