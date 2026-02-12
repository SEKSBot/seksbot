/**
 * Zulip event monitor using long polling
 */

import type { seksbotConfig, RuntimeEnv, ChatType, ReplyPayload } from "seksbot/plugin-sdk";
import {
  createReplyPrefixOptions,
  createTypingCallbacks,
  logTypingFailure,
} from "seksbot/plugin-sdk";
import { getZulipRuntime } from "../runtime.js";
import { resolveZulipAccount, type ResolvedZulipAccount } from "./accounts.js";
import { ZulipClient, type ZulipMessage, type ZulipEvent } from "./client.js";
import { sendMessageZulip } from "./send.js";

export type MonitorZulipOpts = {
  accountId?: string;
  config?: seksbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: Record<string, unknown>) => void;
};

function resolveRuntime(opts: MonitorZulipOpts): RuntimeEnv {
  return (
    opts.runtime ?? {
      log: console.log,
      error: console.error,
      exit: (code: number): never => {
        throw new Error(`exit ${code}`);
      },
    }
  );
}

function normalizeAllowList(list: Array<string | number>): string[] {
  return list.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
}

function isSenderAllowed(params: {
  senderId: number;
  senderEmail: string;
  allowFrom: string[];
}): boolean {
  if (params.allowFrom.length === 0) {
    return false;
  }
  const idStr = String(params.senderId);
  const emailLower = params.senderEmail.toLowerCase();
  return params.allowFrom.some((entry) => entry === idStr || entry === emailLower || entry === "*");
}

