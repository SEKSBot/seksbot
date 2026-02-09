import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "seksbot",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "seksbot", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "seksbot", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "seksbot", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "seksbot", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "seksbot", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "seksbot", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "seksbot", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "seksbot", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".seksbot-dev");
    expect(env.SEKSBOT_PROFILE).toBe("dev");
    expect(env.SEKSBOT_STATE_DIR).toBe(expectedStateDir);
    expect(env.SEKSBOT_CONFIG_PATH).toBe(path.join(expectedStateDir, "seksbot.json"));
    expect(env.SEKSBOT_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      SEKSBOT_STATE_DIR: "/custom",
      SEKSBOT_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.SEKSBOT_STATE_DIR).toBe("/custom");
    expect(env.SEKSBOT_GATEWAY_PORT).toBe("19099");
    expect(env.SEKSBOT_CONFIG_PATH).toBe(path.join("/custom", "seksbot.json"));
  });

  it("uses SEKSBOT_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      SEKSBOT_HOME: "/srv/seksbot-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/seksbot-home");
    expect(env.SEKSBOT_STATE_DIR).toBe(path.join(resolvedHome, ".seksbot-work"));
    expect(env.SEKSBOT_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".seksbot-work", "seksbot.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("seksbot doctor --fix", {})).toBe("seksbot doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("seksbot doctor --fix", { SEKSBOT_PROFILE: "default" })).toBe(
      "seksbot doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("seksbot doctor --fix", { SEKSBOT_PROFILE: "Default" })).toBe(
      "seksbot doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("seksbot doctor --fix", { SEKSBOT_PROFILE: "bad profile" })).toBe(
      "seksbot doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("seksbot --profile work doctor --fix", { SEKSBOT_PROFILE: "work" }),
    ).toBe("seksbot --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("seksbot --dev doctor", { SEKSBOT_PROFILE: "dev" })).toBe(
      "seksbot --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("seksbot doctor --fix", { SEKSBOT_PROFILE: "work" })).toBe(
      "seksbot --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("seksbot doctor --fix", { SEKSBOT_PROFILE: "  jbseksbot  " })).toBe(
      "seksbot --profile jbseksbot doctor --fix",
    );
  });

  it("handles command with no args after seksbot", () => {
    expect(formatCliCommand("seksbot", { SEKSBOT_PROFILE: "test" })).toBe(
      "seksbot --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm seksbot doctor", { SEKSBOT_PROFILE: "work" })).toBe(
      "pnpm seksbot --profile work doctor",
    );
  });
});
