import { describe, expect, it } from "vitest";
import { apiKeyMatches } from "../api-key";

describe("apiKeyMatches", () => {
  it("akzeptiert den richtigen Key", () => {
    expect(apiKeyMatches("abc-123", "abc-123")).toBe(true);
  });

  it("lehnt falsche Keys ab, auch bei unterschiedlicher Länge", () => {
    expect(apiKeyMatches("abc-124", "abc-123")).toBe(false);
    expect(apiKeyMatches("abc", "abc-123")).toBe(false);
  });

  it("lehnt ab, wenn kein Key übermittelt wurde", () => {
    expect(apiKeyMatches(null, "abc-123")).toBe(false);
    expect(apiKeyMatches("", "abc-123")).toBe(false);
  });

  it("lehnt ab, wenn kein erwarteter Key konfiguriert ist", () => {
    expect(apiKeyMatches("abc-123", undefined)).toBe(false);
    expect(apiKeyMatches("", "")).toBe(false);
  });
});
