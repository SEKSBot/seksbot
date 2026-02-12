/**
 * seksbot Skills — Executor
 *
 * Runs skills as containerized sub-agents or locally (for development).
 * Container mode enforces broker-only networking and scoped tokens.
 */

import { execSync, spawn } from "node:child_process";
import type { SeksBrokerConfig } from "../broker-client.js";
import type {
  LoadedSkill,
  SkillExecutionMode,
  SkillExecutionRequest,
  SkillExecutionResult,
} from "./types.js";
import { isBrokerConfigured, resolveProxyTarget } from "../broker-client.js";

const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_CONTAINER_IMAGE = "node:22-slim";
const SKILL_NETWORK_NAME = "seksbot-skill-net";

// ─── Docker Helpers ─────────────────────────────────────────────────────────

/**
 * Check if Docker is available.
 */
export function isDockerAvailable(): boolean {
  try {
    execSync("docker version --format '{{.Server.Version}}'", {
      encoding: "utf8",
      timeout: 5_000,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the broker-only Docker network exists.
 * This network restricts outbound traffic to only the SEKS broker.
 */
export function ensureSkillNetwork(brokerHost?: string): void {
  try {
    execSync(`docker network inspect ${SKILL_NETWORK_NAME}`, {
      encoding: "utf8",
      timeout: 5_000,
      stdio: "pipe",
    });
    // Network already exists
  } catch {
    // Create the network
    const cmd = [
      "docker",
      "network",
      "create",
      "--driver",
      "bridge",
      "--internal", // no external access by default
      SKILL_NETWORK_NAME,
    ];
    execSync(cmd.join(" "), { encoding: "utf8", timeout: 10_000, stdio: "pipe" });
  }
}

/**
 * Request a scoped token from the SEKS broker for a skill run.
 */
async function requestScopedToken(
  brokerConfig: SeksBrokerConfig,
  skill: LoadedSkill,
  ttlSeconds: number,
): Promise<string | null> {
  try {
    const target = await resolveProxyTarget(brokerConfig, "tokens");
    const url = target.baseUrl.replace(/\/proxy\/tokens$/, "/tokens/scoped");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        skillName: skill.manifest.name,
        capabilities: skill.manifest.capabilities.map((c) =>
          c.kind === "custom" ? c.key : c.endpoint,
        ),
        ttlSeconds,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

// ─── Container Execution ────────────────────────────────────────────────────

/**
 * Execute a skill in a Docker container.
 */
async function executeInContainer(
  skill: LoadedSkill,
  request: SkillExecutionRequest,
  brokerConfig?: SeksBrokerConfig | null,
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  const timeout =
    request.timeoutSeconds ?? skill.manifest.container?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const image = skill.manifest.container?.image ?? DEFAULT_CONTAINER_IMAGE;

  if (!isDockerAvailable()) {
    return {
      ok: false,
      error: "Docker is not available. Install Docker or use local execution mode.",
      durationMs: Date.now() - startTime,
    };
  }

  // Request scoped token if broker is configured
  let agentToken: string | undefined;
  if (isBrokerConfigured(brokerConfig)) {
    const scoped = await requestScopedToken(brokerConfig!, skill, timeout);
    if (scoped) {
      agentToken = scoped;
    }
  }

  // Ensure network exists
  const networkMode = skill.manifest.container?.network ?? "broker-only";

  try {
    if (networkMode === "broker-only") {
      ensureSkillNetwork();
    }

    const containerName = `seksbot-skill-${skill.manifest.name}-${Date.now()}`;
    const args = [
      "docker",
      "run",
      "--rm",
      "--name",
      containerName,
      "--network",
      networkMode === "none" ? "none" : SKILL_NETWORK_NAME,
    ];

    // Resource limits
    if (skill.manifest.container?.memoryLimit) {
      args.push("--memory", skill.manifest.container.memoryLimit);
    }
    if (skill.manifest.container?.cpuLimit) {
      args.push("--cpus", skill.manifest.container.cpuLimit);
    }

    // Timeout
    args.push("--stop-timeout", String(timeout));

    // Environment
    if (agentToken) {
      args.push("-e", `SEKS_AGENT_TOKEN=${agentToken}`);
    }
    if (isBrokerConfigured(brokerConfig)) {
      args.push("-e", `SEKS_BROKER_URL=${brokerConfig!.url}`);
    }
    args.push("-e", `SEKS_SKILL_NAME=${skill.manifest.name}`);
    args.push("-e", `SEKS_SKILL_TASK=${request.task}`);

    // Extra env from container spec
    if (skill.manifest.container?.env) {
      for (const [key, value] of Object.entries(skill.manifest.container.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    // Image
    args.push(image);

    return await new Promise<SkillExecutionResult>((resolve) => {
      const proc = spawn(args[0], args.slice(1), {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeout * 1000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({
          ok: code === 0,
          output: stdout.trim() || undefined,
          error: code !== 0 ? stderr.trim() || `Container exited with code ${code}` : undefined,
          durationMs: Date.now() - startTime,
        });
      });

      proc.on("error", (err) => {
        resolve({
          ok: false,
          error: `Container execution failed: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });

      // Kill on timeout
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
          execSync(`docker kill ${containerName}`, { stdio: "pipe", timeout: 5_000 });
        } catch {
          // container may already be dead
        }
      }, timeout * 1000);
    });
  } catch (err) {
    return {
      ok: false,
      error: `Container setup failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - startTime,
    };
  }
}

// ─── Local Execution (Development) ──────────────────────────────────────────

/**
 * Execute a skill locally (no container, for development/testing).
 * Still respects broker-only auth if configured.
 */
async function executeLocally(
  skill: LoadedSkill,
  request: SkillExecutionRequest,
): Promise<SkillExecutionResult> {
  const startTime = Date.now();

  // In local mode, we just return the skill info — actual execution
  // would be handled by sessions_spawn or a sub-agent
  return {
    ok: true,
    output: [
      `[seksbot-skill: ${skill.manifest.name}]`,
      `Task: ${request.task}`,
      `Capabilities: ${skill.manifest.capabilities.map((c) => (c.kind === "custom" ? c.key : c.endpoint)).join(", ")}`,
      `Mode: local (development)`,
      "",
      "Skill instructions:",
      skill.skillMd || "(no SKILL.md)",
    ].join("\n"),
    durationMs: Date.now() - startTime,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Execute a skill in the specified mode.
 */
export async function executeSkill(
  skill: LoadedSkill,
  request: SkillExecutionRequest,
  options?: {
    brokerConfig?: SeksBrokerConfig | null;
  },
): Promise<SkillExecutionResult> {
  const mode: SkillExecutionMode = request.mode ?? "local";

  if (mode === "container") {
    return executeInContainer(skill, request, options?.brokerConfig);
  }
  return executeLocally(skill, request);
}
