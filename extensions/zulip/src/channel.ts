/**
 * Zulip channel plugin for seksbot
 */

import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
  type seksbotConfig,
} from "seksbot/plugin-sdk";
import { ZulipConfigSchema } from "./config-schema.js";
import { getZulipRuntime } from "./runtime.js";
import {
  listZulipAccountIds,
  resolveDefaultZulipAccountId,
  resolveZulipAccount,
  type ResolvedZulipAccount,
} from "./zulip/accounts.js";
import { normalizeZulipSiteUrl } from "./zulip/client.js";
import { monitorZulipProvider } from "./zulip/monitor.js";
import { probeZulip } from "./zulip/probe.js";
import { sendMessageZulip } from "./zulip/send.js";

const meta = {
  id: "zulip",
  label: "Zulip",
  selectionLabel: "Zulip (self-hosted)",
  detailLabel: "Zulip Bot",
  docsPath: "/channels/zulip",
  docsLabel: "zulip",
  blurb: "self-hosted open-source team chat with topic threading; 100% FOSS.",
  systemImage: "bubble.left.and.bubble.right",
  order: 66,
  quickstartAllowFrom: true,
} as const;

function normalizeAllowEntry(entry: string): string {
  return entry
    .trim()
    .replace(/^(zulip|user):/i, "")
    .toLowerCase();
}

function formatAllowEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/^(zulip|user):/i, "").toLowerCase();
}

function looksLikeZulipTargetId(input: string): boolean {
  const trimmed = input.trim();
  if (/^(stream|user|pm):/i.test(trimmed)) {
    return true;
  }
  if (/^\d+$/.test(trimmed)) {
    return true;
  }
  if (trimmed.includes("@") && trimmed.includes(".")) {
    return true;
  }
  return false;
}

function normalizeZulipMessagingTarget(input: string): string {
  return input.trim();
}

/**
 * Parse topic from target string.
 * Supports format: "stream:name:topic" where topic is after the second colon
 * For user targets, topic is ignored.
 */
function parseZulipTargetWithTopic(to: string): { target: string; topic?: string } {
  const trimmed = to.trim();

  // Check for stream:name:topic format
  if (trimmed.toLowerCase().startsWith("stream:")) {
    const rest = trimmed.slice(7); // Remove "stream:"
    const colonIdx = rest.indexOf(":");
    if (colonIdx > 0) {
      const streamName = rest.slice(0, colonIdx);
      const topic = rest.slice(colonIdx + 1);
      return { target: `stream:${streamName}`, topic: topic || undefined };
    }
  }

  return { target: trimmed };
}

// Helper to safely access config
function getZulipChannelConfig(cfg: seksbotConfig): Record<string, unknown> | undefined {
  return (cfg.channels as Record<string, unknown> | undefined)?.zulip as
    | Record<string, unknown>
    | undefined;
}

