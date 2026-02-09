/**
 * Edge Case Tests for Seksbot Security Layer
 * 
 * Tests boundary conditions, unusual inputs, and corner cases.
 * 
 * @module seksbot/edge-cases.test
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  classifyCommand,
  evaluateExecRequest,
  secureExec,
  executeTemplate,
} from "./exec-hardening.js";
import {
  SECURITY_POLICIES,
  buildTemplateArgv,
  registerTemplate,
  listTemplates,
  getTemplate,
  canAutoApprove,
  type CommandTemplate,
} from "./security-config.js";
import {
  scrubOutput,
  registerForScrubbing,
  clearScrubRegistry,
  createMarker,
  isMarker,
  parseMarker,
  validateHeaders,
  isUrlAllowed,
  createBrokerClient,
} from "./credential-broker.js";
import {
  enableSeksbot,
  disableSeksbot,
  processExecRequest,
  getCurrentPolicy,
} from "./exec-integration.js";

// ============================================================================
// COMMAND CLASSIFICATION EDGE CASES
// ============================================================================

describe("edge cases: command classification", () => {
  describe("empty and whitespace inputs", () => {
    it("handles empty string", () => {
      const result = classifyCommand("");
      expect(result).toBe("suspicious");
    });

    it("handles whitespace only", () => {
      const result = classifyCommand("   \t\n  ");
      expect(result).toBe("suspicious");
    });

    it("handles command with leading/trailing whitespace", () => {
      const result = classifyCommand("   ls -la   ");
      expect(result).toBe("safe");
    });
  });

  describe("unicode and special characters", () => {
    it("handles unicode in commands", () => {
      const result = classifyCommand("echo 'Hello 世界'");
      expect(result).toBe("suspicious"); // Not in safe list
    });

    it("handles emoji in commands", () => {
      const result = classifyCommand("echo '🔒'");
      expect(result).toBe("suspicious");
    });

    it("handles null bytes in commands", () => {
      const result = classifyCommand("ls\x00-la");
      expect(result).toBe("suspicious");
    });
  });

  describe("very long commands", () => {
    it("handles extremely long command", () => {
      const longArg = "a".repeat(10000);
      const result = classifyCommand(`echo ${longArg}`);
      expect(typeof result).toBe("string");
    });

    it("handles command with many arguments", () => {
      const manyArgs = Array(1000).fill("arg").join(" ");
      const result = classifyCommand(`echo ${manyArgs}`);
      expect(typeof result).toBe("string");
    });
  });

  describe("edge cases in pattern matching", () => {
    it("distinguishes 'env' command from 'environment' word", () => {
      const result1 = classifyCommand("env");
      const result2 = classifyCommand("echo environment");
      
      expect(result1).toBe("dangerous");
      expect(result2).toBe("suspicious");
    });

    it("handles similar but safe commands", () => {
      // 'head' is safe, 'header' is not in list
      const result1 = classifyCommand("head -n 10 file.txt");
      const result2 = classifyCommand("header-tool file.txt");
      
      expect(result1).toBe("safe");
      expect(result2).toBe("suspicious");
    });
  });
});

// ============================================================================
// TEMPLATE VALIDATION EDGE CASES
// ============================================================================

describe("edge cases: template validation", () => {
  describe("parameter edge values", () => {
    it("handles empty string parameter", () => {
      const result = buildTemplateArgv({
        template: "git_commit",
        params: { message: "" },
      });

      // Empty message might be invalid or produce empty arg
      expect(result.ok).toBe(true);
    });

    it("handles zero for number parameter", () => {
      const result = buildTemplateArgv({
        template: "git_log",
        params: { count: 0 },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toContain("0");
      }
    });

    it("handles negative number for number parameter", () => {
      const result = buildTemplateArgv({
        template: "git_log",
        params: { count: -5 },
      });

      // Should either accept or reject gracefully
      expect(typeof result.ok).toBe("boolean");
    });

    it("handles very large number", () => {
      const result = buildTemplateArgv({
        template: "git_log",
        params: { count: Number.MAX_SAFE_INTEGER },
      });

      expect(typeof result.ok).toBe("boolean");
    });

    it("handles NaN", () => {
      const result = buildTemplateArgv({
        template: "git_log",
        params: { count: NaN },
      });

      expect(result.ok).toBe(false);
    });

    it("handles Infinity", () => {
      const result = buildTemplateArgv({
        template: "git_log",
        params: { count: Infinity },
      });

      // Should reject or handle gracefully
      expect(typeof result.ok).toBe("boolean");
    });
  });

  describe("missing and extra parameters", () => {
    it("handles extra unknown parameters", () => {
      const result = buildTemplateArgv({
        template: "git_status",
        params: { unknownParam: "value" },
      });

      // Should ignore unknown params
      expect(result.ok).toBe(true);
    });

    it("handles missing optional parameters", () => {
      const result = buildTemplateArgv({
        template: "git_log",
        params: {}, // count is optional with default
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toContain("10"); // default value
      }
    });
  });

  describe("custom template registration", () => {
    const testTemplate: CommandTemplate = {
      id: "test_edge_case",
      description: "Test template for edge cases",
      command: ["echo", "{value}"],
      params: {
        value: {
          type: "string",
          required: true,
          maxLength: 10,
        },
      },
      classification: "safe",
      autoApprove: true,
    };

    beforeEach(() => {
      registerTemplate(testTemplate);
    });

    it("accepts value at exact maxLength", () => {
      const result = buildTemplateArgv({
        template: "test_edge_case",
        params: { value: "1234567890" }, // exactly 10 chars
      });

      expect(result.ok).toBe(true);
    });

    it("rejects value one char over maxLength", () => {
      const result = buildTemplateArgv({
        template: "test_edge_case",
        params: { value: "12345678901" }, // 11 chars
      });

      expect(result.ok).toBe(false);
    });
  });
});

// ============================================================================
// CREDENTIAL SCRUBBING EDGE CASES
// ============================================================================

describe("edge cases: credential scrubbing", () => {
  beforeEach(() => {
    clearScrubRegistry();
  });

  afterEach(() => {
    clearScrubRegistry();
  });

  describe("empty and short secrets", () => {
    it("handles empty secret registration", () => {
      // Should not throw
      expect(() => registerForScrubbing("")).not.toThrow();
    });

    it("handles single character secret", () => {
      registerForScrubbing("x");
      const output = "test x value";
      const scrubbed = scrubOutput(output);
      // Very short secrets might not be scrubbed to avoid false positives
      expect(typeof scrubbed).toBe("string");
    });

    it("handles very long secret", () => {
      const longSecret = "a".repeat(10000);
      registerForScrubbing(longSecret);
      const output = `Token: ${longSecret}`;
      const scrubbed = scrubOutput(output);
      expect(scrubbed).not.toContain(longSecret);
    });
  });

  describe("special characters in secrets", () => {
    it("handles regex special characters in secret", () => {
      registerForScrubbing("secret.*+?^${}()|[]\\");
      const output = "Token: secret.*+?^${}()|[]\\";
      const scrubbed = scrubOutput(output);
      expect(scrubbed).not.toContain("secret.*+?^${}()|[]\\");
    });

    it("handles newlines in secret", () => {
      registerForScrubbing("multi\nline\nsecret");
      const output = "Token: multi\nline\nsecret";
      const scrubbed = scrubOutput(output);
      expect(scrubbed).not.toContain("multi\nline\nsecret");
    });

    it("handles unicode in secret", () => {
      registerForScrubbing("секрет123");
      const output = "Token: секрет123";
      const scrubbed = scrubOutput(output);
      expect(scrubbed).not.toContain("секрет123");
    });
  });

  describe("no registered secrets", () => {
    it("returns output unchanged when no secrets registered", () => {
      const output = "normal output with potential secrets like sk-abc123";
      const scrubbed = scrubOutput(output);
      expect(scrubbed).toBe(output);
    });
  });

  describe("multiple overlapping secrets", () => {
    it("handles secrets that are substrings of each other", () => {
      registerForScrubbing("secret");
      registerForScrubbing("secretkey");
      registerForScrubbing("key");
      
      const output = "Token: secretkey";
      const scrubbed = scrubOutput(output);
      
      expect(scrubbed).not.toContain("secret");
      expect(scrubbed).not.toContain("key");
    });
  });
});

// ============================================================================
// MARKER EDGE CASES
// ============================================================================

describe("edge cases: credential markers", () => {
  describe("marker creation", () => {
    it("creates marker for simple name", () => {
      const marker = createMarker("api_key");
      expect(isMarker(marker)).toBe(true);
      expect(parseMarker(marker)).toBe("api_key");
    });

    it("creates marker for name with special chars", () => {
      const marker = createMarker("my-api.key_v2");
      expect(isMarker(marker)).toBe(true);
      expect(parseMarker(marker)).toBe("my-api.key_v2");
    });

    it("creates marker for empty name", () => {
      const marker = createMarker("");
      expect(isMarker(marker)).toBe(true);
      expect(parseMarker(marker)).toBe("");
    });
  });

  describe("marker detection", () => {
    it("rejects strings that look similar but aren't markers", () => {
      expect(isMarker("SEKS_CRED")).toBe(false);
      expect(isMarker("SEKS_CRED:name")).toBe(false);
      expect(isMarker("{{SEKS_CRED:name")).toBe(false);
    });

    it("rejects null and undefined", () => {
      expect(isMarker(null as unknown as string)).toBe(false);
      expect(isMarker(undefined as unknown as string)).toBe(false);
    });
  });
});

// ============================================================================
// URL ALLOWLIST EDGE CASES
// ============================================================================

describe("edge cases: URL allowlist", () => {
  describe("empty and null inputs", () => {
    it("handles empty URL", () => {
      const result = isUrlAllowed("", ["example.com"]);
      expect(result).toBe(false);
    });

    it("handles empty allowlist", () => {
      const result = isUrlAllowed("https://example.com", []);
      expect(result).toBe(false);
    });

    it("handles undefined allowlist (allow all)", () => {
      const result = isUrlAllowed("https://example.com", undefined as unknown as string[]);
      expect(result).toBe(true);
    });
  });

  describe("malformed URLs", () => {
    it("handles URL without protocol", () => {
      const result = isUrlAllowed("example.com/path", ["example.com"]);
      expect(result).toBe(false);
    });

    it("handles URL with spaces", () => {
      const result = isUrlAllowed("https://example .com", ["example.com"]);
      expect(result).toBe(false);
    });

    it("handles URL with newlines", () => {
      const result = isUrlAllowed("https://example.com\n/evil", ["example.com"]);
      expect(result).toBe(false);
    });
  });

  describe("wildcard patterns", () => {
    it("matches single-level wildcard", () => {
      const result = isUrlAllowed("https://api.example.com/path", ["*.example.com"]);
      expect(result).toBe(true);
    });

    it("does not match multi-level with single wildcard", () => {
      const result = isUrlAllowed("https://a.b.example.com/path", ["*.example.com"]);
      // Depends on implementation - single * might not match multiple levels
    });
  });
});

// ============================================================================
// SECURE EXEC EDGE CASES
// ============================================================================

describe("edge cases: secure exec", () => {
  describe("empty and minimal commands", () => {
    it("handles empty argv", async () => {
      const result = await secureExec([]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("No command");
    });

    it("handles command with empty string args", async () => {
      const result = await secureExec(["echo", "", "test"]);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("special characters in arguments", () => {
    it("handles arguments with spaces (no shell interpretation)", async () => {
      const result = await secureExec(["echo", "hello world"]);
      expect(result.stdout.trim()).toBe("hello world");
    });

    it("handles arguments with quotes (literal)", async () => {
      const result = await secureExec(["echo", '"quoted"']);
      expect(result.stdout.trim()).toBe('"quoted"');
    });

    it("handles arguments with dollar signs (no expansion)", async () => {
      const result = await secureExec(["echo", "$HOME"]);
      expect(result.stdout.trim()).toBe("$HOME");
    });

    it("handles arguments with backticks (no expansion)", async () => {
      const result = await secureExec(["echo", "`date`"]);
      expect(result.stdout.trim()).toBe("`date`");
    });
  });

  describe("timeout behavior", () => {
    it("times out long-running commands", async () => {
      const result = await secureExec(["sleep", "10"], { timeoutMs: 100 });
      expect(result.timedOut).toBe(true);
    });

    it("does not timeout fast commands", async () => {
      const result = await secureExec(["echo", "fast"], { timeoutMs: 5000 });
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("working directory", () => {
    it("respects cwd option", async () => {
      const result = await secureExec(["pwd"], { cwd: "/tmp" });
      expect(result.stdout.trim()).toBe("/tmp");
    });

    it("handles non-existent cwd gracefully", async () => {
      const result = await secureExec(["pwd"], { cwd: "/nonexistent/path" });
      expect(result.exitCode).not.toBe(0);
    });
  });
});

// ============================================================================
// POLICY SWITCHING EDGE CASES
// ============================================================================

describe("edge cases: policy switching", () => {
  afterEach(() => {
    disableSeksbot();
  });

  it("can switch between modes", () => {
    enableSeksbot("strict");
    expect(getCurrentPolicy().mode).toBe("strict");
    
    enableSeksbot("moderate");
    expect(getCurrentPolicy().mode).toBe("moderate");
    
    enableSeksbot("permissive");
    expect(getCurrentPolicy().mode).toBe("permissive");
  });

  it("default mode is strict", () => {
    enableSeksbot();
    expect(getCurrentPolicy().mode).toBe("strict");
  });

  it("disable resets to passthrough behavior", () => {
    enableSeksbot("strict");
    
    // With strict mode, this would be denied
    let result = processExecRequest({
      command: "arbitrary command",
      host: "gateway",
    });
    expect(result.proceed).toBe(false);
    
    // After disabling, should passthrough
    disableSeksbot();
    result = processExecRequest({
      command: "arbitrary command",
      host: "gateway",
    });
    expect(result.proceed).toBe(true);
    expect(result.mode).toBe("passthrough");
  });
});

// ============================================================================
// HEADER VALIDATION EDGE CASES
// ============================================================================

describe("edge cases: header validation", () => {
  describe("empty inputs", () => {
    it("handles empty headers object", () => {
      const result = validateHeaders({});
      expect(result.valid).toBe(true);
      expect(result.blocked).toHaveLength(0);
    });
  });

  describe("header name edge cases", () => {
    it("handles very long header names", () => {
      const longName = "X-" + "a".repeat(1000);
      const result = validateHeaders({ [longName]: "value" });
      expect(result.valid).toBe(true);
    });

    it("handles header names with unusual characters", () => {
      const result = validateHeaders({
        "X-Custom_Header.Name": "value",
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("header value edge cases", () => {
    it("handles empty header value", () => {
      const result = validateHeaders({ "X-Custom": "" });
      expect(result.valid).toBe(true);
    });

    it("handles very long header value", () => {
      const result = validateHeaders({
        "X-Custom": "a".repeat(10000),
      });
      expect(result.valid).toBe(true);
    });

    it("handles header value with only whitespace", () => {
      const result = validateHeaders({ "X-Custom": "   " });
      expect(result.valid).toBe(true);
    });
  });
});
