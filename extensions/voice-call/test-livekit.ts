#!/usr/bin/env npx tsx
/**
 * LiveKit Voice Test - Talk to actual AI sisters!
 * 
 * Usage:
 *   LIVEKIT_URL=wss://your-app.livekit.cloud \
 *   LIVEKIT_API_KEY=API... \
 *   LIVEKIT_API_SECRET=... \
 *   OPENAI_API_KEY=sk-... \
 *   npx tsx test-livekit.ts
 * 
 * Then open http://localhost:3334/voice/client in your browser.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3334;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validate env
const missing: string[] = [];
if (!LIVEKIT_URL) missing.push("LIVEKIT_URL");
if (!LIVEKIT_API_KEY) missing.push("LIVEKIT_API_KEY");
if (!LIVEKIT_API_SECRET) missing.push("LIVEKIT_API_SECRET");
if (!OPENAI_API_KEY) missing.push("OPENAI_API_KEY");

if (missing.length > 0) {
  console.error("❌ Missing environment variables:", missing.join(", "));
  console.error(`
Usage:
  LIVEKIT_URL=wss://your-app.livekit.cloud \\
  LIVEKIT_API_KEY=API... \\
  LIVEKIT_API_SECRET=... \\
  OPENAI_API_KEY=sk-... \\
  npx tsx test-livekit.ts
`);
  process.exit(1);
}

console.log("🎙️  LiveKit Voice Test Server");
console.log("─".repeat(40));
console.log(`LiveKit URL: ${LIVEKIT_URL}`);
console.log(`API Key: ${LIVEKIT_API_KEY?.slice(0, 10)}...`);

// Dynamic imports for LiveKit SDK
let AccessToken: any;
let RoomServiceClient: any;

async function initLiveKit() {
  const sdk = await import("livekit-server-sdk");
  AccessToken = sdk.AccessToken;
  RoomServiceClient = sdk.RoomServiceClient;
  console.log("✅ LiveKit SDK loaded");
}

// Active rooms and their agent sessions
const activeRooms = new Map<string, {
  roomName: string;
  agentId: string;
  createdAt: number;
}>();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  
  console.log(`${req.method} ${url.pathname}`);

  // Serve client
  if (url.pathname === "/voice/client" || url.pathname === "/voice/client/") {
    const clientPath = path.join(__dirname, "src/providers/livekit/client/index.html");
    try {
      const html = fs.readFileSync(clientPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch (err) {
      console.error("Client file error:", err);
      res.writeHead(500);
      res.end("Client not found");
    }
    return;
  }

  // Join endpoint - creates room and returns token
  if (url.pathname === "/voice/join") {
    const agent = url.searchParams.get("agent") || "annie";
    const userName = url.searchParams.get("name") || `user-${Date.now()}`;
    const roomName = `seksbot-${agent}-${Date.now()}`;

    try {
      // Create room
      const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      await roomService.createRoom({
        name: roomName,
        maxParticipants: 2,
        emptyTimeout: 300,
      });
      console.log(`📦 Room created: ${roomName}`);

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

      // Track the room
      activeRooms.set(roomName, {
        roomName,
        agentId: agent,
        createdAt: Date.now(),
      });

      console.log(`✅ User ${userName} joining room ${roomName} to talk with ${agent}`);
      
      // TODO: Here we would start the agent worker to join the room
      // For now, just return the token and let the user join
      console.log(`⚠️  Agent not yet joining (need to wire up agent worker)`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        token: jwt,
        wsUrl: LIVEKIT_URL,
        roomName,
        agent,
      }));
    } catch (err) {
      console.error("Join error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to create room" }));
    }
    return;
  }

  // Leave endpoint
  if (url.pathname === "/voice/leave") {
    const roomName = url.searchParams.get("room");
    if (roomName) {
      activeRooms.delete(roomName);
      console.log(`🚪 Room ${roomName} marked for cleanup`);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Status endpoint
  if (url.pathname === "/voice/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      activeRooms: Array.from(activeRooms.values()),
    }));
    return;
  }

  // Token endpoint (for client that fetches token directly)
  if (url.pathname === "/voice/token") {
    const agent = url.searchParams.get("agent") || "annie";
    const userName = url.searchParams.get("name") || `user-${Date.now()}`;
    const roomName = `seksbot-${agent}-${Date.now()}`;

    try {
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

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        token: jwt,
        wsUrl: LIVEKIT_URL,
        roomName,
        agent,
      }));
    } catch (err) {
      console.error("Token error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to generate token" }));
    }
    return;
  }

  // 404
  res.writeHead(404);
  res.end("Not Found");
});

// Start server
async function main() {
  await initLiveKit();
  
  server.listen(PORT, () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log(`\n👉 Open: http://localhost:${PORT}/voice/client`);
    console.log("\nSelect an agent and click call.");
    console.log("Press Ctrl+C to stop.\n");
  });
}

main().catch(console.error);
