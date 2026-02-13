// skills-status — DEPRECATED (skills engine removed)

import type { SkillInstallSpec } from "./skills.js";

export type SkillStatusConfigCheck = {
  path: string;
  value: unknown;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: SkillInstallSpec["kind"];
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
};

export function buildWorkspaceSkillStatus(
  workspaceDir: string,
  _opts?: {
    config?: unknown;
    managedSkillsDir?: string;
    entries?: unknown[];
    eligibility?: unknown;
  },
): SkillStatusReport {
  return {
    workspaceDir,
    managedSkillsDir: "",
    skills: [],
  };
}
