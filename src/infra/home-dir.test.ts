import path from "node:path";
import { describe, expect, it } from "vitest";
import { expandHomePrefix, resolveEffectiveHomeDir, resolveRequiredHomeDir } from "./home-dir.js";

describe("resolveEffectiveHomeDir", () => {
  it("prefers SEKSBOT_HOME over HOME and USERPROFILE", () => {
    const env = {
      SEKSBOT_HOME: "/srv/seksbot-home",
      HOME: "/home/other",
      USERPROFILE: "C:/Users/other",
    } as NodeJS.ProcessEnv;

    expect(resolveEffectiveHomeDir(env, () => "/fallback")).toBe(path.resolve("/srv/seksbot-home"));
  });

  it("falls back to HOME then USERPROFILE then homedir", () => {
    expect(resolveEffectiveHomeDir({ HOME: "/home/alice" } as NodeJS.ProcessEnv)).toBe(
      path.resolve("/home/alice"),
    );
    expect(resolveEffectiveHomeDir({ USERPROFILE: "C:/Users/alice" } as NodeJS.ProcessEnv)).toBe(
      path.resolve("C:/Users/alice"),
    );
    expect(resolveEffectiveHomeDir({} as NodeJS.ProcessEnv, () => "/fallback")).toBe(
      path.resolve("/fallback"),
    );
  });

  it("expands SEKSBOT_HOME when set to ~", () => {
    const env = {
      SEKSBOT_HOME: "~/svc",
      HOME: "/home/alice",
    } as NodeJS.ProcessEnv;

    expect(resolveEffectiveHomeDir(env)).toBe(path.resolve("/home/alice/svc"));
  });
});

describe("resolveRequiredHomeDir", () => {
  it("returns cwd when no home source is available", () => {
    expect(
      resolveRequiredHomeDir({} as NodeJS.ProcessEnv, () => {
        throw new Error("no home");
      }),
    ).toBe(process.cwd());
  });

  it("returns a fully resolved path for SEKSBOT_HOME", () => {
    const result = resolveRequiredHomeDir(
      { SEKSBOT_HOME: "/custom/home" } as NodeJS.ProcessEnv,
      () => "/fallback",
    );
    expect(result).toBe(path.resolve("/custom/home"));
  });

  it("returns cwd when SEKSBOT_HOME is tilde-only and no fallback home exists", () => {
    expect(
      resolveRequiredHomeDir({ SEKSBOT_HOME: "~" } as NodeJS.ProcessEnv, () => {
        throw new Error("no home");
      }),
    ).toBe(process.cwd());
  });
});

describe("expandHomePrefix", () => {
  it("expands tilde using effective home", () => {
    const value = expandHomePrefix("~/x", {
      env: { SEKSBOT_HOME: "/srv/seksbot-home" } as NodeJS.ProcessEnv,
    });
    expect(value).toBe(`${path.resolve("/srv/seksbot-home")}/x`);
  });

  it("keeps non-tilde values unchanged", () => {
    expect(expandHomePrefix("/tmp/x")).toBe("/tmp/x");
  });
});
