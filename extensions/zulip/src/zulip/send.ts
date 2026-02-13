/**
 * Zulip message sending
 */

import { getZulipRuntime } from "../runtime.js";
import { resolveZulipAccount } from "./accounts.js";
import { ZulipClient } from "./client.js";

export type SendZulipMessageOptions = {
  accountId?: string;
  topic?: string;
  replyToId?: string;
};

export type SendZulipMessageResult = {
  ok: boolean;
  messageId?: number;
  error?: string;
  to: string;
};

const getCore = () => getZulipRuntime();

/**
 * Parse target string into Zulip destination
 *
 * Formats:
 * - `stream:stream-name` or `stream:123` - stream message (requires topic)
 * - `user:email@example.com` or `user:123` - private message
 * - `pm:email@example.com` - private message (alias)
 * - `123` - user ID (private message)
 * - `email@example.com` - user email (private message)
 */
function parseZulipTarget(to: string): {
  type: "stream" | "private";
  target: string | number;
} | null {
  const trimmed = to.trim();
  if (!trimmed) {
    return null;
  }

  // Stream target
  if (trimmed.startsWith("stream:")) {
    const stream = trimmed.slice(7).trim();
    const streamId = parseInt(stream, 10);
    return {
      type: "stream",
      target: isNaN(streamId) ? stream : streamId,
    };
  }

  // User/PM target
  if (trimmed.startsWith("user:") || trimmed.startsWith("pm:")) {
    const prefix = trimmed.startsWith("user:") ? "user:" : "pm:";
    const user = trimmed.slice(prefix.length).trim();
    const userId = parseInt(user, 10);
    return {
      type: "private",
      target: isNaN(userId) ? user : userId,
    };
  }

  // Numeric ID - assume user
  const numericId = parseInt(trimmed, 10);
  if (!isNaN(numericId) && String(numericId) === trimmed) {
    return {
      type: "private",
      target: numericId,
    };
  }

  // Email address - assume user
  if (trimmed.includes("@")) {
    return {
      type: "private",
      target: trimmed,
    };
  }

  // Default: treat as stream name
  return {
    type: "stream",
    target: trimmed,
  };
}

export async function sendMessageZulip(
  to: string,
  text: string,
  options: SendZulipMessageOptions = {},
): Promise<SendZulipMessageResult> {
  const core = getCore();
  const cfg = core.config.loadConfig();
  const account = resolveZulipAccount({ cfg, accountId: options.accountId });

  if (!account.siteUrl || !account.botEmail || !account.apiKey) {
    return {
      ok: false,
      error: "Zulip not configured (missing siteUrl, botEmail, or apiKey)",
      to,
    };
  }

  const target = parseZulipTarget(to);
  if (!target) {
    return {
      ok: false,
      error: `Invalid Zulip target: ${to}`,
      to,
    };
  }

  // Stream messages require a topic
  if (target.type === "stream" && !options.topic) {
    return {
      ok: false,
      error: "Stream messages require a topic",
      to,
    };
  }

  try {
    const client = new ZulipClient({
      siteUrl: account.siteUrl,
      botEmail: account.botEmail,
      apiKey: account.apiKey,
    });

    const result = await client.sendMessage({
      type: target.type,
      to: target.target,
      content: text,
      topic: options.topic,
    });

    if (result.result !== "success") {
      return {
        ok: false,
        error: result.msg || "Failed to send message",
        to,
      };
    }

    // Record outbound activity
    core.channel.activity.record({
      channel: "zulip",
      accountId: account.accountId,
      direction: "outbound",
    });

    return {
      ok: true,
      messageId: result.id,
      to,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      to,
    };
  }
}