export async function monitorZulipProvider(opts: MonitorZulipOpts = {}): Promise<void> {
  const core = getZulipRuntime();
  const runtime = resolveRuntime(opts);
  const cfg = opts.config ?? core.config.loadConfig();
  const account = resolveZulipAccount({ cfg, accountId: opts.accountId });
  const logger = core.logging.getChildLogger({ module: "zulip" });

  if (!account.siteUrl || !account.botEmail || !account.apiKey) {
    throw new Error(
      `Zulip credentials missing for account "${account.accountId}" (need siteUrl, botEmail, apiKey)`,
    );
  }

  const logVerboseMessage = (message: string) => {
    if (!core.logging.shouldLogVerbose()) {
      return;
    }
    logger.debug?.(message);
  };

  const client = new ZulipClient({
    siteUrl: account.siteUrl,
    botEmail: account.botEmail,
    apiKey: account.apiKey,
  });

  // Get bot user info
  let botUserId: number | undefined;
  let botUsername: string | undefined;
  try {
    const me = await client.getMe();
    if (me.result === "success") {
      botUserId = me.user_id;
      botUsername = me.full_name;
      runtime.log?.(`zulip: connected as ${me.full_name} (${me.email})`);
    }
  } catch (err) {
    runtime.log?.(`zulip: failed to get bot info: ${String(err)}`);
  }

  // Register for events
  let queueId: string | undefined;
  let lastEventId: number = -1;

  const register = async (): Promise<boolean> => {
    try {
      const result = await client.registerEventQueue({
        event_types: ["message"],
      });
      if (result.result !== "success") {
        runtime.error?.(`zulip: failed to register event queue: ${result.msg}`);
        return false;
      }
      queueId = result.queue_id;
      lastEventId = result.last_event_id;
      opts.statusSink?.({ connected: true, lastConnectedAt: new Date().toISOString() });
      runtime.log?.(`zulip: event queue registered`);
      return true;
    } catch (err) {
      runtime.error?.(`zulip: failed to register: ${String(err)}`);
      return false;
    }
  };

  const handleMessage = async (msg: ZulipMessage): Promise<void> => {
    // Skip messages from self
    if (botUserId && msg.sender_id === botUserId) {
      return;
    }

    const isPrivate = msg.type === "private";
    const streamName = isPrivate ? undefined : (msg.display_recipient as string);
    const topic = msg.subject;
    const senderId = msg.sender_id;
    const senderEmail = msg.sender_email;
    const senderName = msg.sender_full_name;
    const rawText = msg.content?.trim() || "";

    // Check policies
    const dmPolicy = account.config.dmPolicy ?? "pairing";
    const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
    const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
    const configAllowFrom = normalizeAllowList(account.config.allowFrom ?? []);
    const configGroupAllowFrom = normalizeAllowList(account.config.groupAllowFrom ?? []);
    const storeAllowFrom = normalizeAllowList(
      await core.channel.pairing.readAllowFromStore("zulip").catch(() => []),
    );
    const effectiveAllowFrom = Array.from(new Set([...configAllowFrom, ...storeAllowFrom]));
    const effectiveGroupAllowFrom = Array.from(
      new Set([
        ...(configGroupAllowFrom.length > 0 ? configGroupAllowFrom : configAllowFrom),
        ...storeAllowFrom,
      ]),
    );

    const senderAllowed = isSenderAllowed({
      senderId,
      senderEmail,
      allowFrom: effectiveAllowFrom,
    });
    const groupSenderAllowed = isSenderAllowed({
      senderId,
      senderEmail,
      allowFrom: effectiveGroupAllowFrom,
    });

    // Handle DM policy
    if (isPrivate) {
      // Note: dmPolicy for Zulip is "open" | "pairing" | "allowlist" (no "disabled" option)
      if (dmPolicy !== "open" && !senderAllowed) {
        if (dmPolicy === "pairing") {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "zulip",
            id: String(senderId),
            meta: { name: senderName, email: senderEmail },
          });
          logVerboseMessage(`zulip: pairing request sender=${senderId} created=${created}`);
          if (created) {
            try {
              await sendMessageZulip(
                `user:${senderId}`,
                core.channel.pairing.buildPairingReply({
                  channel: "zulip",
                  idLine: `Your Zulip user id: ${senderId}`,
                  code,
                }),
                { accountId: account.accountId },
              );
              opts.statusSink?.({ lastOutboundAt: Date.now() });
            } catch (err) {
              logVerboseMessage(`zulip: pairing reply failed: ${String(err)}`);
            }
          }
        }
        return;
      }
    } else {
      // Stream message - groupPolicy is "open" | "allowlist"
      if (groupPolicy === "allowlist" && !groupSenderAllowed) {
        logVerboseMessage(`zulip: drop stream sender=${senderId} (not in allowlist)`);
        return;
      }
    }

    // Check for mention requirement in streams
    const requireMention = account.config.requireMention ?? true;
    if (!isPrivate && requireMention) {
      const mentionRegexes = core.channel.mentions.buildMentionRegexes(cfg, undefined);
      const wasMentioned =
        (botUsername
          ? rawText.toLowerCase().includes(`@**${botUsername.toLowerCase()}**`)
          : false) || core.channel.mentions.matchesMentionPatterns(rawText, mentionRegexes);
      if (!wasMentioned) {
        logVerboseMessage(`zulip: drop (no mention) stream=${streamName} topic=${topic}`);
        return;
      }
    }

    const chatType: ChatType = isPrivate ? "direct" : "channel";
    const kind = isPrivate ? "direct" : "channel";

    // Resolve routing
    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "zulip",
      accountId: account.accountId,
      peer: {
        kind,
        id: isPrivate ? String(senderId) : `${msg.stream_id}:${topic}`,
      },
    });

    const sessionKey = route.sessionKey;

    // Record activity
    core.channel.activity.record({
      channel: "zulip",
      accountId: account.accountId,
      direction: "inbound",
    });

    // Format from label
    const fromLabel = isPrivate
      ? `${senderName} (${senderEmail})`
      : `[#${streamName}/${topic}] ${senderName}`;

    // Build reply target
    const to = isPrivate ? `user:${senderId}` : `stream:${msg.stream_id}`;

    // Log preview
    const preview = rawText.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel = isPrivate
      ? `Zulip DM from ${senderName}`
      : `Zulip message in #${streamName}/${topic} from ${senderName}`;

    core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
      sessionKey,
      contextKey: `zulip:message:${msg.id}`,
    });

    // Build context payload
    const body = core.channel.reply.formatInboundEnvelope({
      channel: "Zulip",
      from: fromLabel,
      timestamp: msg.timestamp * 1000, // Zulip uses seconds
      body: rawText,
      chatType,
      sender: { name: senderName, id: String(senderId) },
    });

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      RawBody: rawText,
      CommandBody: rawText,
      From: isPrivate ? `zulip:${senderId}` : `zulip:stream:${msg.stream_id}:${topic}`,
      To: to,
      SessionKey: sessionKey,
      AccountId: route.accountId,
      ChatType: chatType,
      ConversationLabel: fromLabel,
      GroupSubject: !isPrivate ? `#${streamName}/${topic}` : undefined,
      GroupChannel: streamName ? `#${streamName}` : undefined,
      SenderName: senderName,
      SenderId: String(senderId),
      Provider: "zulip" as const,
      Surface: "zulip" as const,
      MessageSid: String(msg.id),
      Timestamp: msg.timestamp * 1000,
      WasMentioned: !isPrivate ? true : undefined,
      CommandAuthorized: isPrivate ? senderAllowed : groupSenderAllowed,
      OriginatingChannel: "zulip" as const,
      OriginatingTo: to,
    });

    // Update last route for DMs
    if (isPrivate) {
      const sessionCfg = cfg.session;
      const storePath = core.channel.session.resolveStorePath(sessionCfg?.store, {
        agentId: route.agentId,
      });
      // Embed topic in 'to' for stream messages (format: stream:id:topic)
      const deliveryTo = topic ? `${to}:${topic}` : to;
      await core.channel.session.updateLastRoute({
        storePath,
        sessionKey: route.mainSessionKey,
        deliveryContext: {
          channel: "zulip",
          to: deliveryTo,
          accountId: route.accountId,
        },
      });
    }

    logVerboseMessage(`zulip inbound: from=${ctxPayload.From} len=${rawText.length}`);

    // Set up text limits and chunking
    const textLimit = core.channel.text.resolveTextChunkLimit(cfg, "zulip", account.accountId, {
      fallbackLimit: 10000,
    });
    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: "zulip",
      accountId: account.accountId,
    });

    const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
      cfg,
      agentId: route.agentId,
      channel: "zulip",
      accountId: account.accountId,
    });

    // Create reply dispatcher
    const { dispatcher, replyOptions, markDispatchIdle } =
      core.channel.reply.createReplyDispatcherWithTyping({
        ...prefixOptions,
        humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
        deliver: async (payload: ReplyPayload) => {
          const text = core.channel.text.convertMarkdownTables(payload.text ?? "", tableMode);
          const chunkMode = core.channel.text.resolveChunkMode(cfg, "zulip", account.accountId);
          const chunks = core.channel.text.chunkMarkdownTextWithMode(text, textLimit, chunkMode);

          for (const chunk of chunks.length > 0 ? chunks : [text]) {
            if (!chunk) continue;
            await sendMessageZulip(to, chunk, {
              accountId: account.accountId,
              topic: topic ?? "agent",
            });
          }
          opts.statusSink?.({ lastOutboundAt: Date.now() });
          runtime.log?.(`zulip: delivered reply to ${to}`);
        },
        onError: (err: unknown, info: { kind: string }) => {
          runtime.error?.(`zulip ${info.kind} reply failed: ${String(err)}`);
        },
      });

    // Dispatch to agent
    await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions: {
        ...replyOptions,
        onModelSelected,
      },
    });
    markDispatchIdle();
  };

  const processEvent = async (event: ZulipEvent): Promise<void> => {
    if (event.type !== "message" || !event.message) {
      return;
    }
    await handleMessage(event.message);
  };

  const pollLoop = async (): Promise<void> => {
    while (!opts.abortSignal?.aborted) {
      if (!queueId) {
        const ok = await register();
        if (!ok) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
      }

      try {
        const result = await client.getEvents({
          queue_id: queueId!,
          last_event_id: lastEventId,
        });

        if (result.result !== "success") {
          if (result.msg?.includes("Bad event queue")) {
            runtime.log?.("zulip: event queue expired, re-registering");
            queueId = undefined;
            continue;
          }
          runtime.error?.(`zulip: event poll error: ${result.msg}`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        for (const event of result.events) {
          lastEventId = Math.max(lastEventId, event.id);
          await processEvent(event);
        }
      } catch (err) {
        if (opts.abortSignal?.aborted) {
          break;
        }
        runtime.error?.(`zulip: poll error: ${String(err)}`);
        queueId = undefined;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  };

  // Run poll loop
  try {
    await pollLoop();
  } finally {
    if (queueId) {
      try {
        await client.deleteEventQueue(queueId);
      } catch {
        // Ignore cleanup errors
      }
    }
    opts.statusSink?.({ connected: false, lastDisconnect: new Date().toISOString() });
  }
}
