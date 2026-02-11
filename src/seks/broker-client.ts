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
  private async resolveToken(): Promise<string> {
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
        throw new Error(`Failed to execute tokenCommand: ${error}`);
      }
    }

    throw new Error("No broker token configured (token or tokenCommand required)");
  }

  /**
   * Make authenticated HTTP request to broker
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.resolveToken();
    const url = `${this.brokerUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
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
    options: BrokerProxyRequestOptions = {}
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