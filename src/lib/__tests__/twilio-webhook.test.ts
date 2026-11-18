import { describe, expect, it } from "vitest";
import twilio from "twilio";
import { verifyTwilioSignature } from "../twilio-webhook";

const TOKEN = "test-auth-token";
const URL = "https://crm.example.com/api/twilio/voice";
const PARAMS = { To: "+4930123456", From: "+4917000000", CallSid: "CA123" };

function sign(url: string, params: Record<string, string>, token = TOKEN) {
  return twilio.getExpectedTwilioSignature(token, url, params);
}

describe("verifyTwilioSignature", () => {
  it("akzeptiert eine gültige Signatur", () => {
    expect(
      verifyTwilioSignature({ authToken: TOKEN, signature: sign(URL, PARAMS), urls: [URL], params: PARAMS }),
    ).toBe(true);
  });

  it("akzeptiert, wenn eine der Kandidaten-URLs passt", () => {
    expect(
      verifyTwilioSignature({
        authToken: TOKEN,
        signature: sign(URL, PARAMS),
        urls: ["http://localhost:3000/api/twilio/voice", URL],
        params: PARAMS,
      }),
    ).toBe(true);
  });

  it("lehnt manipulierte Parameter ab", () => {
    expect(
      verifyTwilioSignature({
        authToken: TOKEN,
        signature: sign(URL, PARAMS),
        urls: [URL],
        params: { ...PARAMS, To: "+4990012345" },
      }),
    ).toBe(false);
  });

  it("lehnt eine Signatur mit falschem Token ab", () => {
    expect(
      verifyTwilioSignature({ authToken: TOKEN, signature: sign(URL, PARAMS, "anderer-token"), urls: [URL], params: PARAMS }),
    ).toBe(false);
  });

  it("lehnt fehlende Signatur oder fehlenden Token ab", () => {
    expect(verifyTwilioSignature({ authToken: TOKEN, signature: null, urls: [URL], params: PARAMS })).toBe(false);
    expect(
      verifyTwilioSignature({ authToken: undefined, signature: sign(URL, PARAMS), urls: [URL], params: PARAMS }),
    ).toBe(false);
  });
});
