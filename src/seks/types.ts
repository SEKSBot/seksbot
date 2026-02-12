// SEKS Broker types

/**
 * Capability grants - agents get capabilities, not direct secret access.
 * The broker resolves capability → secret at proxy time.
 */
export type CapabilityGrant = {
  /** Provider/API identifier (e.g., "anthropic", "openai", "discord") */
  provider: string;
  /** Specific capability (e.g., "messages.create", "models.list", "messages.send") */
  capability: string;
  /** Optional: additional scoping data */
  scope?: Record<string, unknown>;
};

/**
 * Secret scope - where the secret lives
 */
export type SecretScope = "account-global" | "agent-scoped";

/**
 * Structured per-API secret (standardized naming)
 * Example: anthropic requires "api_key", discord requires "bot_token"
 */
export type StructuredSecret = {
  provider: string;
  scope: SecretScope;
  fields: Record<string, string>; // e.g., { api_key: "sk-ant-..." }
};

/**
 * Free-form secret with custom/ prefix
 */
export type CustomSecret = {
  key: string; // e.g., "custom/my-webhook-secret"
  value: string;
  scope: SecretScope;
};

/**
 * Agent's capability grants
 */
export type AgentCapabilities = {
  agentId: string;
  capabilities: CapabilityGrant[];
};

/**
 * Channel tokens response from broker
 */
export type ChannelTokens = {
  discord?: string;
  telegram?: string;
  slack?: string;
  signal?: string;
  whatsapp?: string;
  [provider: string]: string | undefined;
};

/**
 * Broker API request/response types
 */
export type BrokerAuthVerifyRequest = {
  token: string;
};

export type BrokerAuthVerifyResponse = {
  valid: boolean;
  agentId?: string;
  error?: string;
};

export type BrokerProxyRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
};

export type BrokerError = {
  error: string;
  code?: string;
  statusCode?: number;
};
