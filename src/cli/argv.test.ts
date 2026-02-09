import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "seksbot", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "seksbot", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "seksbot", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "seksbot", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "seksbot", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "seksbot", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "seksbot", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "seksbot"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "seksbot", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "seksbot", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "seksbot", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "seksbot", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "seksbot", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "seksbot", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "seksbot", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "seksbot", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "seksbot", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "seksbot", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "seksbot", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "seksbot", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "seksbot", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "seksbot", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["node", "seksbot", "status"],
    });
    expect(nodeArgv).toEqual(["node", "seksbot", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["node-22", "seksbot", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "seksbot", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["node-22.2.0.exe", "seksbot", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "seksbot", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["node-22.2", "seksbot", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "seksbot", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["node-22.2.exe", "seksbot", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "seksbot", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["/usr/bin/node-22.2.0", "seksbot", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "seksbot", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["nodejs", "seksbot", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "seksbot", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["node-dev", "seksbot", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "seksbot", "node-dev", "seksbot", "status"]);

    const directArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["seksbot", "status"],
    });
    expect(directArgv).toEqual(["node", "seksbot", "status"]);

    const bunArgv = buildParseArgv({
      programName: "seksbot",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "seksbot",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "seksbot", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "seksbot", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "seksbot", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "seksbot", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "seksbot", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "seksbot", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "seksbot", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "seksbot", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
