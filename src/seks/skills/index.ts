/**
 * seksbot Skills Framework
 *
 * Skills are containerized sub-agent tasks with declared capabilities.
 * All external access goes through the SEKS broker or seksh.
 */

/** Default container image for skill execution (built from Dockerfile.skill-runner). */
export const DEFAULT_SKILL_RUNNER_IMAGE = "seksbot-skill-runner:latest";

export type {
  ApiCapability,
  Capability,
  ContainerSpec,
  CustomCapability,
  LoadedSkill,
  SeksSkillManifest,
  SeksSkillSnapshot,
  SkillExecutionMode,
  SkillExecutionRequest,
  SkillExecutionResult,
} from "./types.js";

export { parseManifest, readSkillMd } from "./manifest.js";
export { buildSkillSnapshot, loadSkills, scanSkillsDir } from "./loader.js";
export { executeSkill, isDockerAvailable } from "./executor.js";
