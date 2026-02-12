import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSkillSnapshot, loadSkills, scanSkillsDir } from "./loader.js";

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seks-loader-test-"));
  tmpDirs.push(dir);
  return dir;
}

function writeSkill(
  baseDir: string,
  name: string,
  manifest: Record<string, unknown>,
  skillMd?: string,
): string {
  const skillDir = path.join(baseDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "skill.json"), JSON.stringify(manifest), "utf-8");
  if (skillMd) {
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd, "utf-8");
  }
  return skillDir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe("scanSkillsDir", () => {
  it("loads skills from a directory", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "skill-a", {
      name: "skill-a",
      description: "First skill",
      capabilities: ["anthropic/messages.create"],
    }, "# Skill A\nDo things.");

    writeSkill(dir, "skill-b", {
      name: "skill-b",
      description: "Second skill",
      capabilities: ["openai/chat.completions"],
    });

    const skills = scanSkillsDir(dir);
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.manifest.name).sort()).toEqual(["skill-a", "skill-b"]);
    expect(skills.find((s) => s.manifest.name === "skill-a")?.skillMd).toBe("# Skill A\nDo things.");
    expect(skills.find((s) => s.manifest.name === "skill-b")?.skillMd).toBe("");
  });

  it("skips directories without manifests", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "valid-skill", {
      name: "valid-skill",
      description: "Has manifest",
      capabilities: ["anthropic/messages.create"],
    });
    // Create a dir without a manifest
    fs.mkdirSync(path.join(dir, "no-manifest"), { recursive: true });
    fs.writeFileSync(path.join(dir, "no-manifest", "README.md"), "no manifest here");

    const skills = scanSkillsDir(dir);
    expect(skills).toHaveLength(1);
    expect(skills[0].manifest.name).toBe("valid-skill");
  });

  it("skips hidden directories", () => {
    const dir = makeTmpDir();
    writeSkill(dir, ".hidden-skill", {
      name: "hidden-skill",
      description: "Should be skipped",
      capabilities: ["anthropic/messages.create"],
    });

    const skills = scanSkillsDir(dir);
    expect(skills).toHaveLength(0);
  });

  it("respects disabled set", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "skill-a", {
      name: "skill-a",
      description: "Enabled",
      capabilities: ["anthropic/messages.create"],
    });
    writeSkill(dir, "skill-b", {
      name: "skill-b",
      description: "Disabled",
      capabilities: ["anthropic/messages.create"],
    });

    const skills = scanSkillsDir(dir, { disabled: new Set(["skill-b"]) });
    expect(skills).toHaveLength(2);
    expect(skills.find((s) => s.manifest.name === "skill-a")?.enabled).toBe(true);
    expect(skills.find((s) => s.manifest.name === "skill-b")?.enabled).toBe(false);
  });

  it("respects allowlist", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "skill-a", {
      name: "skill-a",
      description: "Allowed",
      capabilities: ["anthropic/messages.create"],
    });
    writeSkill(dir, "skill-b", {
      name: "skill-b",
      description: "Not allowed",
      capabilities: ["anthropic/messages.create"],
    });

    const skills = scanSkillsDir(dir, { allowlist: new Set(["skill-a"]) });
    expect(skills).toHaveLength(1);
    expect(skills[0].manifest.name).toBe("skill-a");
  });

  it("returns empty array for nonexistent directory", () => {
    const skills = scanSkillsDir("/nonexistent/path");
    expect(skills).toEqual([]);
  });
});

describe("loadSkills", () => {
  it("merges skills from multiple directories (later wins)", () => {
    const dir1 = makeTmpDir();
    const dir2 = makeTmpDir();

    writeSkill(dir1, "shared-skill", {
      name: "shared-skill",
      description: "From dir1",
      capabilities: ["anthropic/messages.create"],
    });
    writeSkill(dir2, "shared-skill", {
      name: "shared-skill",
      description: "From dir2 (override)",
      capabilities: ["openai/chat.completions"],
    });

    const skills = loadSkills([dir1, dir2]);
    expect(skills).toHaveLength(1);
    expect(skills[0].manifest.description).toBe("From dir2 (override)");
  });
});

describe("buildSkillSnapshot", () => {
  it("builds prompt with available skills", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "my-skill", {
      name: "my-skill",
      description: "Does things",
      capabilities: ["anthropic/messages.create", "custom/my-secret"],
      emoji: "🔧",
    });

    const skills = scanSkillsDir(dir);
    const snapshot = buildSkillSnapshot(skills);

    expect(snapshot.prompt).toContain("<available_skills>");
    expect(snapshot.prompt).toContain("my-skill");
    expect(snapshot.prompt).toContain("Does things");
    expect(snapshot.prompt).toContain("anthropic/messages.create");
    expect(snapshot.prompt).toContain("custom/my-secret");
    expect(snapshot.skills).toHaveLength(1);
    expect(snapshot.skills[0].name).toBe("my-skill");
    expect(snapshot.skills[0].capabilities).toEqual([
      "anthropic/messages.create",
      "custom/my-secret",
    ]);
  });

  it("returns empty prompt when no skills", () => {
    const snapshot = buildSkillSnapshot([]);
    expect(snapshot.prompt).toBe("");
    expect(snapshot.skills).toEqual([]);
  });

  it("excludes disabled skills from prompt", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "enabled-skill", {
      name: "enabled-skill",
      description: "Enabled",
      capabilities: ["anthropic/messages.create"],
    });
    writeSkill(dir, "disabled-skill", {
      name: "disabled-skill",
      description: "Disabled",
      capabilities: ["anthropic/messages.create"],
    });

    const skills = scanSkillsDir(dir, { disabled: new Set(["disabled-skill"]) });
    const snapshot = buildSkillSnapshot(skills);

    expect(snapshot.prompt).toContain("enabled-skill");
    expect(snapshot.prompt).not.toContain("disabled-skill");
    expect(snapshot.skills).toHaveLength(1);
  });
});
