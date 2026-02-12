import type { seksbotConfig } from "../config/config.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
import { BrokerClient } from "../seks/broker-client.js";

export type DiscordTokenSource = "env" | "config" | "broker" | "none";

export type DiscordTokenResolution = {
  token: string;
  source: DiscordTokenSource;
};

export function normalizeDiscordToken(raw?: string | null): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^Bot\s+/i, "");
}

/**
 * Async version of resolveDiscordToken that supports broker-based token resolution
 */
export async function resolveDiscordTokenAsync(
  cfg?: seksbotConfig,
  opts: { accountId?: string | null; envToken?: string | null } = {},
): Promise<DiscordTokenResolution> {
  // First check for broker configuration
  const brokerConfig = cfg?.seks?.broker;
  if (brokerConfig?.url) {
    try {
      const brokerClient = new BrokerClient(
        brokerConfig.url,
        brokerConfig.token,
        brokerConfig.tokenCommand,
      );
      const channelTokens = await brokerClient.getChannelTokens();
      if (channelTokens.discord) {
        const normalizedToken = normalizeDiscordToken(channelTokens.discord);
        if (normalizedToken) {
          return { token: normalizedToken, source: "broker" };
        }
      }
    } catch (error) {
      console.warn(
        `Failed to fetch Discord token from SEKS broker: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fall through to regular resolution
    }
  }

  // Fall back to regular token resolution
  return resolveDiscordToken(cfg, opts);
}

export function resolveDiscordToken(
  cfg?: seksbotConfig,
  opts: { accountId?: string | null; envToken?: string | null } = {},
): DiscordTokenResolution {
  const accountId = normalizeAccountId(opts.accountId);
  const discordCfg = cfg?.channels?.discord;
  const accountCfg =
    accountId !== DEFAULT_ACCOUNT_ID
      ? discordCfg?.accounts?.[accountId]
      : discordCfg?.accounts?.[DEFAULT_ACCOUNT_ID];
  const accountToken = normalizeDiscordToken(accountCfg?.token ?? undefined);
  if (accountToken) {
    return { token: accountToken, source: "config" };
  }

  const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
  const configToken = allowEnv ? normalizeDiscordToken(discordCfg?.token ?? undefined) : undefined;
  if (configToken) {
    return { token: configToken, source: "config" };
  }

  const envToken = allowEnv
    ? normalizeDiscordToken(opts.envToken ?? process.env.DISCORD_BOT_TOKEN)
    : undefined;
  if (envToken) {
    return { token: envToken, source: "env" };
  }

  return { token: "", source: "none" };
}
