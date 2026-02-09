/**
 * HTTP handlers for OpenAI Realtime WebRTC voice.
 *
 * Provides:
 * - /voice/realtime/client - Serves the web UI
 * - /voice/realtime/session - Creates session (unified interface, proxies SDP)
 * - /voice/realtime/token - Mints ephemeral token (alternative approach)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAIRealtimeConfig } from "./provider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface OpenAIRealtimeHttpConfig {
  config: OpenAIRealtimeConfig;
  apiKey: string;
  /** Base path for routes (default: /voice/realtime) */
  basePath?: string;
  /** Per-agent config lookup */
  getAgentConfig?: (agentId: string) => Promise<{
    voice?: string;
    instructions?: string;
  }>;
}

/**
 * Create HTTP request handler for OpenAI Realtime endpoints.
 */
export function createOpenAIRealtimeHttpHandler(handlerConfig: OpenAIRealtimeHttpConfig) {
  const basePath = handlerConfig.basePath || "/voice/realtime";

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (!pathname.startsWith(basePath)) {
      return false;
    }

    const route = pathname.slice(basePath.length) || "/";

    try {
      switch (route) {
        case "/client":
        case "/client/":
          return await serveClient(res);

        case "/session":
          return await handleSession(req, res, url, handlerConfig);

        case "/token":
          return await handleToken(req, res, url, handlerConfig);

        default:
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return true;
      }
    } catch (err) {
      console.error("[openai-realtime-http] Error:", err);
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
 * Unified interface: proxy SDP to OpenAI.
 * Browser sends SDP offer, we forward it with session config, return SDP answer.
 */
async function handleSession(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  handlerConfig: OpenAIRealtimeHttpConfig
): Promise<boolean> {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "POST required" }));
    return true;
  }

  // Read SDP from request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const sdpOffer = Buffer.concat(chunks).toString("utf-8");

  if (!sdpOffer) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "SDP offer required" }));
    return true;
  }

  // Get agent-specific config if requested
  const agentId = url.searchParams.get("agent");
  let sessionConfig = {
    type: "realtime",
    model: handlerConfig.config.model || "gpt-4o-realtime",
    audio: {
      output: {
        voice: handlerConfig.config.voice || "marin",
      },
    },
    instructions: handlerConfig.config.instructions,
    turn_detection: handlerConfig.config.turnDetection
      ? {
          type: handlerConfig.config.turnDetection.type || "server_vad",
          threshold: handlerConfig.config.turnDetection.threshold,
          prefix_padding_ms: handlerConfig.config.turnDetection.prefixPaddingMs,
          silence_duration_ms: handlerConfig.config.turnDetection.silenceDurationMs,
        }
      : {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
  };

  // Apply agent-specific overrides
  if (agentId && handlerConfig.getAgentConfig) {
    const agentConfig = await handlerConfig.getAgentConfig(agentId);
    if (agentConfig.voice) {
      sessionConfig.audio.output.voice = agentConfig.voice;
    }
    if (agentConfig.instructions) {
      sessionConfig.instructions = agentConfig.instructions;
    }
  }

  // Create multipart form
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
  const formParts = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="sdp"',
    "Content-Type: application/sdp",
    "",
    sdpOffer,
    `--${boundary}`,
    'Content-Disposition: form-data; name="session"',
    "Content-Type: application/json",
    "",
    JSON.stringify(sessionConfig),
    `--${boundary}--`,
  ].join("\r\n");

  // Forward to OpenAI
  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${handlerConfig.apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: formParts,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[openai-realtime] Session creation failed:", error);
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to create session", details: error }));
    return true;
  }

  // Return SDP answer
  const sdpAnswer = await response.text();
  res.writeHead(200, {
    "Content-Type": "application/sdp",
    "Cache-Control": "no-store",
  });
  res.end(sdpAnswer);

  console.log(`[openai-realtime] Session created for agent: ${agentId || "default"}`);
  return true;
}

/**
 * Ephemeral token approach: mint a token the client uses directly.
 */
async function handleToken(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  handlerConfig: OpenAIRealtimeHttpConfig
): Promise<boolean> {
  const agentId = url.searchParams.get("agent");

  let sessionConfig: Record<string, unknown> = {
    session: {
      type: "realtime",
      model: handlerConfig.config.model || "gpt-4o-realtime",
      audio: {
        output: {
          voice: handlerConfig.config.voice || "marin",
        },
      },
      instructions: handlerConfig.config.instructions,
    },
  };

  // Apply agent-specific overrides
  if (agentId && handlerConfig.getAgentConfig) {
    const agentConfig = await handlerConfig.getAgentConfig(agentId);
    const session = sessionConfig.session as Record<string, unknown>;
    if (agentConfig.voice) {
      (session.audio as Record<string, unknown>).output = { voice: agentConfig.voice };
    }
    if (agentConfig.instructions) {
      session.instructions = agentConfig.instructions;
    }
  }

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${handlerConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sessionConfig),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[openai-realtime] Token creation failed:", error);
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to create token" }));
    return true;
  }

  const data = await response.json();
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));

  return true;
}
