// skills-install — DEPRECATED (skills engine removed)

export type SkillInstallRequest = {
  workspaceDir: string;
  skillName: string;
  installId: string;
  timeoutMs?: number;
  config?: unknown;
};

export type SkillInstallResult = {
  ok: boolean;
  message: string;
  stdout: string;
  stderr: string;
  code: number | null;
  warnings?: string[];
};

export async function installSkill(
  _params: SkillInstallRequest,
): Promise<SkillInstallResult> {
  return {
    ok: false,
    message: "skills-install deprecated",
    stdout: "",
    stderr: "",
    code: null,
  };
}
