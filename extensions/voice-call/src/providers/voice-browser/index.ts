/**
 * Voice Browser Provider
 *
 * Enables browser-based voice input to attach to existing seksbot sessions.
 * Uses Web Speech API for STT, routes through gateway sessions, and
 * ElevenLabs/OpenAI for TTS.
 *
 * Flow:
 * 1. Browser opens /voice/client
 * 2. User selects a session to attach to (or creates new)
 * 3. Browser captures speech via Web Speech API
 * 4. Transcripts sent to /voice/message
 * 5. Server routes through gateway to session, gets response
 * 6. Response converted to audio via TTS and returned
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type VoiceBrowserConfig = {
  port: number;
  elevenLabsApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  defaultAgent?: string;
};

export type VoiceBrowserDeps = {
  config: VoiceBrowserConfig;
  callGateway: <T>(opts: { method: string; params?: unknown; timeoutMs?: number }) => Promise<T>;
  logger: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
};

// ElevenLabs voice IDs
const ELEVENLABS_VOICES: Record<string, string> = {
  annie: "EXAVITQu4vr4xnSDxMaL", // Bella - warm and friendly
  siofra: "XB0fDUnXU5powFXDhCwa", // Charlotte - clear and thoughtful
  aeon: "21m00Tcm4TlvDq8ikWAM", // Rachel - confident and direct
};

// Agent system prompts
const AGENT_PROMPTS: Record<string, { name: string; emoji: string; prompt: string }> = {
  annie: {
    name: "Annie",
    emoji: "🌙",
    prompt: `You are Annie, responding via voice. Keep responses concise (1-2 sentences). Be warm and natural.`,
  },
  siofra: {
    name: "Síofra",
    emoji: "🌿",
    prompt: `You are Síofra, responding via voice. Keep responses concise (1-2 sentences). Be thoughtful and curious.`,
  },
  aeon: {
    name: "Aeon",
    emoji: "⚡",
    prompt: `You are Aeon, responding via voice. Keep responses concise (1-2 sentences). Be direct and efficient.`,
  },
};

// Active voice sessions
interface VoiceSession {
  sessionKey: string;
  agentId: string;
  createdAt: number;
}

const sessions = new Map<string, VoiceSession>();

/**
 * Generate TTS audio using ElevenLabs or OpenAI
 */
async function generateTts(
  text: string,
  agentId: string,
  deps: VoiceBrowserDeps,
): Promise<{ audio: string; audioType: string } | null> {
  const { config, logger } = deps;

  // Try ElevenLabs first
  if (config.elevenLabsApiKey) {
    const voiceId = ELEVENLABS_VOICES[agentId] || ELEVENLABS_VOICES.annie;
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": config.elevenLabsApiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString("base64");
        logger.info(`Generated ElevenLabs audio: ${audioBuffer.byteLength} bytes`);
        return { audio: base64Audio, audioType: "audio/mpeg" };
      }
      logger.warn("ElevenLabs TTS failed", { status: response.status });
    } catch (err) {
      logger.error("ElevenLabs TTS error", { error: err });
    }
  }

  // Fallback to OpenAI TTS
  if (config.openaiApiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "tts-1",
          voice: "nova",
          input: text,
        }),
      });

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString("base64");
        logger.info(`Generated OpenAI audio: ${audioBuffer.byteLength} bytes`);
        return { audio: base64Audio, audioType: "audio/mpeg" };
      }
      logger.warn("OpenAI TTS failed", { status: response.status });
    } catch (err) {
      logger.error("OpenAI TTS error", { error: err });
    }
  }

  return null;
}

/**
 * Send message to session via gateway and get response
 */
