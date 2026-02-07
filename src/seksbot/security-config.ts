/**
 * Seksbot Security Configuration
 * 
 * This module provides the security hardening layer for seksbot.
 * It wraps OpenClaw's exec-approvals system with stricter defaults
 * and adds support for command templates.
 * 
 * @module seksbot/security-config
 */

import type { ExecSecurity, ExecAsk } from "../infra/exec-approvals.js";

// ============================================================================
// SEKSBOT SECURITY DEFAULTS
// ============================================================================

/**
 * Seksbot uses stricter defaults than OpenClaw:
 * - security: "deny" (was: varies by context)
 * - ask: "always" (was: "on-miss")
 * - No arbitrary shell commands by default
 */
export const SEKSBOT_SECURITY_DEFAULTS = {
  security: "deny" as ExecSecurity,
  ask: "always" as ExecAsk,
  askFallback: "deny" as ExecSecurity,
  autoAllowSkills: false,
};

// ============================================================================
// COMMAND TEMPLATES
// ============================================================================

/**
 * A command template defines a structured command pattern.
 * Like SQL prepared statements, templates separate structure from data.
 */
export type CommandTemplate = {
  /** Unique template identifier */
  id: string;
  
  /** Human-readable description */
  description: string;
  
  /** 
   * Command as argv array. Parameters use {name} syntax.
   * Example: ["git", "commit", "-m", "{message}"]
   */
  command: string[];
  
  /** Parameter definitions */
  params: Record<string, TemplateParam>;
  
  /** Security classification */
  classification: "safe" | "sensitive" | "dangerous";
  
  /** Whether this template can run without approval */
  autoApprove?: boolean;
  
  /** Optional credential requirements */
  credentials?: TemplateCredential[];
};

export type TemplateParam = {
  type: "string" | "number" | "boolean" | "url" | "path";
  description?: string;
  maxLength?: number;
  pattern?: string;
  allowlist?: string[];
  required?: boolean;
  default?: string | number | boolean;
};

export type TemplateCredential = {
  /** Credential name (maps to broker secret) */
  name: string;
  /** How the credential is injected */
  inject: "env" | "header" | "arg";
  /** Target (env var name, header name, or arg position) */
  target: string;
};

/**
 * Template invocation request from agent
 */
export type TemplateInvocation = {
  template: string;
  params: Record<string, string | number | boolean>;
};

// ============================================================================
// BUILT-IN TEMPLATES
// ============================================================================

/**
 * Built-in command templates that are safe by design.
 * These commands cannot be used for credential exfiltration.
 */
export const BUILTIN_TEMPLATES: CommandTemplate[] = [
  // Git operations (no credential exposure)
  {
    id: "git_status",
    description: "Show git repository status",
    command: ["git", "status"],
    params: {},
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "git_diff",
    description: "Show git diff",
    command: ["git", "diff"],
    params: {},
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "git_log",
    description: "Show git log",
    command: ["git", "log", "--oneline", "-n", "{count}"],
    params: {
      count: {
        type: "number",
        description: "Number of commits to show",
        default: 10,
      },
    },
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "git_commit",
    description: "Create a git commit",
    command: ["git", "commit", "-m", "{message}"],
    params: {
      message: {
        type: "string",
        description: "Commit message",
        maxLength: 500,
        required: true,
      },
    },
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "git_add",
    description: "Stage files for commit",
    command: ["git", "add", "{path}"],
    params: {
      path: {
        type: "path",
        description: "File or directory to stage",
        required: true,
      },
    },
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "git_push",
    description: "Push commits to remote",
    command: ["git", "push"],
    params: {},
    classification: "sensitive",
    autoApprove: false, // Requires approval - external action
  },

  // File operations (read-only safe)
  {
    id: "ls",
    description: "List directory contents",
    command: ["ls", "-la", "{path}"],
    params: {
      path: {
        type: "path",
        description: "Directory to list",
        default: ".",
      },
    },
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "cat",
    description: "Display file contents",
    command: ["cat", "{path}"],
    params: {
      path: {
        type: "path",
        description: "File to display",
        required: true,
      },
    },
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "head",
    description: "Display first lines of file",
    command: ["head", "-n", "{lines}", "{path}"],
    params: {
      lines: {
        type: "number",
        description: "Number of lines",
        default: 20,
      },
      path: {
        type: "path",
        description: "File to display",
        required: true,
      },
    },
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "tail",
    description: "Display last lines of file",
    command: ["tail", "-n", "{lines}", "{path}"],
    params: {
      lines: {
        type: "number",
        description: "Number of lines",
        default: 20,
      },
      path: {
        type: "path",
        description: "File to display",
        required: true,
      },
    },
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "wc",
    description: "Count lines/words/bytes",
    command: ["wc", "{path}"],
    params: {
      path: {
        type: "path",
        description: "File to count",
        required: true,
      },
    },
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "grep",
    description: "Search for pattern in file",
    command: ["grep", "{pattern}", "{path}"],
    params: {
      pattern: {
        type: "string",
        description: "Search pattern",
        required: true,
      },
      path: {
        type: "path",
        description: "File to search",
        required: true,
      },
    },
    classification: "safe",
    autoApprove: true,
  },
  {
    id: "find",
    description: "Find files by name",
    command: ["find", "{path}", "-name", "{pattern}"],
    params: {
      path: {
        type: "path",
        description: "Directory to search",
        default: ".",
      },
      pattern: {
        type: "string",
        description: "File name pattern",
        required: true,
      },
    },
    classification: "safe",
    autoApprove: true,
  },

  // npm operations
  {
    id: "npm_install",
    description: "Install npm dependencies",
    command: ["npm", "install"],
    params: {},
    classification: "sensitive",
    autoApprove: false, // Network + potential scripts
  },
  {
    id: "npm_run",
    description: "Run npm script",
    command: ["npm", "run", "{script}"],
    params: {
      script: {
        type: "string",
        description: "Script name from package.json",
        required: true,
      },
    },
    classification: "sensitive",
    autoApprove: false,
  },
  {
    id: "npm_test",
    description: "Run npm tests",
    command: ["npm", "test"],
    params: {},
    classification: "safe",
    autoApprove: true,
  },
];

