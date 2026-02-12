/**
 * seksbot Skills Framework — Type Definitions
 *
 * A seksbot skill is a containerized sub-agent task with declared capabilities.
 * Skills never get raw API keys — all external access goes through the SEKS broker
 * or seksh.
 */

// ─── Capability Declarations ────────────────────────────────────────────────

/**
 * A structured API capability (e.g., "anthropic/messages.create").
 * The broker knows what secrets are needed to fulfill this.
 */
export type ApiCapability = {
  kind: "api";
  /** Provider/endpoint path (e.g., "anthropic/messages.create", "discord/messages.send") */
  endpoint: string;
};

/**
 * A free-form secret (e.g., "custom/my-webhook-secret").
 * Retrieved via seksh or broker API.
 */
export type CustomCapability = {
  kind: "custom";
  /** Key name with custom/ prefix (e.g., "custom/deploy-token") */
  key: string;
};

export type Capability = ApiCapability | CustomCapability;

// ─── Container Spec ─────────────────────────────────────────────────────────

export type ContainerSpec = {
  /** Container image to use (e.g., "seksbot-skill-runner:latest") */
  image?: string;
  /** Memory limit (e.g., "512m") */
  memoryLimit?: string;
  /** CPU limit (e.g., "1.0") */
  cpuLimit?: string;
  /** Timeout for skill execution in seconds (default: 300) */
  timeoutSeconds?: number;
  /** Network policy — "broker-only" means only the SEKS broker is reachable */
  network?: "broker-only" | "none";
  /** Additional environment variables (non-secret) */
  env?: Record<string, string>;
};

// ─── Skill Manifest ─────────────────────────────────────────────────────────

export type SeksSkillManifest = {
  /** Skill format version */
  version: 1;
  /** Unique skill name (lowercase, kebab-case) */
  name: string;
  /** Human-readable description (shown in agent system prompt) */
  description: string;
  /** Emoji for display */
  emoji?: string;
  /** Author */
  author?: string;
  /** Capabilities this skill requires (declared, broker-enforced) */
  capabilities: Capability[];
  /** Container execution spec (optional — falls back to defaults) */
  container?: ContainerSpec;
  /** OS restrictions (e.g., ["darwin", "linux"]) */
  os?: string[];
  /** Whether this skill is always shown to the agent (vs. conditional) */
  always?: boolean;
  /** Path to the SKILL.md relative to the skill directory */
  skillMdPath?: string;
};

// ─── Loaded Skill ───────────────────────────────────────────────────────────

export type LoadedSkill = {
  /** Parsed manifest */
  manifest: SeksSkillManifest;
  /** Absolute path to the skill directory */
  dirPath: string;
  /** Raw SKILL.md content (instructions for the agent) */
  skillMd: string;
  /** Whether the skill is enabled in config */
  enabled: boolean;
};

// ─── Skill Snapshot (for system prompt) ─────────────────────────────────────

export type SeksSkillSnapshot = {
  /** Formatted prompt text for injection into system prompt */
  prompt: string;
  /** List of loaded skills */
  skills: Array<{
    name: string;
    description: string;
    emoji?: string;
    capabilities: string[];
  }>;
};

// ─── Execution ──────────────────────────────────────────────────────────────

export type SkillExecutionMode = "container" | "local";

export type SkillExecutionRequest = {
  /** Which skill to execute */
  skillName: string;
  /** Task/prompt for the sub-agent */
  task: string;
  /** Execution mode (container or local for development) */
  mode: SkillExecutionMode;
  /** Override timeout (seconds) */
  timeoutSeconds?: number;
};

export type SkillExecutionResult = {
  ok: boolean;
  /** Skill output/response */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  durationMs: number;
  /** Which capabilities were actually used (from broker logs) */
  capabilitiesUsed?: string[];
};
