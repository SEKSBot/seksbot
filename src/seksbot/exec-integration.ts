/**
 * Seksbot Exec Integration
 * 
 * This module integrates the seksbot security layer with OpenClaw's exec tool.
 * It provides a security gateway that all exec requests must pass through.
 * 
 * @module seksbot/exec-integration
 */

import type { ExecSecurity, ExecAsk } from "../infra/exec-approvals.js";
import {
  type SecurityPolicy,
  type TemplateInvocation,
  getDefaultSecurityPolicy,
  SECURITY_POLICIES,
  buildTemplateArgv,
  getTemplate,
  listTemplates,
} from "./security-config.js";
import {
  type ExecRequest,
  type ExecResult,
  type SecureExecResult,
  classifyCommand,
  evaluateExecRequest,
  secureExec,
  executeTemplate,
} from "./exec-hardening.js";
import { scrubOutput } from "./credential-broker.js";

// ============================================================================
// GLOBAL STATE
// ============================================================================

let currentPolicy: SecurityPolicy = getDefaultSecurityPolicy();
let seksEnabled = false;

/**
 * Enable seksbot security layer
 */
export function enableSeksbot(mode?: "strict" | "moderate" | "permissive"): void {
  seksEnabled = true;
  currentPolicy = SECURITY_POLICIES[mode ?? "strict"];
  console.log(`[seksbot] Security layer enabled (mode: ${currentPolicy.mode})`);
}

/**
 * Disable seksbot security layer (reverts to OpenClaw defaults)
 */
export function disableSeksbot(): void {
  seksEnabled = false;
  console.log("[seksbot] Security layer disabled");
}

/**
 * Check if seksbot is enabled
 */
export function isSeksEnabled(): boolean {
  return seksEnabled;
}

/**
 * Get current security policy
 */
export function getCurrentPolicy(): SecurityPolicy {
  return currentPolicy;
}

// ============================================================================
// EXEC GATEWAY
// ============================================================================

export type ExecGatewayRequest = {
  /** Original command string */
  command: string;
  
  /** Working directory */
  cwd?: string;
  
  /** Environment variables */
  env?: Record<string, string>;
  
  /** Template invocation (for template mode) */
  template?: TemplateInvocation;
  
  /** Host type */
  host?: "sandbox" | "gateway" | "node";
  
  /** Agent ID */
  agentId?: string;
};

export type ExecGatewayResult = {
  /** Whether to proceed with execution */
  proceed: boolean;
  
  /** Execution mode determined */
  mode: "template" | "allowlist" | "passthrough" | "denied";
  
  /** Denial reason if not proceeding */
  reason?: string;
  
  /** Transformed argv for direct execution (if template mode) */
  argv?: string[];
  
  /** Whether approval is needed */
  requiresApproval?: boolean;
  
  /** Original request (possibly modified) */
  request: ExecGatewayRequest;
};

/**
 * Process an exec request through the seksbot security gateway.
 * 
 * This is the main entry point - all exec requests should pass through here
 * before reaching the actual exec implementation.
 */
export function processExecRequest(request: ExecGatewayRequest): ExecGatewayResult {
  // If seksbot is disabled, pass through to OpenClaw
  if (!seksEnabled) {
    return {
      proceed: true,
      mode: "passthrough",
      request,
    };
  }
  
  // Sandbox mode bypasses seksbot checks (isolated environment)
  if (request.host === "sandbox") {
    return {
      proceed: true,
      mode: "passthrough",
      request,
    };
  }
  
  // Template mode: validate and build argv
  if (request.template) {
    const evalResult = evaluateExecRequest({
      command: request.command,
      mode: "template",
      template: request.template,
      cwd: request.cwd,
      env: request.env,
      agentId: request.agentId,
      sandboxed: false,
    }, currentPolicy);
    
    if (!evalResult.allowed) {
      return {
        proceed: false,
        mode: "denied",
        reason: evalResult.reason ?? "Template execution denied",
        requiresApproval: evalResult.requiresApproval,
        request,
      };
    }
    
    return {
      proceed: true,
      mode: "template",
      argv: evalResult.argv,
      requiresApproval: evalResult.requiresApproval,
      request,
    };
  }
  
  // Arbitrary command mode
  const classification = classifyCommand(request.command);
  
  // Strict mode: deny arbitrary commands entirely
  if (currentPolicy.mode === "strict" && !currentPolicy.allowArbitraryExec) {
    const template = suggestTemplate(request.command);
    const suggestion = template 
      ? `Consider using template "${template}" instead.`
      : "Use a predefined template for this operation.";
    
    return {
      proceed: false,
      mode: "denied",
      reason: `Arbitrary exec is disabled in strict mode. ${suggestion}`,
      request,
    };
  }
  
  // Classify and evaluate
  const evalResult = evaluateExecRequest({
    command: request.command,
    mode: "arbitrary",
    cwd: request.cwd,
    env: request.env,
    agentId: request.agentId,
    sandboxed: false,
  }, currentPolicy);
  
  if (!evalResult.allowed) {
    return {
      proceed: false,
      mode: "denied",
      reason: evalResult.reason ?? `Command classified as ${classification}`,
      requiresApproval: evalResult.requiresApproval,
      request,
    };
  }
  
  return {
    proceed: true,
    mode: "allowlist",
    requiresApproval: evalResult.requiresApproval,
    request,
  };
}

/**
 * Suggest a template for a given command
 */
