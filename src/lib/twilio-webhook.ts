/**
 * Prüft, ob ein Webhook-Aufruf wirklich von Twilio stammt
 * (Header `X-Twilio-Signature`, HMAC-SHA1 über URL + POST-Parameter).
 *
 * Auth-Token: `TWILIO_AUTH_TOKEN`, sonst `TWILIO_ACCOUNT_SID_KEY`
 * (so heißt der Auth-Token in diesem Projekt bisher).
 *
 * Twilio signiert die öffentliche URL, unter der es den Webhook aufruft.
 * Hinter einem Proxy weicht `request.url` davon ab, deshalb wird zusätzlich
 * gegen `APP_URL` + Pfad geprüft.
 */
import type { NextRequest } from "next/server";
import twilio from "twilio";

export type TwilioParams = Record<string, string>;

export function verifyTwilioSignature(opts: {
  authToken: string | undefined;
  signature: string | null;
  urls: string[];
  params: TwilioParams;
}): boolean {
  const { authToken, signature, urls, params } = opts;
  if (!authToken || !signature) return false;
  return urls.some((url) => twilio.validateRequest(authToken, signature, url, params));
}

function candidateUrls(request: NextRequest): string[] {
  const urls = [request.url];
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (appUrl) urls.push(appUrl + request.nextUrl.pathname + request.nextUrl.search);
  return [...new Set(urls)];
}

/**
 * Liest die Formular-Parameter und prüft die Signatur.
 * Liefert die Parameter bei Erfolg, sonst `null`.
 */
export async function readVerifiedTwilioForm(request: NextRequest): Promise<TwilioParams | null> {
  const form = await request.formData();
  const params: TwilioParams = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_ACCOUNT_SID_KEY;
  if (!authToken) {
    console.error("[twilio] Kein Auth-Token gesetzt (TWILIO_AUTH_TOKEN) – Webhook abgelehnt.");
    return null;
  }

  const ok = verifyTwilioSignature({
    authToken,
    signature: request.headers.get("x-twilio-signature"),
    urls: candidateUrls(request),
    params,
  });
  if (!ok) {
    console.warn(`[twilio] Ungültige Signatur für ${request.nextUrl.pathname} – Anfrage abgelehnt.`);
    return null;
  }
  return params;
}
