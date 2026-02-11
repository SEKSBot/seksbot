// skill-scanner — DEPRECATED (skills engine removed)

export type SkillScanSeverity = "info" | "warn" | "critical";

export type SkillScanFinding = {
  ruleId: string;
  severity: SkillScanSeverity;
  file: string;
  line: number;
  message: string;
  evidence: string;
};

export type SkillScanSummary = {
  scannedFiles: number;
  critical: number;
  warn: number;
  info: number;
  findings: SkillScanFinding[];
};

export type SkillScanOptions = {
  includeFiles?: string[];
  maxFiles?: number;
  maxFileBytes?: number;
};

export function isScannable(_filePath: string): boolean {
  return false;
}

export function scanSource(_source: string, _filePath: string): SkillScanFinding[] {
  return [];
}

export async function scanDirectory(
  _dirPath: string,
  _opts?: SkillScanOptions,
): Promise<SkillScanFinding[]> {
  return [];
}

export async function scanDirectoryWithSummary(
  _dirPath: string,
  _opts?: SkillScanOptions,
): Promise<SkillScanSummary> {
  return { scannedFiles: 0, critical: 0, warn: 0, info: 0, findings: [] };
}
