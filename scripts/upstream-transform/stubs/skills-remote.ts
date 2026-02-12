// skills-remote — DEPRECATED (skills engine removed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function setSkillsRemoteRegistry(_registry: Any) {}

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
  registry?: Any;
  platform?: string;
  deviceFamily?: string;
  commands?: string[];
  cfg?: unknown;
}) {}

export function getRemoteSkillEligibility(): undefined {
  return undefined;
}

export async function refreshRemoteBinsForConnectedNodes(_cfg: Any) {}
