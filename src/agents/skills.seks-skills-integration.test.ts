import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveSkillsPromptForRun } from "./skills.js";

const tmpDirs: string[] = [];

function makeTmpWorkspace(skills: Record<string, { manifest: object; skillMd?: string }>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seks-integration-test-"));
  tmpDirs.push(dir);

  for (const [name, skill] of Object.entries(skills)) {
    const skillDir = path.join(dir, "skills", name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "skill.json"), JSON.stringify(skill.manifest), "utf-8");
    if (skill.skillMd) {
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.skillMd, "utf-8");
    }
  }

  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe("resolveSkillsPromptForRun — seksbot-native skills", () => {
  it("picks up seksbot-native skills from workspace/skills/", () => {
    const workspaceDir = makeTmpWorkspace({
      "my-skill": {
        manifest: {
          name: "my-skill",
          description: "Does a thing",
          capabilities: ["anthropic/messages.create"],
        },
        skillMd: "# My Skill\nInstructions here.",
      },
    });

    const prompt = resolveSkillsPromptForRun({ workspaceDir });
    expect(prompt).toContain("my-skill");
    expect(prompt).toContain("Does a thing");
    expect(prompt).toContain("anthropic/messages.create");
    expect(prompt).toContain("<available_skills>");
  });

  it("returns empty string when no skills exist", () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "seks-empty-test-"));
    tmpDirs.push(workspaceDir);

    const prompt = resolveSkillsPromptForRun({ workspaceDir });
    expect(prompt).toBe("");
  });

  it("includes multiple seksbot-native skills", () => {
    const workspaceDir = makeTmpWorkspace({
      "skill-a": {
        manifest: {
          name: "skill-a",
          description: "First skill",
          capabilities: ["anthropic/messages.create"],
        },
      },
      "skill-b": {
        manifest: {
          name: "skill-b",
          description: "Second skill",
          capabilities: ["custom/my-secret"],
        },
      },
    });

    const prompt = resolveSkillsPromptForRun({ workspaceDir });
    expect(prompt).toContain("skill-a");
    expect(prompt).toContain("skill-b");
    expect(prompt).toContain("First skill");
    expect(prompt).toContain("Second skill");
  });
});
