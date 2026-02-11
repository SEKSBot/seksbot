/**
 * seksh integration — shell-out to the seksh binary for local key material.
 *
 * seksh handles hardware keychain / TPM / secure enclave operations
 * that the agent process shouldn't do directly.
 *
 * Spike / proof-of-concept.
 */

import { execSync } from "node:child_process";

export type SekshOptions = {
  /** Path to seksh binary (default: "seksh") */
  binary?: string;
  /** Timeout in ms (default: 10000) */
  timeoutMs?: number;
};

const DEFAULT_BINARY = "seksh";
const DEFAULT_TIMEOUT = 10_000;

/**
 * Get the broker token for this agent via seksh.
 */
export function getToken(agentId: string, options?: SekshOptions): string {
  const bin = options?.binary ?? DEFAULT_BINARY;
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT;
  const result = execSync(`${bin} get-token --agent ${agentId}`, {
    encoding: "utf8",
    timeout,
  }).trim();
  if (!result) {
    throw new Error(`seksh get-token returned empty for agent ${agentId}`);
  }
  return result;
}

/**
 * Check if seksh is available on the system.
 */
export function isAvailable(options?: SekshOptions): boolean {
  const bin = options?.binary ?? DEFAULT_BINARY;
  try {
    execSync(`command -v ${bin}`, { encoding: "utf8", timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rotate the broker token for this agent.
 */
export function rotateToken(agentId: string, options?: SekshOptions): string {
  const bin = options?.binary ?? DEFAULT_BINARY;
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT;
  const result = execSync(`${bin} rotate-token --agent ${agentId}`, {
    encoding: "utf8",
    timeout,
  }).trim();
  if (!result) {
    throw new Error(`seksh rotate-token returned empty for agent ${agentId}`);
  }
  return result;
}
