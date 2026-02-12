import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SeksBrokerConfig } from "./broker-client.js";
import {
  BrokerClient,
  clearBrokerTokenCache,
  isBrokerConfigured,
  requestScopedToken,
  resolveProxyTarget,
} from "./broker-client.js";

// ─── Mock fetch globally ────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  clearBrokerTokenCache();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── isBrokerConfigured ─────────────────────────────────────────────────────

describe("isBrokerConfigured", () => {
  it("returns true with url + token", () => {
    expect(isBrokerConfigured({ url: "https://broker.test", token: "tok" })).toBe(true);
  });

  it("returns true with url + tokenCommand", () => {
    expect(isBrokerConfigured({ url: "https://broker.test", tokenCommand: "echo tok" })).toBe(true);
  });

  it("returns false with missing url", () => {
    expect(isBrokerConfigured({ url: "", token: "tok" })).toBe(false);
  });

  it("returns false with missing both auth methods", () => {
    expect(isBrokerConfigured({ url: "https://broker.test" } as SeksBrokerConfig)).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isBrokerConfigured(null)).toBe(false);
    expect(isBrokerConfigured(undefined)).toBe(false);
  });
});

// ─── resolveProxyTarget ─────────────────────────────────────────────────────

describe("resolveProxyTarget", () => {
  it("constructs correct URL and passes token", async () => {
    const config: SeksBrokerConfig = { url: "https://broker.test", token: "my-token" };
    const target = await resolveProxyTarget(config, "anthropic");

    expect(target.baseUrl).toBe("https://broker.test/v1/proxy/anthropic");
    expect(target.apiKey).toBe("my-token");
  });

  it("strips trailing slashes from broker URL", async () => {
    const config: SeksBrokerConfig = { url: "https://broker.test///", token: "tok" };
    const target = await resolveProxyTarget(config, "openai");

    expect(target.baseUrl).toBe("https://broker.test/v1/proxy/openai");
  });

  it("throws when neither token nor tokenCommand is set", async () => {
    const config = { url: "https://broker.test" } as SeksBrokerConfig;
    await expect(resolveProxyTarget(config, "test")).rejects.toThrow("No broker token configured");
  });
});

// ─── Token caching (standalone) ─────────────────────────────────────────────

describe("token caching", () => {
  it("caches resolved token across calls", async () => {
    const config: SeksBrokerConfig = { url: "https://broker.test", token: "cached-token" };
    const t1 = await resolveProxyTarget(config, "a");
    const t2 = await resolveProxyTarget(config, "b");

    expect(t1.apiKey).toBe("cached-token");
    expect(t2.apiKey).toBe("cached-token");
  });

  it("clearBrokerTokenCache forces re-resolution", async () => {
    const config: SeksBrokerConfig = { url: "https://broker.test", token: "token-v1" };
    const t1 = await resolveProxyTarget(config, "a");
    expect(t1.apiKey).toBe("token-v1");

    clearBrokerTokenCache();

    const config2: SeksBrokerConfig = { url: "https://broker.test", token: "token-v2" };
    const t2 = await resolveProxyTarget(config2, "a");
    expect(t2.apiKey).toBe("token-v2");
  });
});

// ─── requestScopedToken ─────────────────────────────────────────────────────

describe("requestScopedToken", () => {
  const config: SeksBrokerConfig = { url: "https://broker.test", token: "parent-token" };

  it("returns scoped token on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "scoped-abc", expiresAt: "2026-01-01T00:00:00Z" }),
    });

    const result = await requestScopedToken(config, {
      skillName: "my-skill",
      capabilities: ["anthropic/messages.create"],
      ttlSeconds: 120,
    });

    expect(result).toEqual({ token: "scoped-abc", expiresAt: "2026-01-01T00:00:00Z" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://broker.test/v1/tokens/scoped",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("returns null on non-200 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    const result = await requestScopedToken(config, {
      skillName: "my-skill",
      capabilities: ["anthropic/messages.create"],
      ttlSeconds: 60,
    });

    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await requestScopedToken(config, {
      skillName: "my-skill",
      capabilities: [],
      ttlSeconds: 60,
    });

    expect(result).toBeNull();
  });
});

// ─── BrokerClient ───────────────────────────────────────────────────────────

describe("BrokerClient", () => {
  describe("getChannelTokens", () => {
    it("returns channel tokens on success", async () => {
      const tokens = { discord: "disc-tok", telegram: "tg-tok" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => tokens,
      });

      const client = new BrokerClient("https://broker.test", "tok");
      const result = await client.getChannelTokens();
      expect(result).toEqual(tokens);
    });

    it("throws on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal Server Error" }),
      });

      const client = new BrokerClient("https://broker.test", "tok");
      await expect(client.getChannelTokens()).rejects.toThrow("Broker request failed");
    });
  });

  describe("verifyToken", () => {
    it("returns response when broker responds ok", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, agentId: "agent-1" }),
      });

      const client = new BrokerClient("https://broker.test", "tok");
      const result = await client.verifyToken();
      expect(result.valid).toBe(true);
      expect(result.agentId).toBe("agent-1");
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      const client = new BrokerClient("https://broker.test", "tok");
      await expect(client.verifyToken()).rejects.toThrow("Broker request failed");
    });
  });

  describe("resolveToken", () => {
    it("returns static token", async () => {
      const client = new BrokerClient("https://broker.test", "my-token");
      expect(await client.resolveToken()).toBe("my-token");
    });

    it("caches token after first resolution", async () => {
      const client = new BrokerClient("https://broker.test", "tok");
      const t1 = await client.resolveToken();
      const t2 = await client.resolveToken();
      expect(t1).toBe(t2);
    });

    it("clears cache on clearTokenCache", async () => {
      const client = new BrokerClient("https://broker.test", "tok");
      await client.resolveToken();
      client.clearTokenCache();
      // Should still resolve (token is static)
      expect(await client.resolveToken()).toBe("tok");
    });
  });
});
