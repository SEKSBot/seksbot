#!/usr/bin/env npx tsx
/**
 * Voice Browser Server Test
 *
 * Starts a voice server that attaches to existing seksbot sessions.
 * Requires a running seksbot gateway.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... \
 *   OPENAI_API_KEY=... \
 *   npx tsx test-voice-browser.ts
 *
 * Then open http://localhost:3335/voice/client
 */

import {
  createVoiceBrowserServer,
  type VoiceBrowserDeps,
} from "./src/providers/voice-browser/index.js";

// Config from environment
const PORT = parseInt(process.env.VOICE_PORT || "3335", 10);
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "ws://127.0.0.1:4040";
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

// Dynamic import for gateway
let callGatewayFn: <T>(opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<T>;

async function loadGateway() {
  // Try to import from seksbot
  try {
    const gateway = await import("../../src/gateway/call.js");
    callGatewayFn = gateway.callGateway;
    console.log("✅ Using seksbot gateway client");
    return true;
  } catch (err) {
    console.log("⚠️  Could not load seksbot gateway, using direct WebSocket");
  }

  // Fallback: direct WebSocket implementation
  const WebSocket = (await import("ws")).default;

  callGatewayFn = async <T>(opts: { method: string; params?: unknown; timeoutMs?: number }) => {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const wsUrl = GATEWAY_URL.replace(/^http/, "ws");

    return new Promise<T>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      let messageId = 1;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error(`Gateway timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      ws.on("open", () => {
        // Send hello
        ws.send(
          JSON.stringify({
            type: "hello",
            version: 1,
            token: GATEWAY_TOKEN,
            client: { name: "voice-browser", version: "1.0.0" },
          }),
        );
      });

      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === "hello_ok") {
            // Send the actual request
            const reqId = messageId++;
            ws.send(
              JSON.stringify({
                type: "request",
                id: reqId,
                method: opts.method,
                params: opts.params,
              }),
            );
          } else if (msg.type === "response" || msg.type === "error") {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              ws.close();
              if (msg.type === "error") {
                reject(new Error(msg.error?.message || "Gateway error"));
              } else {
                resolve(msg.result as T);
              }
            }
          }
        } catch (err) {
          // Ignore parse errors
        }
      });

      ws.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      ws.on("close", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error("Gateway connection closed"));
        }
      });
    });
  };

  return true;
}

// Logger
const logger = {
  info: (msg: string, meta?: unknown) => {
    console.log(`[voice] ${msg}`, meta ? JSON.stringify(meta) : "");
  },
  warn: (msg: string, meta?: unknown) => {
    console.warn(`[voice] ⚠️  ${msg}`, meta ? JSON.stringify(meta) : "");
  },
  error: (msg: string, meta?: unknown) => {
    console.error(`[voice] ❌ ${msg}`, meta ? JSON.stringify(meta) : "");
  },
};

async function main() {
  console.log("🎙️  Voice Browser Server");
  console.log("─".repeat(40));

  // Check TTS config
  if (ELEVENLABS_API_KEY) {
    console.log("🎵 ElevenLabs: configured");
  } else if (OPENAI_API_KEY) {
    console.log("🎵 OpenAI TTS: configured");
  } else {
    console.log("⚠️  No TTS API key - will use browser TTS fallback");
  }

  // Load gateway
  await loadGateway();

  // Test gateway connection
  try {
    const status = await callGatewayFn<{ version: string }>({
      method: "status",
      timeoutMs: 5_000,
    });
    console.log(`✅ Gateway connected (v${status?.version || "unknown"})`);
  } catch (err) {
    console.error("❌ Gateway connection failed:", err);
    console.log("\nMake sure seksbot gateway is running:");
    console.log("  cd /path/to/seksbot && npm run dev");
    console.log("\nOr set OPENCLAW_GATEWAY_URL and OPENCLAW_GATEWAY_TOKEN");
    process.exit(1);
  }

  // Create server
  const deps: VoiceBrowserDeps = {
    config: {
      port: PORT,
      elevenLabsApiKey: ELEVENLABS_API_KEY,
      openaiApiKey: OPENAI_API_KEY,
      defaultAgent: "annie",
    },
    callGateway: callGatewayFn,
    logger,
  };

  const server = createVoiceBrowserServer(deps);

  server.listen(PORT, () => {
    console.log(`\n✅ Voice server: http://localhost:${PORT}`);
    console.log(`👉 Open: http://localhost:${PORT}/voice/client`);
    console.log("\nInstructions:");
    console.log("1. Select a session to attach to");
    console.log("2. Choose an AI sister (Annie/Síofra/Aeon)");
    console.log("3. Hold the mic button and speak");
    console.log("4. Release to send, wait for response\n");
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
