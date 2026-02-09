export type seksbotVersion = {
  major: number;
  minor: number;
  patch: number;
  revision: number;
};

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-(\d+))?/;

export function parseseksbotVersion(raw: string | null | undefined): seksbotVersion | null {
  if (!raw) {
    return null;
  }
  const match = raw.trim().match(VERSION_RE);
  if (!match) {
    return null;
  }
  const [, major, minor, patch, revision] = match;
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
    revision: revision ? Number.parseInt(revision, 10) : 0,
  };
}

export function compareseksbotVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const parsedA = parseseksbotVersion(a);
  const parsedB = parseseksbotVersion(b);
  if (!parsedA || !parsedB) {
    return null;
  }
  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }
  if (parsedA.revision !== parsedB.revision) {
    return parsedA.revision < parsedB.revision ? -1 : 1;
  }
  return 0;
}
