import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const { VoiceResponse } = twilio.twiml;

const TWILIO_NUMBER = process.env.TWILIO_AURABAD_PHONE_NUMBER!;
//const FORWARD_TO = ["+491747077151", "+491754205385"]; // add second number here
const FORWARD_TO = ["+4916092313357"];

export async function POST(request: NextRequest) {
  const body = await request.formData();
  const to = body.get("To") as string | null;

  const response = new VoiceResponse();

  // Incoming PSTN call: Twilio sets To = our Twilio number
  if (!to || to === TWILIO_NUMBER) {
    const dial = response.dial({ callerId: TWILIO_NUMBER, answerOnBridge: true });
    for (const number of FORWARD_TO) dial.number(number);
    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Outbound call initiated by a browser client
  const dial = response.dial({ callerId: TWILIO_NUMBER, answerOnBridge: true });
  if (to.startsWith("+") || /^\d+$/.test(to)) {
    dial.number(to);
  } else {
    dial.client(to);
  }

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