export const zulipPlugin: ChannelPlugin<ResolvedZulipAccount> = {
  id: "zulip",
  meta: {
    ...meta,
  },
  pairing: {
    idLabel: "zulipUserId",
    normalizeAllowEntry: (entry) => normalizeAllowEntry(entry),
    notifyApproval: async ({ id }) => {
      console.log(`[zulip] User ${id} approved for pairing`);
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel", "thread"],
    threads: true,
    media: false,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.zulip"] },
  configSchema: buildChannelConfigSchema(ZulipConfigSchema),
  config: {
    listAccountIds: (cfg) => listZulipAccountIds(cfg),
    resolveAccount: (cfg, accountId) =>
      resolveZulipAccount({ cfg, accountId: accountId ?? undefined }),
    defaultAccountId: (cfg) => resolveDefaultZulipAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "zulip",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "zulip",
        accountId,
        clearBaseFields: ["apiKey", "siteUrl", "botEmail", "name"],
      }),
    isConfigured: (account) => Boolean(account.apiKey && account.siteUrl && account.botEmail),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.apiKey && account.siteUrl && account.botEmail),
      apiKeySource: account.apiKeySource,
      siteUrl: account.siteUrl,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveZulipAccount({ cfg, accountId: accountId ?? undefined }).config.allowFrom ?? []).map(
        (entry) => String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => formatAllowEntry(String(entry))).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const zulipCfg = getZulipChannelConfig(cfg);
      const accounts = zulipCfg?.accounts as Record<string, unknown> | undefined;
      const useAccountPath = Boolean(accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.zulip.accounts.${resolvedAccountId}.`
        : "channels.zulip.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("zulip"),
        normalizeEntry: (raw: string) => normalizeAllowEntry(raw),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") {
        return [];
      }
      return [
        `- Zulip streams: groupPolicy="open" allows any member to trigger (mention-gated). Set channels.zulip.groupPolicy="allowlist" + channels.zulip.groupAllowFrom to restrict senders.`,
      ];
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId }) => {
      const account = resolveZulipAccount({ cfg, accountId: accountId ?? undefined });
      return account.config.requireMention ?? true;
    },
  },
  messaging: {
    normalizeTarget: normalizeZulipMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeZulipTargetId,
      hint: "<stream:name|user:email|user:ID>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getZulipRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 10000,
    resolveTarget: ({ to }) => {
      const trimmed = to?.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: new Error("Delivering to Zulip requires --to <stream:name|user:email|user:ID>"),
        };
      }
      return { ok: true, to: trimmed };
    },
    sendText: async (ctx) => {
      // Extract topic from 'to' if formatted as "stream:name:topic"
      const { to, text, accountId, replyToId } = ctx;
      const { target, topic } = parseZulipTargetWithTopic(to);
      const result = await sendMessageZulip(target, text, {
        accountId: accountId ?? undefined,
        topic: topic ?? undefined,
        replyToId: replyToId ?? undefined,
      });
      if (!result.ok || !result.messageId) {
        throw new Error(result.error ?? "Failed to send Zulip message");
      }
      return {
        channel: "zulip" as const,
        messageId: String(result.messageId),
      };
    },
    sendMedia: async (ctx) => {
      const { to, text, accountId } = ctx;
      const { target, topic } = parseZulipTargetWithTopic(to);
      const result = await sendMessageZulip(target, text, {
        accountId: accountId ?? undefined,
        topic: topic ?? undefined,
      });
      if (!result.ok || !result.messageId) {
        throw new Error(result.error ?? "Failed to send Zulip message");
      }
      return {
        channel: "zulip" as const,
        messageId: String(result.messageId),
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => {
      const s = snapshot as Record<string, unknown>;
      return {
        configured: snapshot.configured ?? false,
        apiKeySource: s.apiKeySource ?? "none",
        running: snapshot.running ?? false,
        connected: s.connected ?? false,
        lastStartAt: snapshot.lastStartAt ?? null,
        lastStopAt: snapshot.lastStopAt ?? null,
        lastError: snapshot.lastError ?? null,
        siteUrl: s.siteUrl ?? null,
        probe: snapshot.probe,
        lastProbeAt: snapshot.lastProbeAt ?? null,
      };
    },
    probeAccount: async ({ account, timeoutMs }) => {
      const siteUrl = account.siteUrl?.trim();
      const botEmail = account.botEmail?.trim();
      const apiKey = account.apiKey?.trim();
      if (!siteUrl || !botEmail || !apiKey) {
        return { ok: false, error: "siteUrl, botEmail, or apiKey missing" };
      }
      return await probeZulip({ siteUrl, botEmail, apiKey }, timeoutMs);
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => {
      // Build snapshot with standard fields, cast custom fields
      const snapshot = {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: Boolean(account.apiKey && account.siteUrl && account.botEmail),
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        // Custom Zulip fields (accessed via casting in buildChannelSummary)
        apiKeySource: account.apiKeySource,
        siteUrl: account.siteUrl,
        connected: (runtime as Record<string, unknown> | undefined)?.connected ?? false,
        lastConnectedAt: (runtime as Record<string, unknown> | undefined)?.lastConnectedAt ?? null,
        lastDisconnect: (runtime as Record<string, unknown> | undefined)?.lastDisconnect ?? null,
      };
      return snapshot as unknown as import("seksbot/plugin-sdk").ChannelAccountSnapshot;
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "zulip",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "Zulip env vars can only be used for the default account.";
      }
      // Use existing fields: token for apiKey, url for siteUrl, userId for botEmail
      const apiKey = input.accessToken ?? input.token;
      const siteUrl = input.url ?? input.httpUrl;
      const botEmail = input.userId;
      if (!input.useEnv && (!apiKey || !siteUrl || !botEmail)) {
        return "Zulip requires --access-token (API key), --url (site URL), and --user-id (bot email) or --use-env.";
      }
      if (siteUrl && !normalizeZulipSiteUrl(siteUrl)) {
        return "Zulip --url must be a valid URL.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const apiKey = input.accessToken ?? input.token;
      const siteUrl = input.url ?? input.httpUrl;
      const botEmail = input.userId;
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "zulip",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "zulip",
            })
          : namedConfig;

      const existingZulip = getZulipChannelConfig(next) ?? {};

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            zulip: {
              ...existingZulip,
              enabled: true,
              ...(input.useEnv
                ? {}
                : {
                    ...(apiKey ? { apiKey } : {}),
                    ...(siteUrl ? { siteUrl } : {}),
                    ...(botEmail ? { botEmail } : {}),
                  }),
            },
          },
        };
      }

      const existingAccounts = (existingZulip.accounts as Record<string, unknown>) ?? {};
      const existingAccount = (existingAccounts[accountId] as Record<string, unknown>) ?? {};

      return {
        ...next,
        channels: {
          ...next.channels,
          zulip: {
            ...existingZulip,
            enabled: true,
            accounts: {
              ...existingAccounts,
              [accountId]: {
                ...existingAccount,
                enabled: true,
                ...(apiKey ? { apiKey } : {}),
                ...(siteUrl ? { siteUrl } : {}),
                ...(botEmail ? { botEmail } : {}),
              },
            },
          },
        },
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      // Set initial status with custom fields
      const initialStatus = {
        accountId: account.accountId,
        siteUrl: account.siteUrl,
        apiKeySource: account.apiKeySource,
      };
      ctx.setStatus(
        initialStatus as unknown as import("seksbot/plugin-sdk").ChannelAccountSnapshot,
      );
      ctx.log?.info(`[${account.accountId}] starting Zulip channel`);
      return monitorZulipProvider({
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) =>
          ctx.setStatus({
            accountId: ctx.accountId,
            ...patch,
          } as unknown as import("seksbot/plugin-sdk").ChannelAccountSnapshot),
      });
    },
  },
};
