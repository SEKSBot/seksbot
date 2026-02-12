import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseManifest, readSkillMd } from "./manifest.js";

const tmpDirs: string[] = [];

function makeTmpSkillDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seks-skill-test-"));
  tmpDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
  }
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe("parseManifest", () => {
  it("parses a valid YAML manifest", () => {
    const dir = makeTmpSkillDir({
      "skill.yaml": `
name: my-skill
description: Does a thing
capabilities:
  - anthropic/messages.create
  - custom/my-secret
emoji: "🔧"
author: FootGun
`,
    });

    const result = parseManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.name).toBe("my-skill");
    expect(result.manifest.description).toBe("Does a thing");
    expect(result.manifest.emoji).toBe("🔧");
    expect(result.manifest.author).toBe("FootGun");
    expect(result.manifest.capabilities).toEqual([
      { kind: "api", endpoint: "anthropic/messages.create" },
      { kind: "custom", key: "custom/my-secret" },
    ]);
  });

  it("parses a valid JSON manifest", () => {
    const dir = makeTmpSkillDir({
      "skill.json": JSON.stringify({
        name: "json-skill",
        description: "A JSON skill",
        capabilities: ["openai/chat.completions"],
      }),
    });

    const result = parseManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.name).toBe("json-skill");
    expect(result.manifest.capabilities).toEqual([
      { kind: "api", endpoint: "openai/chat.completions" },
    ]);
  });

  it("rejects missing name", () => {
    const dir = makeTmpSkillDir({
      "skill.yaml": `
description: No name
capabilities:
  - anthropic/messages.create
`,
    });

    const result = parseManifest(dir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("name");
  });

  it("rejects invalid skill name format", () => {
    const dir = makeTmpSkillDir({
      "skill.yaml": `
name: My Skill
description: Bad name
capabilities:
  - anthropic/messages.create
`,
    });

    const result = parseManifest(dir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("kebab-case");
  });

  it("rejects missing capabilities", () => {
    const dir = makeTmpSkillDir({
      "skill.yaml": `
name: no-caps
description: No capabilities declared
`,
    });

    const result = parseManifest(dir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("capabilities");
  });

  it("rejects missing description", () => {
    const dir = makeTmpSkillDir({
      "skill.yaml": `
name: no-desc
capabilities:
  - anthropic/messages.create
`,
    });

    const result = parseManifest(dir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("description");
  });

  it("returns error for directory with no manifest", () => {
    const dir = makeTmpSkillDir({
      "README.md": "not a manifest",
    });

    const result = parseManifest(dir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no manifest file");
  });

  it("prefers skill.yaml over skill.json", () => {
    const dir = makeTmpSkillDir({
      "skill.yaml": `
name: yaml-wins
description: YAML version
capabilities:
  - anthropic/messages.create
`,
      "skill.json": JSON.stringify({
        name: "json-loses",
        description: "JSON version",
        capabilities: ["openai/chat.completions"],
      }),
    });

    const result = parseManifest(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.name).toBe("yaml-wins");
  });
});

describe("readSkillMd", () => {
  it("reads SKILL.md from directory", () => {
    const dir = makeTmpSkillDir({
      "SKILL.md": "# My Skill\n\nInstructions here.",
    });

    const content = readSkillMd(dir);
    expect(content).toBe("# My Skill\n\nInstructions here.");
  });

  it("returns null when SKILL.md is missing", () => {
    const dir = makeTmpSkillDir({
      "skill.yaml": "name: test",
    });

    const content = readSkillMd(dir);
    expect(content).toBeNull();
  });

  it("uses custom path from manifest", () => {
    const dir = makeTmpSkillDir({
      "docs/instructions.md": "Custom instructions",
    });

    const content = readSkillMd(dir, {
      version: 1,
      name: "test",
      description: "test",
      capabilities: [],
      skillMdPath: "docs/instructions.md",
    });
    expect(content).toBe("Custom instructions");
  });
});