function suggestTemplate(command: string): string | null {
  const cmd = command.trim().toLowerCase();
  const templates = listTemplates();
  
  // Simple prefix matching
  for (const template of templates) {
    const templateCmd = template.command[0]?.toLowerCase();
    if (templateCmd && cmd.startsWith(templateCmd)) {
      return template.id;
    }
  }
  
  // Git commands
  if (cmd.startsWith("git ")) {
    if (cmd.includes("status")) return "git_status";
    if (cmd.includes("diff")) return "git_diff";
    if (cmd.includes("log")) return "git_log";
    if (cmd.includes("commit")) return "git_commit";
    if (cmd.includes("add")) return "git_add";
    if (cmd.includes("push")) return "git_push";
  }
  
  // File commands
  if (cmd.startsWith("ls ")) return "ls";
  if (cmd.startsWith("cat ")) return "cat";
  if (cmd.startsWith("head ")) return "head";
  if (cmd.startsWith("tail ")) return "tail";
  if (cmd.startsWith("grep ")) return "grep";
  if (cmd.startsWith("find ")) return "find";
  if (cmd.startsWith("wc ")) return "wc";
  
  // npm commands
  if (cmd.startsWith("npm install")) return "npm_install";
  if (cmd.startsWith("npm run ")) return "npm_run";
  if (cmd.startsWith("npm test")) return "npm_test";
  
  return null;
}

// ============================================================================
// SECURE EXEC WRAPPER
// ============================================================================

export type SecureExecWrapperOptions = {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  host?: "sandbox" | "gateway" | "node";
  agentId?: string;
};

/**
 * Execute a command through the seksbot security layer.
 * 
 * This wraps secureExec with additional policy checks.
 */
export async function secureExecWrapper(
  command: string,
  options?: SecureExecWrapperOptions,
): Promise<SecureExecResult & { gatewayResult: ExecGatewayResult }> {
  const gatewayResult = processExecRequest({
    command,
    cwd: options?.cwd,
    env: options?.env,
    host: options?.host,
    agentId: options?.agentId,
  });
  
  if (!gatewayResult.proceed) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: gatewayResult.reason ?? "Execution denied by security policy",
      timedOut: false,
      gatewayResult,
    };
  }
  
  // If template mode with pre-built argv, use it
  if (gatewayResult.mode === "template" && gatewayResult.argv) {
    const result = await secureExec(gatewayResult.argv, {
      cwd: options?.cwd,
      env: options?.env,
      timeoutMs: options?.timeoutMs,
    });
    return { ...result, gatewayResult };
  }
  
  // Parse command into argv for secure execution
  // Note: This is a simple split - real implementation would use proper parsing
  const argv = parseCommandToArgv(command);
  
  const result = await secureExec(argv, {
    cwd: options?.cwd,
    env: options?.env,
    timeoutMs: options?.timeoutMs,
  });
  
  return { ...result, gatewayResult };
}

/**
 * Execute a template through the seksbot security layer.
 */
export async function secureTemplateExec(
  invocation: TemplateInvocation,
  options?: SecureExecWrapperOptions,
): Promise<SecureExecResult & { gatewayResult: ExecGatewayResult }> {
  const gatewayResult = processExecRequest({
    command: `template:${invocation.template}`,
    template: invocation,
    cwd: options?.cwd,
    env: options?.env,
    host: options?.host,
    agentId: options?.agentId,
  });
  
  if (!gatewayResult.proceed) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: gatewayResult.reason ?? "Template execution denied",
      timedOut: false,
      gatewayResult,
    };
  }
  
  const result = await executeTemplate(invocation, {
    cwd: options?.cwd,
    env: options?.env,
    timeoutMs: options?.timeoutMs,
  });
  
  return { ...result, gatewayResult };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse a command string into argv array.
 * 
 * This handles basic quoting but not all shell syntax.
 * For complex commands, templates should be used instead.
 */
function parseCommandToArgv(command: string): string[] {
  const argv: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;
  
  for (const char of command) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }
    
    if (char === "\\") {
      escape = true;
      continue;
    }
    
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    
    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        argv.push(current);
        current = "";
      }
      continue;
    }
    
    current += char;
  }
  
  if (current) {
    argv.push(current);
  }
  
  return argv;
}

/**
 * Format a template suggestion message
 */
export function formatTemplateSuggestion(command: string): string | null {
  const templateId = suggestTemplate(command);
  if (!templateId) return null;
  
  const template = getTemplate(templateId);
  if (!template) return null;
  
  const params = Object.entries(template.params)
    .map(([name, def]) => `${name}: ${def.type}${def.required ? " (required)" : ""}`)
    .join(", ");
  
  return `Instead of: ${command}
Use template: ${templateId}
Parameters: ${params || "none"}
Description: ${template.description}`;
}

// ============================================================================
// INTEGRATION HOOKS
// ============================================================================

/**
 * Hook to be called before exec in bash-tools.exec.ts
 * Returns null if execution should proceed, error message if denied
 */
export function beforeExec(request: ExecGatewayRequest): string | null {
  if (!seksEnabled) {
    return null; // Proceed with OpenClaw default behavior
  }
  
  const result = processExecRequest(request);
  
  if (!result.proceed) {
    return result.reason ?? "Execution denied by seksbot security policy";
  }
  
  return null; // Proceed
}

/**
 * Hook to be called after exec output is captured
 * Scrubs any leaked credentials
 */
export function afterExec(output: string): string {
  if (!seksEnabled) {
    return output;
  }
  
  return scrubOutput(output);
}
