/**
 * Zulip API client
 * Uses basic auth with bot email + API key
 */

export type ZulipCredentials = {
  siteUrl: string;
  botEmail: string;
  apiKey: string;
};

export type ZulipApiResult<T> = {
  result: "success" | "error";
  msg: string;
} & T;

export type ZulipUser = {
  user_id: number;
  email: string;
  full_name: string;
  is_bot: boolean;
  is_active: boolean;
  avatar_url?: string;
  timezone?: string;
  bot_type?: number;
  bot_owner_id?: number;
};

export type ZulipMessage = {
  id: number;
  sender_id: number;
  sender_email: string;
  sender_full_name: string;
  content: string;
  timestamp: number;
  type: "stream" | "private";
  stream_id?: number;
  subject?: string; // topic for stream messages
  display_recipient: string | Array<{ id: number; email: string; full_name: string }>;
};

export type ZulipEvent = {
  type: string;
  id: number;
  message?: ZulipMessage;
  flags?: string[];
};

export type ZulipRegisterResponse = ZulipApiResult<{
  queue_id: string;
  last_event_id: number;
  event_queue_longpoll_timeout_seconds?: number;
}>;

export type ZulipEventsResponse = ZulipApiResult<{
  events: ZulipEvent[];
}>;

export type ZulipSendMessageResponse = ZulipApiResult<{
  id: number;
}>;

export function normalizeZulipSiteUrl(raw?: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    // Ensure HTTPS and no trailing slash
    return `${url.protocol}//${url.host}`.replace(/\/$/, "");
  } catch {
    // Try adding https:// if missing
    if (!trimmed.startsWith("http")) {
      try {
        const url = new URL(`https://${trimmed}`);
        return `${url.protocol}//${url.host}`.replace(/\/$/, "");
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function createZulipAuthHeader(botEmail: string, apiKey: string): string {
  const encoded = Buffer.from(`${botEmail}:${apiKey}`).toString("base64");
  return `Basic ${encoded}`;
}

export class ZulipClient {
  private siteUrl: string;
  private authHeader: string;

  constructor(creds: ZulipCredentials) {
    const siteUrl = normalizeZulipSiteUrl(creds.siteUrl);
    if (!siteUrl) {
      throw new Error(`Invalid Zulip site URL: ${creds.siteUrl}`);
    }
    this.siteUrl = siteUrl;
    this.authHeader = createZulipAuthHeader(creds.botEmail, creds.apiKey);
  }

  private async request<T>(
    method: string,
    endpoint: string,
    params?: Record<string, unknown>,
    timeoutMs = 30000,
  ): Promise<ZulipApiResult<T>> {
    const url = `${this.siteUrl}/api/v1${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const options: RequestInit = {
        method,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        signal: controller.signal,
      };

      if (params && method !== "GET") {
        options.body = new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]),
        ).toString();
      }

      if (params && method === "GET") {
        const searchParams = new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]),
        );
        const fullUrl = `${url}?${searchParams.toString()}`;
        const response = await fetch(fullUrl, options);
        return (await response.json()) as ZulipApiResult<T>;
      }

      const response = await fetch(url, options);
      return (await response.json()) as ZulipApiResult<T>;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getMe(timeoutMs?: number): Promise<ZulipApiResult<ZulipUser>> {
    return this.request<ZulipUser>("GET", "/users/me", undefined, timeoutMs);
  }

  async sendMessage(params: {
    type: "stream" | "private" | "direct";
    to: string | number | number[];
    content: string;
    topic?: string;
  }): Promise<ZulipSendMessageResponse> {
    const { type, to, content, topic } = params;
    const messageType = type === "direct" ? "private" : type;

    const reqParams: Record<string, unknown> = {
      type: messageType,
      to: Array.isArray(to) ? JSON.stringify(to) : to,
      content,
    };

    if (topic && messageType === "stream") {
      reqParams.topic = topic;
    }

    return this.request<{ id: number }>("POST", "/messages", reqParams);
  }

  async registerEventQueue(params?: {
    event_types?: string[];
    narrow?: Array<string[]>;
  }): Promise<ZulipRegisterResponse> {
    const reqParams: Record<string, unknown> = {};
    if (params?.event_types) {
      reqParams.event_types = params.event_types;
    }
    if (params?.narrow) {
      reqParams.narrow = params.narrow;
    }
    return this.request<{
      queue_id: string;
      last_event_id: number;
      event_queue_longpoll_timeout_seconds?: number;
    }>("POST", "/register", reqParams);
  }

  async getEvents(params: {
    queue_id: string;
    last_event_id: number;
    dont_block?: boolean;
  }): Promise<ZulipEventsResponse> {
    // Events endpoint uses long polling, so timeout is longer
    return this.request<{ events: ZulipEvent[] }>(
      "GET",
      "/events",
      {
        queue_id: params.queue_id,
        last_event_id: params.last_event_id,
        dont_block: params.dont_block,
      },
      90000, // 90 second timeout for long polling
    );
  }

  async deleteEventQueue(queueId: string): Promise<ZulipApiResult<Record<string, never>>> {
    return this.request<Record<string, never>>(
      "DELETE",
      `/events?queue_id=${encodeURIComponent(queueId)}`,
    );
  }

  async getServerSettings(): Promise<
    ZulipApiResult<{
      zulip_version: string;
      zulip_feature_level: number;
      push_notifications_enabled: boolean;
      realm_name: string;
      realm_uri: string;
    }>
  > {
    return this.request("GET", "/server_settings");
  }
}
