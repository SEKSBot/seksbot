/**
 * SEKS Broker Client
 *
 * When configured, all external auth flows through the SEKS broker.
 * The agent holds only a broker token; the broker injects real API keys.
 *
 * Spike / proof-of-concept — not wired into the main auth path yet.
 */

export type SeksBrokerConfig = {
  /** Broker base URL (e.g. "https://broker.seks.local") */
  url: string;
  /** Static broker token (mutually exclusive with tokenCommand) */
  token?: string;
  /** Shell command to retrieve broker token (e.g. "seksh get-token --agent footgun") */
  tokenCommand?: string;
};

export type ChannelTokens = Record<string, string>;

export type ProxyTarget = {
  /** Provider ID (e.g. "anthropic", "openai", "google") */
  providerId: string;
  /** The base URL the agent should use for this provider's API */
  baseUrl: string;
  /** The token to send (broker token — broker swaps it for the real key) */
  apiKey: string;
};

let cachedToken: string | null = null;
let cachedConfig: SeksBrokerConfig | null = null;

/**
 * Resolve the broker token, using cache, static config, or tokenCommand.
 */
async function resolveBrokerToken(config: SeksBrokerConfig): Promise<string> {
  if (cachedToken && cachedConfig === config) {
    return cachedToken;
  }

  if (config.token) {
    cachedToken = config.token;
    cachedConfig = config;
    return config.token;
  }

  if (config.tokenCommand) {
    const { execSync } = await import("node:child_process");
    const result = execSync(config.tokenCommand, {
      encoding: "utf8",
      timeout: 10_000,
    }).trim();
    if (!result) {
      throw new Error(`seksh tokenCommand returned empty result: ${config.tokenCommand}`);
    }
    cachedToken = result;
    cachedConfig = config;
    return result;
  }

  throw new Error("SEKS broker config has neither token nor tokenCommand");
}

/**
 * Build a proxy target for a given provider.
 * The agent uses this baseUrl + apiKey instead of direct provider credentials.
 */
export async function resolveProxyTarget(
  config: SeksBrokerConfig,
  providerId: string,
): Promise<ProxyTarget> {
  const token = await resolveBrokerToken(config);
  const baseUrl = `${config.url.replace(/\/+$/, "")}/v1/proxy/${providerId}`;
  return { providerId, baseUrl, apiKey: token };
}

/**
 * Fetch channel tokens (Discord, Telegram, etc.) from the broker.
 * Tokens are held in-memory only, never written to disk.
 */
export async function fetchChannelTokens(
  config: SeksBrokerConfig,
): Promise<ChannelTokens> {
  const token = await resolveBrokerToken(config);
  const url = `${config.url.replace(/\/+$/, "")}/v1/tokens/channels`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`SEKS broker /v1/tokens/channels failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ChannelTokens;
}

/**
 * Verify the agent's broker token is valid.
 */
export async function verifyBrokerToken(
  config: SeksBrokerConfig,
): Promise<boolean> {
  try {
    const token = await resolveBrokerToken(config);
    const url = `${config.url.replace(/\/+$/, "")}/v1/auth/verify`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Invalidate the cached broker token (e.g. after rotation or error).
 */
export function clearBrokerTokenCache(): void {
  cachedToken = null;
  cachedConfig = null;
}

/**
 * Check whether a SEKS broker is configured.
 */
export function isBrokerConfigured(config?: SeksBrokerConfig | null): config is SeksBrokerConfig {
  return !!config?.url && !!(config.token || config.tokenCommand);
}
