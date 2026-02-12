/**
 * seksbot Skills — Loader
 *
 * Scans skill directories, parses manifests, and builds the prompt snapshot
 * for injection into the agent system prompt.
 */

import fs from "node:fs";
import path from "node:path";
import type { LoadedSkill, SeksSkillSnapshot } from "./types.js";
import { parseManifest, readSkillMd } from "./manifest.js";

/**
 * Scan a directory for skill subdirectories.
 * Each subdirectory should contain a skill.yaml/skill.json and optionally a SKILL.md.
 */
export function scanSkillsDir(
  dirPath: string,
  options?: {
    /** Skill names to disable (from config) */
    disabled?: Set<string>;
    /** Only include these skill names (allowlist) */
    allowlist?: Set<string>;
  },
): LoadedSkill[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: LoadedSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;

    const skillDir = path.join(dirPath, entry.name);
    const result = parseManifest(skillDir);

    if (!result.ok) {
      // Log but don't fail — skip malformed skills
      console.warn(`[seks-skills] Skipping ${entry.name}: ${result.error}`);
      continue;
    }

    const { manifest } = result;

    // Check allowlist
    if (options?.allowlist && !options.allowlist.has(manifest.name)) {
      continue;
    }

    // Check disabled
    const enabled = !options?.disabled?.has(manifest.name);

    // Check OS compatibility
    if (manifest.os && manifest.os.length > 0) {
      if (!manifest.os.includes(process.platform)) {
        continue;
      }
    }

    // Read SKILL.md
    const skillMd = readSkillMd(skillDir, manifest) ?? "";

    skills.push({
      manifest,
      dirPath: skillDir,
      skillMd,
      enabled,
    });
  }

  return skills;
}

/**
 * Load skills from multiple directories (workspace skills, bundled skills, etc.)
 * Later directories take precedence (can override earlier ones by name).
 */
export function loadSkills(
  dirs: string[],
  options?: {
    disabled?: Set<string>;
    allowlist?: Set<string>;
  },
): LoadedSkill[] {
  const byName = new Map<string, LoadedSkill>();

  for (const dir of dirs) {
    const skills = scanSkillsDir(dir, options);
    for (const skill of skills) {
      byName.set(skill.manifest.name, skill);
    }
  }

  return [...byName.values()];
}

/**
 * Format a capability for display.
 */
function formatCapability(cap: { kind: string; endpoint?: string; key?: string }): string {
  if (cap.kind === "custom" && cap.key) return cap.key;
  if (cap.kind === "api" && cap.endpoint) return cap.endpoint;
  return "unknown";
}

/**
 * Build a skill snapshot for injection into the agent system prompt.
 * Produces the <available_skills> block.
 */
export function buildSkillSnapshot(skills: LoadedSkill[]): SeksSkillSnapshot {
  const enabledSkills = skills.filter((s) => s.enabled);

  if (enabledSkills.length === 0) {
    return { prompt: "", skills: [] };
  }

  const skillEntries = enabledSkills.map((s) => ({
    name: s.manifest.name,
    description: s.manifest.description,
    emoji: s.manifest.emoji,
    capabilities: s.manifest.capabilities.map(formatCapability),
  }));

  const promptLines = [
    "<available_skills>",
    ...enabledSkills.map((s) => {
      const emoji = s.manifest.emoji ? ` ${s.manifest.emoji}` : "";
      const caps = s.manifest.capabilities.map(formatCapability).join(", ");
      return [
        "  <skill>",
        `    <name>${s.manifest.name}${emoji}</name>`,
        `    <description>${s.manifest.description}</description>`,
        `    <capabilities>${caps}</capabilities>`,
        `    <location>${path.join(s.dirPath, s.manifest.skillMdPath ?? "SKILL.md")}</location>`,
        "  </skill>",
      ].join("\n");
    }),
    "</available_skills>",
  ];

  return {
    prompt: promptLines.join("\n"),
    skills: skillEntries,
  };
}