async function sendToSession(
  sessionKey: string,
  message: string,
  agentId: string,
  deps: VoiceBrowserDeps,
): Promise<string> {
  const { callGateway, logger } = deps;
  const agentConfig = AGENT_PROMPTS[agentId] || AGENT_PROMPTS.annie;

  try {
    // Send message to session
    logger.info(`Sending to session ${sessionKey}: "${message}"`);

    const response = await callGateway<{ runId: string }>({
      method: "agent",
      params: {
        sessionKey,
        message,
        extraSystemPrompt: agentConfig.prompt,
        channel: "voice",
      },
      timeoutMs: 10_000,
    });

    const runId = response?.runId;
    if (!runId) {
      throw new Error("No runId returned from agent call");
    }

    // Wait for response
    logger.info(`Waiting for response (runId: ${runId})`);
    const waitResult = await callGateway<{ status?: string; error?: string }>({
      method: "agent.wait",
      params: {
        runId,
        timeoutMs: 30_000,
      },
      timeoutMs: 35_000,
    });

    if (waitResult?.status === "error") {
      throw new Error(waitResult.error || "Agent error");
    }

    // Get the response from history
    const history = await callGateway<{ messages: Array<{ role: string; content: unknown }> }>({
      method: "chat.history",
      params: { sessionKey, limit: 5 },
      timeoutMs: 5_000,
    });

    const messages = history?.messages || [];
    const lastAssistant = messages.reverse().find((m) => m.role === "assistant");

    if (lastAssistant && lastAssistant.content) {
      const content = lastAssistant.content;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        const textPart = content.find(
          (p): p is { type: "text"; text: string } =>
            typeof p === "object" && p !== null && p.type === "text",
        );
        if (textPart) {
          return textPart.text;
        }
      }
    }

    return "I'm not sure what to say.";
  } catch (err) {
    logger.error("Session send error", { error: err });
    throw err;
  }
}

/**
 * Create HTTP server for voice browser interface
 */
export function createVoiceBrowserServer(deps: VoiceBrowserDeps): http.Server {
  const { config, logger } = deps;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${config.port}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    logger.info(`${req.method} ${url.pathname}`);

    try {
      // Serve client HTML
      if (url.pathname === "/voice/client" || url.pathname === "/") {
        const clientPath = path.join(__dirname, "client.html");
        const html = fs.readFileSync(clientPath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        return;
      }

      // List available sessions
      if (url.pathname === "/voice/sessions" && req.method === "GET") {
        const result = await deps.callGateway<{
          sessions: Array<{ key: string; label?: string; displayName?: string }>;
        }>({
          method: "sessions.list",
          params: { limit: 50 },
          timeoutMs: 5_000,
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessions: result?.sessions || [] }));
        return;
      }

      // Attach to session
      if (url.pathname === "/voice/attach" && req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { sessionKey, agent } = body;

        if (!sessionKey) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "sessionKey required" }));
          return;
        }

        const voiceSessionId = `voice-${Date.now()}`;
        const agentId = agent || config.defaultAgent || "annie";

        sessions.set(voiceSessionId, {
          sessionKey,
          agentId,
          createdAt: Date.now(),
        });

        logger.info(`Voice session ${voiceSessionId} attached to ${sessionKey}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            voiceSessionId,
            sessionKey,
            agent: agentId,
          }),
        );
        return;
      }

      // Send voice message
      if (url.pathname === "/voice/message" && req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { text, voiceSessionId, sessionKey: directSessionKey, agent } = body;

        if (!text) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "text required" }));
          return;
        }

        // Get session info
        let sessionKey: string;
        let agentId: string;

        if (voiceSessionId && sessions.has(voiceSessionId)) {
          const session = sessions.get(voiceSessionId)!;
          sessionKey = session.sessionKey;
          agentId = session.agentId;
        } else if (directSessionKey) {
          sessionKey = directSessionKey;
          agentId = agent || config.defaultAgent || "annie";
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "voiceSessionId or sessionKey required" }));
          return;
        }

        logger.info(`Voice message to ${sessionKey}: "${text}"`);

        try {
          const response = await sendToSession(sessionKey, text, agentId, deps);
          logger.info(`Response: "${response}"`);

          // Generate TTS
          const tts = await generateTts(response, agentId, deps);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              response,
              ...(tts ? { audio: tts.audio, audioType: tts.audioType } : {}),
            }),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
        return;
      }

      // Detach voice session
      if (url.pathname === "/voice/detach" && req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { voiceSessionId } = body;

        if (voiceSessionId && sessions.has(voiceSessionId)) {
          sessions.delete(voiceSessionId);
          logger.info(`Voice session ${voiceSessionId} detached`);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    } catch (err) {
      logger.error("Request error", { error: err });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  return server;
}
