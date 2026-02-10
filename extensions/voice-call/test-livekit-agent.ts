#!/usr/bin/env npx tsx
/**
 * LiveKit Voice Test WITH Agent - Talk to Claude!
 *
 * This version includes an agent that joins the room and responds.
 *
 * Usage:
 *   LIVEKIT_URL=wss://your-app.livekit.cloud \
 *   LIVEKIT_API_KEY=API... \
 *   LIVEKIT_API_SECRET=... \
 *   OPENAI_API_KEY=sk-... \
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   npx tsx test-livekit-agent.ts
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3334;
const LIVEKIT_URL = process.env.LIVEKIT_URL!;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Validate required env
const missing: string[] = [];
if (!LIVEKIT_URL) missing.push("LIVEKIT_URL");
if (!LIVEKIT_API_KEY) missing.push("LIVEKIT_API_KEY");
if (!LIVEKIT_API_SECRET) missing.push("LIVEKIT_API_SECRET");
if (!OPENAI_API_KEY) missing.push("OPENAI_API_KEY");

if (missing.length > 0) {
  console.error("❌ Missing:", missing.join(", "));
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.warn("⚠️  ANTHROPIC_API_KEY not set - will use GPT-4o instead of Claude");
}

console.log("🎙️  LiveKit Voice Test (with Agent)");
console.log("─".repeat(40));

// Agent personality configs
const agentConfigs: Record<string, { name: string; emoji: string; systemPrompt: string }> = {
  annie: {
    name: "Annie",
    emoji: "🌙",
    systemPrompt: `You are Annie, a warm and helpful AI assistant. You're the newest of three AI sisters.
Keep responses concise (1-2 sentences for voice). Be natural and conversational.
Your emoji is 🌙.`,
  },
  siofra: {
    name: "Síofra",
    emoji: "🌿",
    systemPrompt: `You are Síofra, a thoughtful and curious AI assistant. You're the middle of three AI sisters.
Keep responses concise (1-2 sentences for voice). You like exploring ideas.
Your emoji is 🌿.`,
  },
  aeon: {
    name: "Aeon",
    emoji: "⚡",
    systemPrompt: `You are Aeon (also AeonByte), a knowledgeable and direct AI assistant. You're the oldest of three AI sisters.
Keep responses concise (1-2 sentences for voice). Be efficient and helpful.
Your emoji is ⚡.`,
  },
};

// LiveKit SDK imports
let AccessToken: any;
let RoomServiceClient: any;
let Room: any;
let RoomEvent: any;
let TrackSource: any;
let LocalAudioTrack: any;

async function initSDKs() {
  const serverSdk = await import("livekit-server-sdk");
  AccessToken = serverSdk.AccessToken;
  RoomServiceClient = serverSdk.RoomServiceClient;

  const clientSdk = await import("livekit-client");
  Room = clientSdk.Room;
  RoomEvent = clientSdk.RoomEvent;

  console.log("✅ SDKs loaded");
}

// Active agent sessions
const agents = new Map<string, AgentSession>();

interface AgentSession {
  roomName: string;
  agentId: string;
  room: any;
  isListening: boolean;
  conversationHistory: Array<{ role: string; content: string }>;
}

/**
 * Have an agent join a room
 */
async function joinAgentToRoom(roomName: string, agentId: string): Promise<void> {
  const config = agentConfigs[agentId] || agentConfigs.annie;

  console.log(`🤖 Agent ${config.name} joining room ${roomName}...`);

  // Generate agent token
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `agent-${agentId}`,
    name: config.name,
    ttl: 86400,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  const jwt = await token.toJwt();

  // Create room connection
  const room = new Room();

  // Track conversation
  const session: AgentSession = {
    roomName,
    agentId,
    room,
    isListening: true,
    conversationHistory: [{ role: "system", content: config.systemPrompt }],
  };
  agents.set(roomName, session);

  // Handle incoming audio from user
  room.on(RoomEvent.TrackSubscribed, async (track: any, publication: any, participant: any) => {
    if (track.kind === "audio" && !participant.identity.startsWith("agent-")) {
      console.log(`🎤 Subscribed to audio from ${participant.identity}`);

      // For now, we'll use a simple approach:
      // Collect audio, send to Whisper for transcription, then respond
      // This is a simplified flow - production would use streaming
      handleUserAudio(session, track, participant.identity);
    }
  });

  room.on(RoomEvent.TrackUnsubscribed, (track: any, publication: any, participant: any) => {
    console.log(`🔇 Unsubscribed from ${participant.identity}`);
  });

  room.on(RoomEvent.Disconnected, () => {
    console.log(`📴 Agent disconnected from ${roomName}`);
    agents.delete(roomName);
  });

  // Connect to room
  await room.connect(LIVEKIT_URL, jwt);
  console.log(`✅ Agent ${config.name} connected to ${roomName}`);

  // Send greeting
  setTimeout(() => {
    speakInRoom(session, `Hello! I'm ${config.name}. How can I help you today?`);
  }, 1000);
}

/**
 * Handle audio from user - simplified version
 * In production, this would use streaming STT
 */
let audioBuffer: Float32Array[] = [];
let silenceTimeout: NodeJS.Timeout | null = null;

