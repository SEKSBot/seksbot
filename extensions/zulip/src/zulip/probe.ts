/**
 * Zulip account probe for health checks
 */

import { ZulipClient, type ZulipCredentials } from "./client.js";

export type ZulipProbeResult = {
  ok: boolean;
  error?: string;
  user?: {
    id: number;
    email: string;
    fullName: string;
    isBot: boolean;
  };
  server?: {
    version: string;
    featureLevel: number;
    realmName: string;
    pushEnabled: boolean;
  };
  latencyMs?: number;
};

export async function probeZulip(
  creds: ZulipCredentials,
  timeoutMs = 5000,
): Promise<ZulipProbeResult> {
  const start = Date.now();

  try {
    const client = new ZulipClient(creds);

    // Get current user info
    const userResult = await client.getMe(timeoutMs);
    if (userResult.result !== "success") {
      return {
        ok: false,
        error: userResult.msg || "Failed to get user info",
        latencyMs: Date.now() - start,
      };
    }

    // Try to get server settings too
    let server: ZulipProbeResult["server"];
    try {
      const serverResult = await client.getServerSettings();
      if (serverResult.result === "success") {
        server = {
          version: serverResult.zulip_version,
          featureLevel: serverResult.zulip_feature_level,
          realmName: serverResult.realm_name,
          pushEnabled: serverResult.push_notifications_enabled,
        };
      }
    } catch {
      // Server settings are optional
    }

    return {
      ok: true,
      user: {
        id: userResult.user_id,
        email: userResult.email,
        fullName: userResult.full_name,
        isBot: userResult.is_bot,
      },
      server,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}
