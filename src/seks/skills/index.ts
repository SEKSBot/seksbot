/**
 * seksbot Skills Framework
 *
 * Skills are containerized sub-agent tasks with declared capabilities.
 * All external access goes through the SEKS broker or seksh.
 */

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
