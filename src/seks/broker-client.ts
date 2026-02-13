import { exec } from "child_process";
import { promisify } from "util";
import type {
  AgentCapabilities,
  BrokerAuthVerifyRequest,
  BrokerAuthVerifyResponse,
  BrokerError,
  BrokerProxyRequestOptions,
  ChannelTokens,
} from "./types.js";

const execAsync = promisify(exec);

/**
 * Broker configuration for standalone functions
 */
export type SeksBrokerConfig = {
  url: string;
  token?: string;
  tokenCommand?: string;
};

// Module-level cache for standalone functions
let cachedToken: string | null = null;
let _cachedConfig: SeksBrokerConfig | null = null;

/**
 * Resolve broker token from config (standalone version)
 */
async function resolveBrokerToken(config: SeksBrokerConfig): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }
  if (config.token) {
    cachedToken = config.token;
    return config.token;
  }
  if (config.tokenCommand) {
    const { stdout } = await execAsync(config.tokenCommand, { timeout: 10000 });
    cachedToken = stdout.trim();
    return cachedToken;
  }
  throw new Error("No broker token configured");
}

/**
 * Client for SEKS Broker API
 * Handles token resolution, API proxying, and capability management
 */
export class BrokerClient {
  private brokerUrl: string;
  private token?: string;
  private tokenCommand?: string;
  private cachedToken?: string;

  constructor(brokerUrl: string, token?: string, tokenCommand?: string) {
    this.brokerUrl = brokerUrl.replace(/\/$/, ""); // remove trailing slash
    this.token = token;
    this.tokenCommand = tokenCommand;
  }

  /**
   * Resolve broker token from config.token or by running config.tokenCommand
   * Caches in memory, never writes to disk
   */
  async resolveToken(): Promise<string> {
    if (this.cachedToken) {
      return this.cachedToken;
    }

    if (this.token) {
      this.cachedToken = this.token;
      return this.token;
    }

    if (this.tokenCommand) {
      try {
        const { stdout } = await execAsync(this.tokenCommand, {
          timeout: 10000, // 10s timeout
        });
        this.cachedToken = stdout.trim();
        return this.cachedToken;
      } catch (error) {
        throw new Error(
          `Failed to execute tokenCommand: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }

    throw new Error("No broker token configured (token or tokenCommand required)");
  }

  /**
   * Make authenticated HTTP request to broker
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.resolveToken();
    const url = `${this.brokerUrl}${path}`;

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const brokerError: BrokerError = {
        error: errorData.error || `HTTP ${response.status}`,
        code: errorData.code,
        statusCode: response.status,
      };
      throw new Error(`Broker request failed: ${JSON.stringify(brokerError)}`);
    }

    return response.json();
  }

  /**
   * Build proxy URL for provider API calls
   */
  proxyUrl(provider: string, path: string): string {
    // Remove leading slash from path if present
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `${this.brokerUrl}/v1/proxy/${provider}/${cleanPath}`;
  }

  /**
   * Make proxied request to provider API through broker
   * Returns the raw Response for flexibility in handling different content types
   */
  async proxyRequest(
    provider: string,
    path: string,
    options: BrokerProxyRequestOptions = {},
  ): Promise<Response> {
    const token = await this.resolveToken();
    const url = this.proxyUrl(provider, path);

    return fetch(url, {
      method: options.method || "GET",
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
      body: options.body,
    });
  }

  /**
   * Fetch channel tokens for this agent
   */
  async getChannelTokens(): Promise<ChannelTokens> {
    return this.request<ChannelTokens>("/v1/tokens/channels");
  }

  /**
   * Fetch free-form secret with custom/ prefix
   */
  async getCustomSecret(key: string): Promise<string> {
    const response = await this.request<{ value: string }>(`/v1/secrets/custom/${key}`);
    return response.value;
  }

  /**
   * List agent capabilities
   */
  async getCapabilities(): Promise<AgentCapabilities> {
    return this.request<AgentCapabilities>("/v1/agent/capabilities");
  }

  /**
   * Verify agent token
   */
  async verifyToken(): Promise<BrokerAuthVerifyResponse> {
    const token = await this.resolveToken();
    return this.request<BrokerAuthVerifyResponse>("/v1/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token } as BrokerAuthVerifyRequest),
    });
  }

  /**
   * Clear cached token (e.g., if token expires)
   */
  clearTokenCache(): void {
    this.cachedToken = undefined;
  }
}

/**
 * Invalidate the cached broker token (e.g. after rotation or error).
 */
export function clearBrokerTokenCache(): void {
  cachedToken = null;
  _cachedConfig = null;
}

/**
 * Request a scoped token for a skill execution.
 * The scoped token grants only the specified capabilities and has a short TTL.
 */
export async function requestScopedToken(
  config: SeksBrokerConfig,
  params: {
    skillName: string;
    capabilities: string[];
    ttlSeconds: number;
  },
): Promise<{ token: string; expiresAt: string } | null> {
  try {
    const token = await resolveBrokerToken(config);
    const url = `${config.url.replace(/\/+$/, "")}/v1/tokens/scoped`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        skillName: params.skillName,
        capabilities: params.capabilities,
        ttlSeconds: params.ttlSeconds,
      }),
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as { token: string; expiresAt: string };
  } catch {
    return null;
  }
}

/**
 * Check whether a SEKS broker is configured.
 */
/**
 * Resolve a proxy target URL and auth for a given service
 */
export async function resolveProxyTarget(
  config: SeksBrokerConfig,
  service: string,
): Promise<{ baseUrl: string; apiKey: string }> {
  const baseUrl = `${config.url.replace(/\/+$/, "")}/v1/proxy/${service}`;
  const apiKey = await resolveBrokerToken(config);
  return { baseUrl, apiKey };
}

export function isBrokerConfigured(config?: SeksBrokerConfig | null): config is SeksBrokerConfig {
  return !!config?.url && !!(config.token || config.tokenCommand);
}
