import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSchtasksQuery, readScheduledTaskCommand, resolveTaskScriptPath } from "./schtasks.js";

describe("schtasks runtime parsing", () => {
  it("parses status and last run info", () => {
    const output = [
      "TaskName: \\seksbot Gateway",
      "Status: Ready",
      "Last Run Time: 1/8/2026 1:23:45 AM",
      "Last Run Result: 0x0",
    ].join("\r\n");
    expect(parseSchtasksQuery(output)).toEqual({
      status: "Ready",
      lastRunTime: "1/8/2026 1:23:45 AM",
      lastRunResult: "0x0",
    });
  });

  it("parses running status", () => {
    const output = [
      "TaskName: \\seksbot Gateway",
      "Status: Running",
      "Last Run Time: 1/8/2026 1:23:45 AM",
      "Last Run Result: 0x0",
    ].join("\r\n");
    expect(parseSchtasksQuery(output)).toEqual({
      status: "Running",
      lastRunTime: "1/8/2026 1:23:45 AM",
      lastRunResult: "0x0",
    });
  });
});

describe("resolveTaskScriptPath", () => {
  it("uses default path when SEKSBOT_PROFILE is default", () => {
    const env = { USERPROFILE: "C:\\Users\\test", SEKSBOT_PROFILE: "default" };
    expect(resolveTaskScriptPath(env)).toBe(
      path.join("C:\\Users\\test", ".seksbot", "gateway.cmd"),
    );
  });

  it("uses default path when SEKSBOT_PROFILE is unset", () => {
    const env = { USERPROFILE: "C:\\Users\\test" };
    expect(resolveTaskScriptPath(env)).toBe(
      path.join("C:\\Users\\test", ".seksbot", "gateway.cmd"),
    );
  });

  it("uses profile-specific path when SEKSBOT_PROFILE is set to a custom value", () => {
    const env = { USERPROFILE: "C:\\Users\\test", SEKSBOT_PROFILE: "jbphoenix" };
    expect(resolveTaskScriptPath(env)).toBe(
      path.join("C:\\Users\\test", ".seksbot-jbphoenix", "gateway.cmd"),
    );
  });

  it("prefers SEKSBOT_STATE_DIR over profile-derived defaults", () => {
    const env = {
      USERPROFILE: "C:\\Users\\test",
      SEKSBOT_PROFILE: "rescue",
      SEKSBOT_STATE_DIR: "C:\\State\\seksbot",
    };
    expect(resolveTaskScriptPath(env)).toBe(path.join("C:\\State\\seksbot", "gateway.cmd"));
  });

  it("handles case-insensitive 'Default' profile", () => {
    const env = { USERPROFILE: "C:\\Users\\test", SEKSBOT_PROFILE: "Default" };
    expect(resolveTaskScriptPath(env)).toBe(
      path.join("C:\\Users\\test", ".seksbot", "gateway.cmd"),
    );
  });

  it("handles case-insensitive 'DEFAULT' profile", () => {
    const env = { USERPROFILE: "C:\\Users\\test", SEKSBOT_PROFILE: "DEFAULT" };
    expect(resolveTaskScriptPath(env)).toBe(
      path.join("C:\\Users\\test", ".seksbot", "gateway.cmd"),
    );
  });

  it("trims whitespace from SEKSBOT_PROFILE", () => {
    const env = { USERPROFILE: "C:\\Users\\test", SEKSBOT_PROFILE: "  myprofile  " };
    expect(resolveTaskScriptPath(env)).toBe(
      path.join("C:\\Users\\test", ".seksbot-myprofile", "gateway.cmd"),
    );
  });

  it("falls back to HOME when USERPROFILE is not set", () => {
    const env = { HOME: "/home/test", SEKSBOT_PROFILE: "default" };
    expect(resolveTaskScriptPath(env)).toBe(path.join("/home/test", ".seksbot", "gateway.cmd"));
  });
});

