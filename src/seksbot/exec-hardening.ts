/**
 * Seksbot Exec Hardening
 * 
 * This module integrates the seksbot security layer with OpenClaw's exec tool.
 * It intercepts exec requests and applies security policies.
 * 
 * @module seksbot/exec-hardening
 */

import { spawn } from "node:child_process";
import type { ExecSecurity, ExecAsk } from "../infra/exec-approvals.js";
import {
  SEKSBOT_SECURITY_DEFAULTS,
  getTemplate,
  buildTemplateArgv,
  canAutoApprove,
  getDefaultSecurityPolicy,
  type TemplateInvocation,
  type SecurityPolicy,
} from "./security-config.js";
import { scrubOutput, registerForScrubbing } from "./credential-broker.js";

// ============================================================================
// TYPES
// ============================================================================

export type ExecMode = "template" | "allowlist" | "arbitrary";

export type ExecRequest = {
  /** Original command string */
  command: string;
  
  /** Working directory */
  cwd?: string;
  
  /** Environment variables (auth vars blocked) */
  env?: Record<string, string>;
  
  /** Execution mode */
  mode?: ExecMode;
  
  /** Template invocation (if mode=template) */
  template?: TemplateInvocation;
  
  /** Agent ID making the request */
  agentId?: string;
  
  /** Whether running in sandbox */
  sandboxed?: boolean;
};

export type ExecResult = {
  allowed: boolean;
  mode: ExecMode;
  reason?: string;
  argv?: string[];
  requiresApproval?: boolean;
  approvalId?: string;
};

// ============================================================================
// COMMAND CLASSIFICATION
// ============================================================================

/**
 * Patterns that indicate potentially dangerous commands
 */
const DANGEROUS_PATTERNS = [
  // Network exfiltration
  /\bcurl\b.*(-d|--data|--upload)/i,
  /\bwget\b.*--post/i,
  /\bnc\b|\bnetcat\b/i,
  
  // Environment/credential exposure
  /\benv\b|\bprintenv\b/,
  /\becho\s+\$\w+/,
  /\bcat\b.*\.env/,
  /\bcat\b.*(credentials|secrets|password|token|key)/i,
  
  // System modification
  /\brm\s+-rf\s+\//,
  /\bchmod\s+777\b/,
  /\bchown\b.*root/,
  
  // Code execution
  /\beval\b/,
  /\bsh\s+-c\b/,
  /\bbash\s+-c\b/,
  /`[^`]+`/,  // Command substitution
  /\$\([^)]+\)/,  // Command substitution
];

/**
 * Patterns that indicate safe read-only commands
 */
const SAFE_PATTERNS = [
  /^ls\b/,
  /^cat\s+[^|;&]+$/,
  /^head\b/,
  /^tail\b/,
  /^grep\s+[^|;&]+$/,
  /^find\s+[^|;&]+$/,
  /^wc\b/,
  /^git\s+(status|log|diff|branch)\b/,
  /^pwd\b/,
  /^echo\s+"[^"$`]*"$/,  // Literal echo only
];

export type CommandClassification = "safe" | "suspicious" | "dangerous";

/**
 * Classify a command based on its content
 */
export function classifyCommand(command: string): CommandClassification {
  const trimmed = command.trim();
  
  // Check dangerous patterns first
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "dangerous";
    }
  }
  
  // Check safe patterns
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "safe";
    }
  }
  
  // Default to suspicious
  return "suspicious";
}

// ============================================================================
// EXEC POLICY ENFORCEMENT
// ============================================================================

/**
 * Check if an exec request should be allowed
 */
export function evaluateExecRequest(
  request: ExecRequest,
  policy?: SecurityPolicy,
): ExecResult {
  const effectivePolicy = policy ?? getDefaultSecurityPolicy();
  
  // Template mode: validate and build argv
  if (request.mode === "template" && request.template) {
    return evaluateTemplateRequest(request.template, effectivePolicy);
  }
  
  // Arbitrary exec mode
  if (!effectivePolicy.allowArbitraryExec) {
    return {
      allowed: false,
      mode: "arbitrary",
      reason: "Arbitrary exec is disabled in strict security mode. Use templates instead.",
    };
  }
  
  // Classify the command
  const classification = classifyCommand(request.command);
  
  if (classification === "dangerous") {
    return {
      allowed: false,
      mode: "arbitrary",
      reason: "Command classified as dangerous",
      requiresApproval: true,
    };
  }
  
  if (classification === "suspicious") {
    const needsApproval = effectivePolicy.requireApproval !== "never";
    return {
      allowed: !needsApproval,
      mode: "arbitrary",
      requiresApproval: needsApproval,
      reason: needsApproval ? "Command requires approval" : undefined,
    };
  }
  
  // Safe command
  return {
    allowed: true,
    mode: "arbitrary",
  };
}

