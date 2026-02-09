import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveStorePath } from "./paths.js";

describe("resolveStorePath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses SEKSBOT_HOME for tilde expansion", () => {
    vi.stubEnv("SEKSBOT_HOME", "/srv/seksbot-home");
    vi.stubEnv("HOME", "/home/other");

    const resolved = resolveStorePath("~/.seksbot/agents/{agentId}/sessions/sessions.json", {
      agentId: "research",
    });

    expect(resolved).toBe(
      path.resolve("/srv/seksbot-home/.seksbot/agents/research/sessions/sessions.json"),
    );
  });
});