describe("readScheduledTaskCommand", () => {
  it("parses basic command script", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "seksbot-schtasks-test-"));
    try {
      const scriptPath = path.join(tmpDir, ".seksbot", "gateway.cmd");
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      await fs.writeFile(
        scriptPath,
        ["@echo off", "node gateway.js --port 18789"].join("\r\n"),
        "utf8",
      );

      const env = { USERPROFILE: tmpDir, SEKSBOT_PROFILE: "default" };
      const result = await readScheduledTaskCommand(env);
      expect(result).toEqual({
        programArguments: ["node", "gateway.js", "--port", "18789"],
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses script with working directory", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "seksbot-schtasks-test-"));
    try {
      const scriptPath = path.join(tmpDir, ".seksbot", "gateway.cmd");
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      await fs.writeFile(
        scriptPath,
        ["@echo off", "cd /d C:\\Projects\\seksbot", "node gateway.js"].join("\r\n"),
        "utf8",
      );

      const env = { USERPROFILE: tmpDir, SEKSBOT_PROFILE: "default" };
      const result = await readScheduledTaskCommand(env);
      expect(result).toEqual({
        programArguments: ["node", "gateway.js"],
        workingDirectory: "C:\\Projects\\seksbot",
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses script with environment variables", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "seksbot-schtasks-test-"));
    try {
      const scriptPath = path.join(tmpDir, ".seksbot", "gateway.cmd");
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      await fs.writeFile(
        scriptPath,
        ["@echo off", "set NODE_ENV=production", "set PORT=18789", "node gateway.js"].join("\r\n"),
        "utf8",
      );

      const env = { USERPROFILE: tmpDir, SEKSBOT_PROFILE: "default" };
      const result = await readScheduledTaskCommand(env);
      expect(result).toEqual({
        programArguments: ["node", "gateway.js"],
        environment: {
          NODE_ENV: "production",
          PORT: "18789",
        },
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses script with quoted arguments containing spaces", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "seksbot-schtasks-test-"));
    try {
      const scriptPath = path.join(tmpDir, ".seksbot", "gateway.cmd");
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      // Use forward slashes which work in Windows cmd and avoid escape parsing issues
      await fs.writeFile(
        scriptPath,
        ["@echo off", '"C:/Program Files/Node/node.exe" gateway.js'].join("\r\n"),
        "utf8",
      );

      const env = { USERPROFILE: tmpDir, SEKSBOT_PROFILE: "default" };
      const result = await readScheduledTaskCommand(env);
      expect(result).toEqual({
        programArguments: ["C:/Program Files/Node/node.exe", "gateway.js"],
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns null when script does not exist", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "seksbot-schtasks-test-"));
    try {
      const env = { USERPROFILE: tmpDir, SEKSBOT_PROFILE: "default" };
      const result = await readScheduledTaskCommand(env);
      expect(result).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns null when script has no command", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "seksbot-schtasks-test-"));
    try {
      const scriptPath = path.join(tmpDir, ".seksbot", "gateway.cmd");
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      await fs.writeFile(
        scriptPath,
        ["@echo off", "rem This is just a comment"].join("\r\n"),
        "utf8",
      );

      const env = { USERPROFILE: tmpDir, SEKSBOT_PROFILE: "default" };
      const result = await readScheduledTaskCommand(env);
      expect(result).toBeNull();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("parses full script with all components", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "seksbot-schtasks-test-"));
    try {
      const scriptPath = path.join(tmpDir, ".seksbot", "gateway.cmd");
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      await fs.writeFile(
        scriptPath,
        [
          "@echo off",
          "rem seksbot Gateway",
          "cd /d C:\\Projects\\seksbot",
          "set NODE_ENV=production",
          "set SEKSBOT_PORT=18789",
          "node gateway.js --verbose",
        ].join("\r\n"),
        "utf8",
      );

      const env = { USERPROFILE: tmpDir, SEKSBOT_PROFILE: "default" };
      const result = await readScheduledTaskCommand(env);
      expect(result).toEqual({
        programArguments: ["node", "gateway.js", "--verbose"],
        workingDirectory: "C:\\Projects\\seksbot",
        environment: {
          NODE_ENV: "production",
          SEKSBOT_PORT: "18789",
        },
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