// ============================================================================
// TEMPLATE REGISTRY
// ============================================================================

const templateRegistry = new Map<string, CommandTemplate>();

// Initialize with built-in templates
for (const template of BUILTIN_TEMPLATES) {
  templateRegistry.set(template.id, template);
}

/**
 * Get a command template by ID
 */
export function getTemplate(id: string): CommandTemplate | undefined {
  return templateRegistry.get(id);
}

/**
 * Register a custom command template
 */
export function registerTemplate(template: CommandTemplate): void {
  templateRegistry.set(template.id, template);
}

/**
 * List all registered templates
 */
export function listTemplates(): CommandTemplate[] {
  return Array.from(templateRegistry.values());
}

/**
 * Check if a template can auto-approve
 */
export function canAutoApprove(templateId: string): boolean {
  const template = templateRegistry.get(templateId);
  return template?.autoApprove === true && template?.classification === "safe";
}

// ============================================================================
// TEMPLATE EXECUTION
// ============================================================================

/**
 * Validate and build argv from template invocation
 */
export function buildTemplateArgv(
  invocation: TemplateInvocation,
): { ok: true; argv: string[] } | { ok: false; error: string } {
  const template = templateRegistry.get(invocation.template);
  if (!template) {
    return { ok: false, error: `Unknown template: ${invocation.template}` };
  }

  // Validate all required params are present
  for (const [name, param] of Object.entries(template.params)) {
    if (param.required && !(name in invocation.params)) {
      return { ok: false, error: `Missing required parameter: ${name}` };
    }
  }

  // Build argv with parameter substitution
  const argv: string[] = [];
  for (const part of template.command) {
    // Check for parameter placeholder
    const match = part.match(/^\{(\w+)\}$/);
    if (match) {
      const paramName = match[1];
      const paramDef = template.params[paramName];
      const value = invocation.params[paramName] ?? paramDef?.default;
      
      if (value === undefined) {
        // Skip optional params with no value
        continue;
      }

      // Validate parameter
      const validation = validateParam(paramName, value, paramDef);
      if (!validation.ok) {
        return validation;
      }

      argv.push(String(value));
    } else {
      // Literal command part
      argv.push(part);
    }
  }

  return { ok: true, argv };
}

function validateParam(
  name: string,
  value: unknown,
  def: TemplateParam | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!def) {
    return { ok: false, error: `Unknown parameter: ${name}` };
  }

  const strValue = String(value);

  // Type validation
  switch (def.type) {
    case "number":
      if (typeof value !== "number" && isNaN(Number(value))) {
        return { ok: false, error: `Parameter ${name} must be a number` };
      }
      break;
    case "boolean":
      if (typeof value !== "boolean" && value !== "true" && value !== "false") {
        return { ok: false, error: `Parameter ${name} must be a boolean` };
      }
      break;
    case "url":
      try {
        new URL(strValue);
      } catch {
        return { ok: false, error: `Parameter ${name} must be a valid URL` };
      }
      break;
    case "path":
      // Basic path validation - no shell metacharacters
      if (/[;&|`$(){}]/.test(strValue)) {
        return { ok: false, error: `Parameter ${name} contains invalid characters` };
      }
      break;
  }

  // Length validation
  if (def.maxLength && strValue.length > def.maxLength) {
    return { ok: false, error: `Parameter ${name} exceeds max length (${def.maxLength})` };
  }

  // Pattern validation
  if (def.pattern && !new RegExp(def.pattern).test(strValue)) {
    return { ok: false, error: `Parameter ${name} does not match required pattern` };
  }

  // Allowlist validation
  if (def.allowlist && !def.allowlist.includes(strValue)) {
    return { ok: false, error: `Parameter ${name} must be one of: ${def.allowlist.join(", ")}` };
  }

  return { ok: true };
}

// ============================================================================
// SECURITY POLICY
// ============================================================================

export type SecurityMode = "strict" | "moderate" | "permissive";

export type SecurityPolicy = {
  mode: SecurityMode;
  allowTemplates: boolean;
  allowArbitraryExec: boolean;
  requireApproval: "always" | "sensitive" | "never";
  defaultHost: "sandbox" | "gateway";
};

export const SECURITY_POLICIES: Record<SecurityMode, SecurityPolicy> = {
  strict: {
    mode: "strict",
    allowTemplates: true,
    allowArbitraryExec: false,
    requireApproval: "always",
    defaultHost: "sandbox",
  },
  moderate: {
    mode: "moderate",
    allowTemplates: true,
    allowArbitraryExec: true,
    requireApproval: "sensitive",
    defaultHost: "sandbox",
  },
  permissive: {
    mode: "permissive",
    allowTemplates: true,
    allowArbitraryExec: true,
    requireApproval: "never",
    defaultHost: "gateway",
  },
};

/**
 * Get the default security policy for seksbot
 */
export function getDefaultSecurityPolicy(): SecurityPolicy {
  return SECURITY_POLICIES.strict;
}
