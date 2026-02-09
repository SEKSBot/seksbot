/**
 * Seksbot Credential Broker Integration
 * 
 * This module provides credential injection without exposing secrets to agents.
 * The broker injects credentials at the HTTP/execution layer, so agents never
 * see the actual secret values.
 * 
 * @module seksbot/credential-broker
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Credential placeholder that agents see instead of real values
 */
export type CredentialMarker = `<secret:${string}>`;

/**
 * Credential definition stored in the broker
 */
export type CredentialDefinition = {
  /** Unique credential name */
  name: string;
  
  /** When this credential was added */
  addedAt: number;
  
  /** When this credential was last rotated */
  rotatedAt?: number;
  
  /** Optional expiry time */
  expiresAt?: number;
  
  /** Tags for organization */
  tags?: string[];
};

/**
 * Credential injection configuration
 */
export type CredentialInjection = {
  /** Credential name */
  name: string;
  
  /** How to inject: environment variable, HTTP header, or command argument */
  method: "env" | "header" | "arg";
  
  /** Target: env var name, header name, or arg placeholder */
  target: string;
  
  /** Optional transformation: base64, bearer, basic */
  transform?: "none" | "base64" | "bearer" | "basic";
};

/**
 * HTTP request template with credential injection
 */
export type HttpRequestTemplate = {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  urlPattern: string;
  urlAllowlist?: string[];
  headers?: Record<string, string>;
  credentials?: CredentialInjection[];
};

/**
 * Broker configuration
 */
export type BrokerConfig = {
  /** Broker endpoint (local socket or remote URL) */
  endpoint: string;
  
  /** Authentication token for broker */
  token?: string;
  
  /** Request timeout in ms */
  timeoutMs?: number;
  
  /** Whether to scrub output for leaked credentials */
  scrubOutput?: boolean;
};

// ============================================================================
// CREDENTIAL MARKERS
// ============================================================================

const MARKER_PATTERN = /^<secret:([a-zA-Z0-9_-]+)>$/;

/**
 * Create a credential marker for a secret name
 */
export function createMarker(name: string): CredentialMarker {
  return `<secret:${name}>`;
}

/**
 * Check if a value is a credential marker
 */
export function isMarker(value: string): value is CredentialMarker {
  return MARKER_PATTERN.test(value);
}

/**
 * Extract credential name from a marker
 */
export function parseMarker(marker: string): string | null {
  const match = marker.match(MARKER_PATTERN);
  return match ? match[1] : null;
}

// ============================================================================
// OUTPUT SCRUBBING
// ============================================================================

/**
 * Registry of secret values that should be scrubbed from output
 */
const scrubRegistry = new Map<string, { name: string; value: string }>();

/**
 * Register a secret value for output scrubbing
 * Can be called with just the value (name defaults to "REDACTED")
 * or with both name and value for better labeling
 */
export function registerForScrubbing(valueOrName: string, maybeValue?: string): void {
  const name = maybeValue !== undefined ? valueOrName : "REDACTED";
  const value = maybeValue !== undefined ? maybeValue : valueOrName;
  
  // Skip empty or very short secrets (to avoid false positives)
  if (!value || value.length < 2) {
    return;
  }
  
  const key = value.toLowerCase();
  scrubRegistry.set(key, { name, value });
  
  // Also register base64 encoded version
  const b64 = Buffer.from(value).toString("base64");
  scrubRegistry.set(b64.toLowerCase(), { name: `${name}:base64`, value: b64 });
  
  // And hex encoded version
  const hex = Buffer.from(value).toString("hex");
  scrubRegistry.set(hex.toLowerCase(), { name: `${name}:hex`, value: hex });
  
  // URL encoded version for special characters
  try {
    const urlEncoded = encodeURIComponent(value);
    if (urlEncoded !== value) {
      scrubRegistry.set(urlEncoded.toLowerCase(), { name: `${name}:url`, value: urlEncoded });
    }
  } catch {
    // Ignore encoding errors
  }
}

/**
 * Scrub any leaked credentials from output
 */
