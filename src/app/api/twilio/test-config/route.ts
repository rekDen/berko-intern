import { NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

export async function GET() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  return NextResponse.json({
    accountSid:    process.env.TWILIO_ACCOUNT_SID     ?? "",
    accountSidKey: process.env.TWILIO_ACCOUNT_SID_KEY ?? "",
    apiKeySid:     process.env.TWILIO_API_KEY_SID     ?? "",
    apiKeySecret:  process.env.TWILIO_API_KEY_SECRET  ?? "",
    twimlAppSid:   process.env.TWILIO_TWIML_APP_SID   ?? "",
    phoneNumber:   process.env.TWILIO_PHONE_NUMBER     ?? "",
  }, { headers: { "Cache-Control": "no-store" } });
}