function evaluateTemplateRequest(
  invocation: TemplateInvocation,
  policy: SecurityPolicy,
): ExecResult {
  if (!policy.allowTemplates) {
    return {
      allowed: false,
      mode: "template",
      reason: "Templates are disabled",
    };
  }
  
  const template = getTemplate(invocation.template);
  if (!template) {
    return {
      allowed: false,
      mode: "template",
      reason: `Unknown template: ${invocation.template}`,
    };
  }
  
  // Build the argv
  const result = buildTemplateArgv(invocation);
  if (!result.ok) {
    return {
      allowed: false,
      mode: "template",
      reason: result.error,
    };
  }
  
  // Check if approval is needed
  const autoApprove = canAutoApprove(invocation.template);
  const needsApproval =
    policy.requireApproval === "always" ||
    (policy.requireApproval === "sensitive" && !autoApprove);
  
  return {
    allowed: !needsApproval || autoApprove,
    mode: "template",
    argv: result.argv,
    requiresApproval: needsApproval && !autoApprove,
  };
}

// ============================================================================
// SECURE EXEC WRAPPER
// ============================================================================

export type SecureExecOptions = {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  scrubSecrets?: boolean;
};

export type SecureExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

/**
 * Execute a command with security hardening
 * 
 * This is the main entry point for secure command execution:
 * 1. Validates the command/template
 * 2. Runs via execve (no shell parsing)
 * 3. Scrubs output for leaked secrets
 */
export async function secureExec(
  argv: string[],
  options?: SecureExecOptions,
): Promise<SecureExecResult> {
  if (argv.length === 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "No command provided",
      timedOut: false,
    };
  }
  
  const [command, ...args] = argv;
  
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    
    // Prepare environment - strip sensitive vars
    const env = sanitizeEnv(options?.env ?? process.env);
    
    // Spawn directly (no shell)
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env,
      shell: false,  // Critical: no shell parsing
    });
    
    // Set timeout if specified
    if (options?.timeoutMs) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);
    }
    
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    child.on("close", (code) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      
      // Scrub output if enabled
      if (options?.scrubSecrets !== false) {
        stdout = scrubOutput(stdout);
        stderr = scrubOutput(stderr);
      }
      
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        timedOut,
      });
    });
    
    child.on("error", (err) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      
      resolve({
        exitCode: 1,
        stdout: "",
        stderr: err.message,
        timedOut: false,
      });
    });
  });
}

/**
 * Sanitize environment variables for subprocess
 */
function sanitizeEnv(env: NodeJS.ProcessEnv | Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  
  const SENSITIVE_VARS = new Set([
    // Common API keys
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GITHUB_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    
    // Database credentials
    "DATABASE_URL",
    "DATABASE_PASSWORD",
    "POSTGRES_PASSWORD",
    "MYSQL_PASSWORD",
    
    // Generic secrets
    "SECRET_KEY",
    "API_KEY",
    "API_SECRET",
    "AUTH_TOKEN",
    "ACCESS_TOKEN",
    "PRIVATE_KEY",
  ]);
  
  const SENSITIVE_PATTERNS = [
    /_KEY$/,
    /_SECRET$/,
    /_TOKEN$/,
    /_PASSWORD$/,
    /^SECRET_/,
    /^API_/,
    /^AUTH_/,
  ];
  
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    
    // Skip known sensitive vars
    if (SENSITIVE_VARS.has(key)) {
      continue;
    }
    
    // Skip vars matching sensitive patterns
    const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(key));
    if (isSensitive) {
      continue;
    }
    
    result[key] = value;
  }
  
  return result;
}

// ============================================================================
// TEMPLATE EXECUTOR
// ============================================================================

/**
 * Execute a command template
 */
export async function executeTemplate(
  invocation: TemplateInvocation,
  options?: SecureExecOptions,
): Promise<SecureExecResult> {
  const result = buildTemplateArgv(invocation);
  
  if (!result.ok) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: result.error,
      timedOut: false,
    };
  }
  
  return secureExec(result.argv, options);
}
