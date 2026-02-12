/**
 * seksbot Skills — Manifest parsing and validation
 *
 * Reads skill.yaml (or skill.json) from a skill directory and validates it.
 */

import fs from "node:fs";
import path from "node:path";
import type { Capability, SeksSkillManifest } from "./types.js";

const MANIFEST_FILENAMES = ["skill.yaml", "skill.yml", "skill.json"];
const SKILL_MD_FILENAME = "SKILL.md";
const SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const MAX_DESCRIPTION_LENGTH = 200;

export type ManifestParseResult =
  | { ok: true; manifest: SeksSkillManifest; raw: string }
  | { ok: false; error: string };

/**
 * Find the manifest file in a skill directory.
 */
function findManifestPath(dirPath: string): string | null {
  for (const filename of MANIFEST_FILENAMES) {
    const candidate = path.join(dirPath, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Parse a YAML-like manifest without a YAML dependency.
 * Supports a simple subset: key: value, lists with "- item", and nested objects.
 * For full YAML, we'd add a dependency — but for the manifest format we control,
 * this is sufficient.
 */
function parseSimpleYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split("\n");
  let currentKey: string | null = null;
  let currentList: unknown[] | null = null;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // List item
    const listMatch = trimmed.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey && currentList) {
      currentList.push(listMatch[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }

    // Key: value
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      // Save previous list if any
      if (currentKey && currentList) {
        result[currentKey] = currentList;
        currentList = null;
      }

      const key = kvMatch[1];
      const value = kvMatch[2].trim();

      if (!value) {
        // Might be start of a list or nested object
        currentKey = key;
        currentList = [];
      } else {
        currentKey = null;
        currentList = null;
        // Parse value
        if (value === "true") result[key] = true;
        else if (value === "false") result[key] = false;
        else if (/^\d+$/.test(value)) result[key] = parseInt(value, 10);
        else result[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  // Save trailing list
  if (currentKey && currentList) {
    result[currentKey] = currentList;
  }

  return result;
}

/**
 * Parse a capability string into a Capability object.
 * "anthropic/messages.create" → { kind: "api", endpoint: "..." }
 * "custom/my-secret" → { kind: "custom", key: "..." }
 */
function parseCapability(raw: string): Capability {
  const trimmed = raw.trim();
  if (trimmed.startsWith("custom/")) {
    return { kind: "custom", key: trimmed };
  }
  return { kind: "api", endpoint: trimmed };
}

/**
 * Validate a parsed manifest object.
 */
function validateManifest(obj: Record<string, unknown>): ManifestParseResult {
  // Version
  const version = obj.version ?? 1;
  if (version !== 1) {
    return { ok: false, error: `unsupported manifest version: ${version}` };
  }

  // Name
  const name = obj.name;
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "missing or empty 'name'" };
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    return {
      ok: false,
      error: `invalid skill name '${name}': must be lowercase kebab-case (a-z, 0-9, hyphens)`,
    };
  }

  // Description
  const description = obj.description;
  if (typeof description !== "string" || !description.trim()) {
    return { ok: false, error: "missing or empty 'description'" };
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
    };
  }

  // Capabilities
  const rawCapabilities = obj.capabilities;
  if (!Array.isArray(rawCapabilities) || rawCapabilities.length === 0) {
    return { ok: false, error: "missing or empty 'capabilities' list" };
  }
  const capabilities: Capability[] = rawCapabilities.map((c) => parseCapability(String(c)));

  // Build manifest
  const manifest: SeksSkillManifest = {
    version: 1,
    name: name.trim(),
    description: description.trim(),
    capabilities,
  };

  // Optional fields
  if (typeof obj.emoji === "string") manifest.emoji = obj.emoji;
  if (typeof obj.author === "string") manifest.author = obj.author;
  if (typeof obj.always === "boolean") manifest.always = obj.always;
  if (typeof obj.skillMdPath === "string") manifest.skillMdPath = obj.skillMdPath;
  if (Array.isArray(obj.os)) {
    manifest.os = obj.os.map((o) => String(o).trim()).filter(Boolean);
  }

  // Container spec (simplified — flat keys with container_ prefix)
  if (obj.container_image || obj.container_timeout || obj.container_network) {
    manifest.container = {};
    if (typeof obj.container_image === "string") manifest.container.image = obj.container_image;
    if (typeof obj.container_timeout === "number")
      manifest.container.timeoutSeconds = obj.container_timeout;
    if (obj.container_network === "broker-only" || obj.container_network === "none")
      manifest.container.network = obj.container_network;
    if (typeof obj.container_memory === "string")
      manifest.container.memoryLimit = obj.container_memory;
    if (typeof obj.container_cpu === "string") manifest.container.cpuLimit = obj.container_cpu;
  }

  return { ok: true, manifest, raw: "" };
}

/**
 * Parse a skill manifest from a directory.
 */
export function parseManifest(dirPath: string): ManifestParseResult {
  const manifestPath = findManifestPath(dirPath);
  if (!manifestPath) {
    return {
      ok: false,
      error: `no manifest file found in ${dirPath} (expected ${MANIFEST_FILENAMES.join(" or ")})`,
    };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, "utf-8");
  } catch (err) {
    return { ok: false, error: `failed to read ${manifestPath}: ${err}` };
  }

  let parsed: Record<string, unknown>;
  if (manifestPath.endsWith(".json")) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      return { ok: false, error: `invalid JSON in ${manifestPath}: ${err}` };
    }
  } else {
    parsed = parseSimpleYaml(raw);
  }

  const result = validateManifest(parsed);
  if (result.ok) {
    result.raw = raw;
  }
  return result;
}

/**
 * Read the SKILL.md content from a skill directory.
 */
export function readSkillMd(dirPath: string, manifest?: SeksSkillManifest): string | null {
  const filename = manifest?.skillMdPath ?? SKILL_MD_FILENAME;
  const mdPath = path.join(dirPath, filename);
  try {
    return fs.readFileSync(mdPath, "utf-8");
  } catch {
    return null;
  }
}
