/**
 * Zulip account resolution from config
 */

import type { seksbotConfig } from "seksbot/plugin-sdk";

export type ZulipAccountConfig = {
  enabled?: boolean;
  name?: string;
  siteUrl?: string;
  botEmail?: string;
  apiKey?: string;
  dmPolicy?: "open" | "pairing" | "allowlist";
  allowFrom?: Array<string | number>;
  groupPolicy?: "open" | "allowlist";
  groupAllowFrom?: Array<string | number>;
  requireMention?: boolean;
  historyLimit?: number;
};

export type ResolvedZulipAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  siteUrl?: string;
  botEmail?: string;
  apiKey?: string;
  apiKeySource: "config" | "env" | "none";
  config: ZulipAccountConfig;
};

export const DEFAULT_ACCOUNT_ID = "default";

type ZulipChannelConfig = {
  enabled?: boolean;
  siteUrl?: string;
  botEmail?: string;
  apiKey?: string;
  accounts?: Record<string, ZulipAccountConfig>;
} & ZulipAccountConfig;

function getZulipConfig(cfg: seksbotConfig): ZulipChannelConfig | undefined {
  return cfg.channels?.zulip as ZulipChannelConfig | undefined;
}

export function listZulipAccountIds(cfg: seksbotConfig): string[] {
  const zulipCfg = getZulipConfig(cfg);
  if (!zulipCfg) {
    return [];
  }
  const accounts = new Set<string>();

  // Check for top-level config (default account)
  if (zulipCfg.siteUrl || zulipCfg.botEmail || zulipCfg.apiKey || process.env.ZULIP_BOT_EMAIL) {
    accounts.add(DEFAULT_ACCOUNT_ID);
  }

  // Add named accounts
  if (zulipCfg.accounts) {
    for (const accountId of Object.keys(zulipCfg.accounts)) {
      accounts.add(accountId);
    }
  }

  return Array.from(accounts);
}

export function resolveDefaultZulipAccountId(cfg: seksbotConfig): string {
  const ids = listZulipAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveZulipAccount(params: {
  cfg: seksbotConfig;
  accountId?: string;
}): ResolvedZulipAccount {
  const { cfg, accountId: rawAccountId } = params;
  const accountId = rawAccountId?.trim() || DEFAULT_ACCOUNT_ID;
  const zulipCfg = getZulipConfig(cfg);

  const isDefault = accountId === DEFAULT_ACCOUNT_ID;
  const accountConfig = isDefault ? zulipCfg : zulipCfg?.accounts?.[accountId];

  // Environment variables (only for default account)
  const envSiteUrl = isDefault ? process.env.ZULIP_SITE_URL : undefined;
  const envBotEmail = isDefault ? process.env.ZULIP_BOT_EMAIL : undefined;
  const envApiKey = isDefault ? process.env.ZULIP_API_KEY : undefined;

  // Resolve values with env fallback for default account
  const siteUrl = accountConfig?.siteUrl ?? zulipCfg?.siteUrl ?? envSiteUrl;
  const botEmail = accountConfig?.botEmail ?? zulipCfg?.botEmail ?? envBotEmail;
  const apiKey = accountConfig?.apiKey ?? zulipCfg?.apiKey ?? envApiKey;

  // Determine API key source
  let apiKeySource: "config" | "env" | "none" = "none";
  if (accountConfig?.apiKey ?? zulipCfg?.apiKey) {
    apiKeySource = "config";
  } else if (envApiKey) {
    apiKeySource = "env";
  }

  // Build merged config
  const mergedConfig: ZulipAccountConfig = {
    enabled: accountConfig?.enabled ?? zulipCfg?.enabled ?? true,
    name: accountConfig?.name ?? zulipCfg?.name,
    siteUrl,
    botEmail,
    apiKey,
    dmPolicy: accountConfig?.dmPolicy ?? zulipCfg?.dmPolicy ?? "pairing",
    allowFrom: accountConfig?.allowFrom ?? zulipCfg?.allowFrom ?? [],
    groupPolicy: accountConfig?.groupPolicy ?? zulipCfg?.groupPolicy ?? "allowlist",
    groupAllowFrom: accountConfig?.groupAllowFrom ?? zulipCfg?.groupAllowFrom ?? [],
    requireMention: accountConfig?.requireMention ?? zulipCfg?.requireMention,
    historyLimit: accountConfig?.historyLimit ?? zulipCfg?.historyLimit,
  };

  return {
    accountId,
    name: mergedConfig.name,
    enabled: mergedConfig.enabled ?? true,
    siteUrl,
    botEmail,
    apiKey,
    apiKeySource,
    config: mergedConfig,
  };
}
