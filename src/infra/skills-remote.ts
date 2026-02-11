// skills-remote — DEPRECATED (skills engine removed)

import type { SkillEligibilityContext } from "../agents/skills.js";
import type { seksbotConfig } from "../config/config.js";
import type { NodeRegistry } from "../gateway/node-registry.js";

export function setSkillsRemoteRegistry(_registry: NodeRegistry | null) {}

export async function primeRemoteSkillsCache() {}

export function recordRemoteNodeInfo(_node: {
  nodeId: string;
  displayName?: string;
  platform?: string;
  deviceFamily?: string;
  commands?: string[];
  remoteIp?: string;
}) {}

export function recordRemoteNodeBins(_nodeId: string, _bins: string[]) {}

export async function refreshRemoteNodeBins(_params: {
  nodeId: string;
  registry?: NodeRegistry;
  platform?: string;
  deviceFamily?: string;
  commands?: string[];
  cfg?: unknown;
}) {}

export function getRemoteSkillEligibility(): SkillEligibilityContext["remote"] | undefined {
  return undefined;
}

export async function refreshRemoteBinsForConnectedNodes(_cfg: seksbotConfig) {}