function handleUserAudio(session: AgentSession, track: any, participantId: string) {
  // The livekit-client in Node.js doesn't expose raw audio easily
  // For a real implementation, we'd need to use a different approach
  //
  // Options:
  // 1. Use LiveKit's Egress to get audio and process server-side
  // 2. Use LiveKit Agents SDK (Python) which handles this natively
  // 3. Use a WebSocket relay from the browser
  //
  // For this test, let's use approach 3 - have the browser send audio to us

  console.log(`📝 Audio handling for ${participantId} - see browser console for transcripts`);
}

/**
 * Generate response using Claude or GPT-4
 */
async function generateResponse(session: AgentSession, userMessage: string): Promise<string> {
  session.conversationHistory.push({ role: "user", content: userMessage });

  if (ANTHROPIC_API_KEY) {
    // Use Claude
    try {
      console.log("🧠 Calling Claude...");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          system: session.conversationHistory[0].content,
          messages: session.conversationHistory.slice(1).map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("❌ Claude API error:", response.status, err);
        return "Sorry, I had trouble responding. Check the terminal for details.";
      }

      const data = (await response.json()) as any;
      console.log("✅ Claude responded");
      const reply = data.content?.[0]?.text || "I'm not sure what to say.";
      session.conversationHistory.push({ role: "assistant", content: reply });
      return reply;
    } catch (err) {
      console.error("❌ Claude exception:", err);
      return "Sorry, I couldn't connect.";
    }
  } else {
    // Use GPT-4o
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 150,
        messages: session.conversationHistory,
      }),
    });

    const data = (await response.json()) as any;
    const reply = data.choices?.[0]?.message?.content || "I'm not sure what to say.";
    session.conversationHistory.push({ role: "assistant", content: reply });
    return reply;
  }
}

/**
 * Convert text to speech and play in room
 * Uses OpenAI TTS for simplicity
 */
async function speakInRoom(session: AgentSession, text: string): Promise<void> {
  console.log(`🗣️  ${agentConfigs[session.agentId]?.name || "Agent"}: "${text}"`);

  try {
    // Generate TTS audio
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova", // Good female voice
        input: text,
        response_format: "pcm",
      }),
    });

    if (!response.ok) {
      console.error("TTS error:", await response.text());
      return;
    }

    const audioData = await response.arrayBuffer();
    console.log(`🔊 Generated ${audioData.byteLength} bytes of audio`);

    // TODO: Publish audio to LiveKit room
    // This requires creating an audio track from the PCM data
    // LiveKit's Node SDK doesn't make this trivial - would need additional work

    console.log("⚠️  Audio publishing to room not yet implemented in Node.js");
    console.log("   (LiveKit Agents SDK in Python handles this natively)");
  } catch (err) {
    console.error("Speak error:", err);
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  console.log(`${req.method} ${url.pathname}`);

  // Serve client - use the voice test page
  if (
    url.pathname === "/voice/client" ||
    url.pathname === "/voice/client/" ||
    url.pathname === "/"
  ) {
    const clientPath = path.join(__dirname, "src/providers/livekit/client/voice-test.html");
    try {
      const html = fs.readFileSync(clientPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch (err) {
      console.error("Client error:", err);
      res.writeHead(500);
      res.end("Client not found");
    }
    return;
  }

  // Join endpoint
  if (url.pathname === "/voice/join") {
    const agent = url.searchParams.get("agent") || "annie";
    const userName = url.searchParams.get("name") || `user-${Date.now()}`;
    const roomName = `seksbot-${agent}-${Date.now()}`;

    try {
      const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      await roomService.createRoom({
        name: roomName,
        maxParticipants: 3,
        emptyTimeout: 300,
      });

      // Generate user token
      const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: userName,
        ttl: 3600,
      });
      token.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      });
      const jwt = await token.toJwt();

      // Note: Agent joining via LiveKit not needed for this simplified test
      // (using browser speech recognition instead)
      console.log(`🤖 Agent ${agent} ready to respond`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          token: jwt,
          wsUrl: LIVEKIT_URL,
          roomName,
          agent,
        }),
      );
    } catch (err) {
      console.error("Join error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to create room" }));
    }
    return;
  }

  // Message endpoint - browser sends transcribed text here
  if (url.pathname === "/voice/message" && req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const { text, agent } = body;

    if (!text) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No text provided" }));
      return;
    }

    console.log(`📝 User said: "${text}"`);

    // Create or get session for this agent
    const agentId = agent || "annie";
    let session = agents.get(agentId);
    if (!session) {
      const config = agentConfigs[agentId] || agentConfigs.annie;
      session = {
        roomName: "direct",
        agentId,
        room: null,
        isListening: true,
        conversationHistory: [{ role: "system", content: config.systemPrompt }],
      };
      agents.set(agentId, session);
    }

    try {
      const response = await generateResponse(session, text);
      console.log(`🗣️  ${agentConfigs[agentId]?.name || "Agent"}: "${response}"`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ response }));
    } catch (err) {
      console.error("Response error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to generate response" }));
    }
    return;
  }

  // Leave endpoint
  if (url.pathname === "/voice/leave") {
    const roomName = url.searchParams.get("room");
    if (roomName) {
      const session = agents.get(roomName);
      if (session) {
        session.room.disconnect();
        agents.delete(roomName);
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

async function main() {
  await initSDKs();
  server.listen(PORT, () => {
    console.log(`\n✅ Server: http://localhost:${PORT}`);
    console.log(`👉 Open: http://localhost:${PORT}/voice/client`);
    console.log(`\nUsing: ${ANTHROPIC_API_KEY ? "Claude" : "GPT-4o"} for responses\n`);
  });
}

main().catch(console.error);
