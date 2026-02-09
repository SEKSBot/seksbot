/**
 * HTTP handlers for LiveKit WebRTC voice calls.
 *
 * Provides:
 * - /voice/client - Serves the web UI
 * - /voice/token - Issues LiveKit access tokens
 * - /voice/status - Connection status endpoint
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { LiveKitConfig } from "./provider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface LiveKitHttpHandlerConfig {
  livekit: LiveKitConfig;
  /** Base path for routes (default: /voice) */
  basePath?: string;
  /** Callback to get agent-specific config */
  getAgentConfig?: (agentId: string) => Promise<{
    identity: string;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Create HTTP request handler for LiveKit voice endpoints.
 */
export function createLiveKitHttpHandler(config: LiveKitHttpHandlerConfig) {
  const basePath = config.basePath || "/voice";

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Only handle our routes
    if (!pathname.startsWith(basePath)) {
      return false;
    }

    const route = pathname.slice(basePath.length) || "/";

    try {
      switch (route) {
        case "/client":
        case "/client/":
          return await serveClient(res);

        case "/token":
          return await handleToken(req, res, url, config);

        case "/status":
          return handleStatus(res);

        default:
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return true;
      }
    } catch (err) {
      console.error("[livekit-http] Error handling request:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
      return true;
    }
  };
}

/**
 * Serve the voice client HTML.
 */
async function serveClient(res: ServerResponse): Promise<boolean> {
  const clientPath = path.join(__dirname, "client", "index.html");

  try {
    const html = fs.readFileSync(clientPath, "utf-8");
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    });
    res.end(html);
    return true;
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Client not found" }));
    return true;
  }
}

/**
 * Generate and return a LiveKit access token.
 */
async function handleToken(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  config: LiveKitHttpHandlerConfig
): Promise<boolean> {
  const agentId = url.searchParams.get("agent") || "default";
  const participantName = url.searchParams.get("name") || `user-${Date.now()}`;

  // Dynamic import to avoid loading SDK until needed
  const { AccessToken } = await import("livekit-server-sdk");

  // Get agent-specific config if available
  const agentConfig = config.getAgentConfig
    ? await config.getAgentConfig(agentId)
    : { identity: agentId };

  // Create room name
  const roomName = `seksbot-${agentId}-${Date.now()}`;

  // Generate token for participant
  const token = new AccessToken(
    config.livekit.apiKey,
    config.livekit.apiSecret,
    {
      identity: participantName,
      ttl: 3600, // 1 hour
      metadata: JSON.stringify({
        agent: agentId,
        ...agentConfig.metadata,
      }),
    }
  );

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  const jwt = await token.toJwt();

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(
    JSON.stringify({
      token: jwt,
      wsUrl: config.livekit.wsUrl,
      roomName,
      agent: agentId,
    })
  );

  return true;
}

/**
 * Return status of the voice system.
 */
function handleStatus(res: ServerResponse): boolean {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      provider: "livekit",
      timestamp: Date.now(),
    })
  );
  return true;
}
