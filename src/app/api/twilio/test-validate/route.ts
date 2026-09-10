import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import twilio from "twilio";

export async function POST(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const { accountSid, accountSidKey, apiKeySid, apiKeySecret, twimlAppSid } = await request.json();

  const missing = [
    !accountSid    && "accountSid",
    !accountSidKey && "accountSidKey",
    !apiKeySid     && "apiKeySid",
    !apiKeySecret  && "apiKeySecret",
    !twimlAppSid   && "twimlAppSid",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return NextResponse.json({ ok: false, error: `Fehlende Felder: ${missing.join(", ")}` });
  }

  const client = twilio(accountSid, accountSidKey, { accountSid });

  // Account prüfen
  let accountFriendlyName: string | null = null;
  try {
    const account = await client.api.v2010.accounts(accountSid).fetch();
    accountFriendlyName = account.friendlyName ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Account-Fehler";
    return NextResponse.json({ ok: false, account: { ok: false, error: msg }, twimlApp: null });
  }

  // TwiML App prüfen
  let appFriendlyName: string | null = null;
  let appVoiceUrl: string | null = null;
  let appError: string | null = null;
  let appOk = false;
  try {
    const app = await client.applications(twimlAppSid).fetch();
    appOk = true;
    appFriendlyName = app.friendlyName ?? null;
    appVoiceUrl = app.voiceUrl ?? null;
  } catch (e) {
    appError = e instanceof Error ? e.message : "App-Fehler";
  }

  return NextResponse.json({
    ok: true,
    account: { ok: true, friendlyName: accountFriendlyName },
    twimlApp: appOk
      ? { ok: true, friendlyName: appFriendlyName, voiceUrl: appVoiceUrl }
      : { ok: false, error: appError },
  });
}
