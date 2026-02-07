import { describe, expect, it, beforeEach } from "vitest";
import {
  createMarker,
  isMarker,
  parseMarker,
  registerForScrubbing,
  scrubOutput,
  clearScrubRegistry,
  validateHeaders,
  isUrlAllowed,
  DEFAULT_URL_ALLOWLIST,
} from "./credential-broker.js";

describe("credential-broker", () => {
  describe("markers", () => {
    it("creates valid markers", () => {
      const marker = createMarker("api_key");
      expect(marker).toBe("<secret:api_key>");
    });

    it("identifies valid markers", () => {
      expect(isMarker("<secret:api_key>")).toBe(true);
      expect(isMarker("<secret:token_123>")).toBe(true);
      expect(isMarker("<secret:my-secret>")).toBe(true);
    });

    it("rejects invalid markers", () => {
      expect(isMarker("not a marker")).toBe(false);
      expect(isMarker("<secret:>")).toBe(false);
      expect(isMarker("<secret:has spaces>")).toBe(false);
      expect(isMarker("sk-abc123")).toBe(false);
    });

    it("parses marker names", () => {
      expect(parseMarker("<secret:api_key>")).toBe("api_key");
      expect(parseMarker("<secret:token_123>")).toBe("token_123");
      expect(parseMarker("not a marker")).toBe(null);
    });
  });

  describe("output scrubbing", () => {
    beforeEach(() => {
      clearScrubRegistry();
    });

    it("scrubs literal secret values", () => {
      registerForScrubbing("api_key", "sk-abc123secret");
      const output = "Response: sk-abc123secret was used";
      const scrubbed = scrubOutput(output);
      expect(scrubbed).toBe("Response: <secret:api_key> was used");
    });

    it("scrubs base64 encoded values", () => {
      registerForScrubbing("api_key", "secret123");
      const b64 = Buffer.from("secret123").toString("base64");
      const output = `Encoded: ${b64}`;
      const scrubbed = scrubOutput(output);
      expect(scrubbed).toContain("<secret:");
    });

    it("scrubs hex encoded values", () => {
      registerForScrubbing("api_key", "secret");
      const hex = Buffer.from("secret").toString("hex");
      const output = `Hex: ${hex}`;
      const scrubbed = scrubOutput(output);
      expect(scrubbed).toContain("<secret:");
    });

    it("is case insensitive", () => {
      registerForScrubbing("api_key", "SecretValue");
      const output = "Found: SECRETVALUE and secretvalue";
      const scrubbed = scrubOutput(output);
      expect(scrubbed).not.toContain("SECRETVALUE");
      expect(scrubbed).not.toContain("secretvalue");
    });

    it("handles multiple secrets", () => {
      registerForScrubbing("key1", "secret1");
      registerForScrubbing("key2", "secret2");
      const output = "Keys: secret1 and secret2";
      const scrubbed = scrubOutput(output);
      expect(scrubbed).not.toContain("secret1");
      expect(scrubbed).not.toContain("secret2");
    });
  });

  describe("header validation", () => {
    it("allows safe headers", () => {
      const result = validateHeaders({
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "seksbot/1.0",
      });
      expect(result.ok).toBe(true);
    });

    it("blocks authorization header", () => {
      const result = validateHeaders({
        Authorization: "Bearer token",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Authorization");
      }
    });

    it("blocks x-api-key header", () => {
      const result = validateHeaders({
        "X-API-Key": "key123",
      });
      expect(result.ok).toBe(false);
    });

    it("blocks cookie header", () => {
      const result = validateHeaders({
        Cookie: "session=abc",
      });
      expect(result.ok).toBe(false);
    });

    it("is case insensitive", () => {
      const result = validateHeaders({
        AUTHORIZATION: "Bearer token",
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("URL allowlist", () => {
    it("allows URLs in allowlist", () => {
      expect(isUrlAllowed("https://api.github.com/repos", DEFAULT_URL_ALLOWLIST)).toBe(true);
      expect(isUrlAllowed("https://api.openai.com/v1/chat", DEFAULT_URL_ALLOWLIST)).toBe(true);
    });

    it("allows wildcard patterns", () => {
      expect(isUrlAllowed("https://storage.googleapis.com/bucket", DEFAULT_URL_ALLOWLIST)).toBe(
        true,
      );
      expect(
        isUrlAllowed("https://generativelanguage.googleapis.com/v1", DEFAULT_URL_ALLOWLIST),
      ).toBe(true);
    });

    it("blocks URLs not in allowlist", () => {
      expect(isUrlAllowed("https://evil.com/steal", DEFAULT_URL_ALLOWLIST)).toBe(false);
      expect(isUrlAllowed("https://attacker.io/exfil", DEFAULT_URL_ALLOWLIST)).toBe(false);
    });

    it("allows all URLs when no allowlist", () => {
      expect(isUrlAllowed("https://anything.com", undefined)).toBe(true);
      expect(isUrlAllowed("https://anything.com", [])).toBe(true);
    });

    it("handles invalid URLs", () => {
      expect(isUrlAllowed("not a url", DEFAULT_URL_ALLOWLIST)).toBe(false);
    });

    it("allows localhost", () => {
      expect(isUrlAllowed("http://localhost:8123/api", DEFAULT_URL_ALLOWLIST)).toBe(true);
      expect(isUrlAllowed("http://127.0.0.1:8080/", DEFAULT_URL_ALLOWLIST)).toBe(true);
    });
  });
});
