import { describe, expect, it } from "vitest";
import {
  SEKSBOT_SECURITY_DEFAULTS,
  BUILTIN_TEMPLATES,
  getTemplate,
  registerTemplate,
  listTemplates,
  canAutoApprove,
  buildTemplateArgv,
  getDefaultSecurityPolicy,
  type CommandTemplate,
} from "./security-config.js";

describe("security-config", () => {
  describe("SEKSBOT_SECURITY_DEFAULTS", () => {
    it("defaults to deny security mode", () => {
      expect(SEKSBOT_SECURITY_DEFAULTS.security).toBe("deny");
    });

    it("defaults to always ask", () => {
      expect(SEKSBOT_SECURITY_DEFAULTS.ask).toBe("always");
    });

    it("disables auto-allow skills by default", () => {
      expect(SEKSBOT_SECURITY_DEFAULTS.autoAllowSkills).toBe(false);
    });
  });

  describe("BUILTIN_TEMPLATES", () => {
    it("includes basic git commands", () => {
      const gitTemplates = BUILTIN_TEMPLATES.filter((t) => t.id.startsWith("git_"));
      expect(gitTemplates.length).toBeGreaterThan(0);
    });

    it("marks safe templates as auto-approve", () => {
      const safeTemplates = BUILTIN_TEMPLATES.filter(
        (t) => t.classification === "safe" && t.autoApprove,
      );
      expect(safeTemplates.length).toBeGreaterThan(0);
    });

    it("marks sensitive templates as requiring approval", () => {
      const sensitiveTemplates = BUILTIN_TEMPLATES.filter(
        (t) => t.classification === "sensitive" && !t.autoApprove,
      );
      expect(sensitiveTemplates.length).toBeGreaterThan(0);
    });
  });

  describe("getTemplate", () => {
    it("returns builtin templates", () => {
      const template = getTemplate("git_status");
      expect(template).toBeDefined();
      expect(template?.id).toBe("git_status");
    });

    it("returns undefined for unknown templates", () => {
      const template = getTemplate("nonexistent");
      expect(template).toBeUndefined();
    });
  });

  describe("registerTemplate", () => {
    it("registers custom templates", () => {
      const custom: CommandTemplate = {
        id: "custom_test",
        description: "Test template",
        command: ["echo", "{message}"],
        params: {
          message: { type: "string", required: true },
        },
        classification: "safe",
        autoApprove: true,
      };

      registerTemplate(custom);
      const retrieved = getTemplate("custom_test");
      expect(retrieved).toEqual(custom);
    });
  });

  describe("listTemplates", () => {
    it("returns all registered templates", () => {
      const templates = listTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some((t) => t.id === "git_status")).toBe(true);
    });
  });

  describe("canAutoApprove", () => {
    it("returns true for safe auto-approve templates", () => {
      expect(canAutoApprove("git_status")).toBe(true);
    });

    it("returns false for sensitive templates", () => {
      expect(canAutoApprove("git_push")).toBe(false);
    });

    it("returns false for unknown templates", () => {
      expect(canAutoApprove("nonexistent")).toBe(false);
    });
  });

  describe("buildTemplateArgv", () => {
    it("builds simple command with no params", () => {
      const result = buildTemplateArgv({
        template: "git_status",
        params: {},
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toEqual(["git", "status"]);
      }
    });

    it("substitutes parameters correctly", () => {
      const result = buildTemplateArgv({
        template: "git_commit",
        params: { message: "test commit" },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toEqual(["git", "commit", "-m", "test commit"]);
      }
    });

    it("uses default parameter values", () => {
      const result = buildTemplateArgv({
        template: "git_log",
        params: {},
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.argv).toEqual(["git", "log", "--oneline", "-n", "10"]);
      }
    });

    it("fails for missing required parameters", () => {
      const result = buildTemplateArgv({
        template: "git_commit",
        params: {},
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Missing required parameter");
      }
    });

    it("fails for unknown templates", () => {
      const result = buildTemplateArgv({
        template: "nonexistent",
        params: {},
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unknown template");
      }
    });

    it("validates maxLength constraint", () => {
      const longMessage = "x".repeat(600);
      const result = buildTemplateArgv({
        template: "git_commit",
        params: { message: longMessage },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("exceeds max length");
      }
    });

    it("validates path parameter for shell metacharacters", () => {
      const result = buildTemplateArgv({
        template: "cat",
        params: { path: "file.txt; rm -rf /" },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("invalid characters");
      }
    });
  });

  describe("getDefaultSecurityPolicy", () => {
    it("returns strict policy", () => {
      const policy = getDefaultSecurityPolicy();
      expect(policy.mode).toBe("strict");
      expect(policy.allowArbitraryExec).toBe(false);
      expect(policy.requireApproval).toBe("always");
      expect(policy.defaultHost).toBe("sandbox");
    });
  });
});
