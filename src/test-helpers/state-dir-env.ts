type StateDirEnvSnapshot = {
  seksbotStateDir: string | undefined;
  clawdbotStateDir: string | undefined;
};

export function snapshotStateDirEnv(): StateDirEnvSnapshot {
  return {
    seksbotStateDir: process.env.SEKSBOT_STATE_DIR,
    clawdbotStateDir: process.env.CLAWDBOT_STATE_DIR,
  };
}

export function restoreStateDirEnv(snapshot: StateDirEnvSnapshot): void {
  if (snapshot.seksbotStateDir === undefined) {
    delete process.env.SEKSBOT_STATE_DIR;
  } else {
    process.env.SEKSBOT_STATE_DIR = snapshot.seksbotStateDir;
  }
  if (snapshot.clawdbotStateDir === undefined) {
    delete process.env.CLAWDBOT_STATE_DIR;
  } else {
    process.env.CLAWDBOT_STATE_DIR = snapshot.clawdbotStateDir;
  }
}

export function setStateDirEnv(stateDir: string): void {
  process.env.SEKSBOT_STATE_DIR = stateDir;
  delete process.env.CLAWDBOT_STATE_DIR;
}
