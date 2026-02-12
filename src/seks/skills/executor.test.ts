import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LoadedSkill } from "./types.js";
import { executeSkill, isDockerAvailable } from "./executor.js";

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seks-executor-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

function makeTestSkill(overrides?: Partial<LoadedSkill>): LoadedSkill {
  const dir = makeTmpDir();
  return {
    manifest: {
      version: 1,
      name: "test-skill",
      description: "A test skill",
      capabilities: [{ kind: "api", endpoint: "anthropic/messages.create" }],
    },
    dirPath: dir,
    skillMd: "# Test Skill\nDo the thing.",
    enabled: true,
    ...overrides,
  };
}

describe("isDockerAvailable", () => {
  it("returns a boolean", () => {
    const result = isDockerAvailable();
    expect(typeof result).toBe("boolean");
  });
});

describe("executeSkill — local mode", () => {
  it("returns skill info in local mode", async () => {
    const skill = makeTestSkill();
    const result = await executeSkill(skill, {
      skillName: "test-skill",
      task: "Do the thing",
      mode: "local",
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("test-skill");
    expect(result.output).toContain("Do the thing");
    expect(result.output).toContain("anthropic/messages.create");
    expect(result.output).toContain("local (development)");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("includes SKILL.md content", async () => {
    const skill = makeTestSkill({ skillMd: "# Custom Instructions\nStep 1: Do stuff." });
    const result = await executeSkill(skill, {
      skillName: "test-skill",
      task: "Run it",
      mode: "local",
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("Custom Instructions");
    expect(result.output).toContain("Step 1: Do stuff.");
  });

  it("handles missing SKILL.md", async () => {
    const skill = makeTestSkill({ skillMd: "" });
    const result = await executeSkill(skill, {
      skillName: "test-skill",
      task: "Run it",
      mode: "local",
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("(no SKILL.md)");
  });

  it("includes custom capabilities in output", async () => {
    const skill = makeTestSkill({
      manifest: {
        version: 1,
        name: "custom-skill",
        description: "Has custom caps",
        capabilities: [
          { kind: "api", endpoint: "openai/chat.completions" },
          { kind: "custom", key: "custom/my-secret" },
        ],
      },
    });

    const result = await executeSkill(skill, {
      skillName: "custom-skill",
      task: "Do it",
      mode: "local",
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("openai/chat.completions");
    expect(result.output).toContain("custom/my-secret");
  });
});

describe("executeSkill — container mode", () => {
  it("fails gracefully when Docker is not available", async () => {
    // This test may pass or fail depending on Docker availability
    // We're testing that it doesn't crash either way
    const skill = makeTestSkill();
    const result = await executeSkill(skill, {
      skillName: "test-skill",
      task: "Do the thing",
      mode: "container",
    });

    expect(typeof result.ok).toBe("boolean");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    if (!isDockerAvailable()) {
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Docker");
    }
  });
});