export function scrubOutput(output: string): string {
  let scrubbed = output;
  
  for (const [key, { name, value }] of scrubRegistry) {
    // Case-insensitive replacement
    const regex = new RegExp(escapeRegex(value), "gi");
    scrubbed = scrubbed.replace(regex, `<secret:${name}>`);
  }
  
  return scrubbed;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Clear scrub registry (for testing)
 */
export function clearScrubRegistry(): void {
  scrubRegistry.clear();
}

// ============================================================================
// HTTP REQUEST BUILDER
// ============================================================================

/**
 * Build an HTTP request with credentials injected by the broker
 * 
 * Agent provides:
 * - URL (validated against allowlist)
 * - Headers (no auth headers - broker injects those)
 * - Body (JSON serialized)
 * 
 * Broker adds:
 * - Authorization header with injected credential
 * - Any other required auth headers
 */
export type SecureHttpRequest = {
  /** Request URL (must match urlAllowlist if specified) */
  url: string;
  
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  
  /** Request headers (auth headers are blocked) */
  headers?: Record<string, string>;
  
  /** Request body (for POST/PUT/PATCH) */
  body?: string;
  
  /** Credential to inject */
  credential?: string;
  
  /** Timeout in ms */
  timeoutMs?: number;
};

/**
 * Blocked headers that agents cannot set directly
 */
const BLOCKED_HEADERS = new Set([
  "authorization",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
  "bearer",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

/**
 * Validate that request headers don't contain auth headers or injection attempts
 */
export function validateHeaders(
  headers: Record<string, string>,
): { valid: true; blocked: string[] } | { valid: false; blocked: string[]; error: string } {
  const blocked: string[] = [];
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    
    // Check for blocked header names
    if (BLOCKED_HEADERS.has(lowerKey)) {
      blocked.push(lowerKey);
    }
    
    // Check for header injection attempts (CRLF injection)
    if (value.includes("\r") || value.includes("\n") || value.includes("\x00")) {
      blocked.push(key);
    }
  }
  
  if (blocked.length > 0) {
    return {
      valid: false,
      blocked,
      error: `Security violation: Blocked headers detected: ${blocked.join(", ")}`,
    };
  }
  
  return { valid: true, blocked: [] };
}

// ============================================================================
// BROKER CLIENT
// ============================================================================

/**
 * Broker client interface
 */
export interface BrokerClient {
  /**
   * List available credential names (not values!)
   */
  listCredentials(): Promise<string[]>;
  
  /**
   * Check if a credential exists
   */
  hasCredential(name: string): Promise<boolean>;
  
  /**
   * Execute an HTTP request with credential injection
   */
  executeHttp(request: SecureHttpRequest): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }>;
  
  /**
   * Execute a command template with credential injection
   */
  executeTemplate(
    templateId: string,
    params: Record<string, unknown>,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}

/**
 * Create a broker client
 */
export function createBrokerClient(config: BrokerConfig): BrokerClient {
  // For now, return a stub implementation
  // Full implementation will connect to seks-broker
  return new StubBrokerClient(config);
}

/**
 * Stub broker client for initial development
 */
class StubBrokerClient implements BrokerClient {
  private config: BrokerConfig;
  
  constructor(config: BrokerConfig) {
    this.config = config;
  }
  
  async listCredentials(): Promise<string[]> {
    // TODO: Connect to actual broker
    return [];
  }
  
  async hasCredential(name: string): Promise<boolean> {
    // TODO: Connect to actual broker
    return false;
  }
  
  async executeHttp(request: SecureHttpRequest): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }> {
    // Validate headers don't contain auth
    if (request.headers) {
      const validation = validateHeaders(request.headers);
      if (!validation.ok) {
        throw new Error(validation.error);
      }
    }
    
    // TODO: Forward to broker for credential injection
    throw new Error("Broker not configured - HTTP requests require broker for credential injection");
  }
  
  async executeTemplate(
    templateId: string,
    params: Record<string, unknown>,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    // TODO: Forward to broker for credential injection
    throw new Error("Broker not configured - template execution requires broker");
  }
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Check if a URL is allowed based on allowlist patterns
 */
export function isUrlAllowed(url: string, allowlist?: string[]): boolean {
  // Empty string is never allowed
  if (!url || url.trim() === "") {
    return false;
  }
  
  // No allowlist = all allowed (undefined means not configured)
  if (allowlist === undefined) {
    return true;
  }
  
  // Empty array = nothing allowed
  if (allowlist.length === 0) {
    return false;
  }
  
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const protocol = parsed.protocol.toLowerCase();
    
    // Only allow http and https
    if (protocol !== "http:" && protocol !== "https:") {
      return false;
    }
    
    // Block raw IP addresses (must use hostnames)
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      // Exception for localhost
      if (host === "127.0.0.1") {
        return allowlist.some(p => p === "localhost" || p === "127.0.0.1");
      }
      return false;
    }
    
    // Block IPv6 addresses
    if (host.startsWith("[") || host.includes(":")) {
      return false;
    }
    
    for (const pattern of allowlist) {
      const lowerPattern = pattern.toLowerCase();
      
      // Wildcard matching: *.example.com
      if (lowerPattern.startsWith("*.")) {
        const suffix = lowerPattern.slice(1); // Keep the dot: .example.com
        // Must match as a subdomain, not just ending with the string
        if (host.endsWith(suffix) && host.length > suffix.length) {
          return true;
        }
        // Also match exact domain: *.example.com matches example.com
        if (host === lowerPattern.slice(2)) {
          return true;
        }
      } else if (host === lowerPattern) {
        return true;
      }
    }
    
    return false;
  } catch {
    return false; // Invalid URL
  }
}

/**
 * Default URL allowlist for common APIs
 * These are structurally safe REST APIs
 */
export const DEFAULT_URL_ALLOWLIST = [
  // Anthropic
  "api.anthropic.com",
  
  // OpenAI
  "api.openai.com",
  
  // Google
  "*.googleapis.com",
  "generativelanguage.googleapis.com",
  
  // Discord
  "discord.com",
  "discordapp.com",
  
  // Telegram
  "api.telegram.org",
  
  // GitHub
  "api.github.com",
  
  // Brave Search
  "api.search.brave.com",
  
  // ElevenLabs
  "api.elevenlabs.io",
  
  // Home Assistant (local)
  "localhost",
  "127.0.0.1",
];
