/**
 * Seksbot - Secure Execution Kernel Shell Bot
 * 
 * A security-hardened fork of OpenClaw implementing the SEKS architecture.
 * 
 * Core principle: Like SQL prepared statements separate query structure
 * from data, Seksbot separates command structure from secrets.
 * 
 * @module seksbot
 */

// Re-export security configuration
export {
  // Types
  type CommandTemplate,
  type TemplateParam,
  type TemplateCredential,
  type TemplateInvocation,
  type SecurityMode,
  type SecurityPolicy,
  
  // Constants
  SEKSBOT_SECURITY_DEFAULTS,
  BUILTIN_TEMPLATES,
  SECURITY_POLICIES,
  
  // Functions
  getTemplate,
  registerTemplate,
  listTemplates,
  canAutoApprove,
  buildTemplateArgv,
  getDefaultSecurityPolicy,
} from "./security-config.js";

// Re-export credential broker
export {
  // Types
  type CredentialMarker,
  type CredentialDefinition,
  type CredentialInjection,
  type HttpRequestTemplate,
  type BrokerConfig,
  type SecureHttpRequest,
  type BrokerClient,
  
  // Functions
  createMarker,
  isMarker,
  parseMarker,
  registerForScrubbing,
  scrubOutput,
  clearScrubRegistry,
  validateHeaders,
  createBrokerClient,
  isUrlAllowed,
  
  // Constants
  DEFAULT_URL_ALLOWLIST,
} from "./credential-broker.js";

// ============================================================================
// VERSION INFO
// ============================================================================

export const SEKSBOT_VERSION = "0.1.0";

export const SEKSBOT_FEATURES = {
  credentialIsolation: true,
  commandTemplates: true,
  outputScrubbing: true,
  structuralSafety: true,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize seksbot security layer
 */
export function initializeSeksbot(options?: {
  securityMode?: "strict" | "moderate" | "permissive";
  brokerEndpoint?: string;
  brokerToken?: string;
}): void {
  const mode = options?.securityMode ?? "strict";
  
  console.log(`[seksbot] Initializing with security mode: ${mode}`);
  console.log(`[seksbot] Version: ${SEKSBOT_VERSION}`);
  console.log(`[seksbot] Features:`, SEKSBOT_FEATURES);
  
  // TODO: Apply security policy to exec layer
  // TODO: Initialize broker client if configured
}
