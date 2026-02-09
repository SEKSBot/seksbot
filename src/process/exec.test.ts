import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "./exec.js";

describe("runCommandWithTimeout", () => {
  it("passes env overrides to child", async () => {
    const result = await runCommandWithTimeout(
      [process.execPath, "-e", 'process.stdout.write(process.env.SEKSBOT_TEST_ENV ?? "")'],
      {
        timeoutMs: 5_000,
        env: { SEKSBOT_TEST_ENV: "ok" },
      },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("ok");
  });

  it("merges custom env with process.env", async () => {
    const previous = process.env.SEKSBOT_BASE_ENV;
    process.env.SEKSBOT_BASE_ENV = "base";
    try {
      const result = await runCommandWithTimeout(
        [
          process.execPath,
          "-e",
          'process.stdout.write((process.env.SEKSBOT_BASE_ENV ?? "") + "|" + (process.env.SEKSBOT_TEST_ENV ?? ""))',
        ],
        {
          timeoutMs: 5_000,
          env: { SEKSBOT_TEST_ENV: "ok" },
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toBe("base|ok");
    } finally {
      if (previous === undefined) {
        delete process.env.SEKSBOT_BASE_ENV;
      } else {
        process.env.SEKSBOT_BASE_ENV = previous;
      }
    }
  });
});
