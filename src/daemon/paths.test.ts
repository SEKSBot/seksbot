import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".seksbot"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", SEKSBOT_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".seksbot-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", SEKSBOT_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".seksbot"));
  });

  it("uses SEKSBOT_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", SEKSBOT_STATE_DIR: "/var/lib/seksbot" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/seksbot"));
  });

  it("expands ~ in SEKSBOT_STATE_DIR", () => {
    const env = { HOME: "/Users/test", SEKSBOT_STATE_DIR: "~/seksbot-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/seksbot-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { SEKSBOT_STATE_DIR: "C:\\State\\seksbot" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\seksbot");
  });
});
