#!/usr/bin/env npx tsx
/**
 * Quick test script for OpenAI Realtime voice.
 * 
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx test-openai-realtime.ts
 * 
 * Then open http://localhost:3334/voice/realtime/client in your browser.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3334;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY environment variable required");
  console.error("   Run: OPENAI_API_KEY=sk-... npx tsx test-openai-realtime.ts");
  process.exit(1);
}

console.log("🎙️  OpenAI Realtime Voice Test Server");
console.log("─".repeat(40));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  
  console.log(`${req.method} ${url.pathname}`);

  // Serve client
  if (url.pathname === "/voice/realtime/client" || url.pathname === "/voice/realtime/client/") {
    const clientPath = path.join(__dirname, "src/providers/openai-realtime/client/index.html");
    try {
      const html = fs.readFileSync(clientPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch (err) {
      res.writeHead(500);
      res.end("Client not found");
    }
    return;
  }

  // Session endpoint (unified interface - proxy SDP)
  if (url.pathname === "/voice/realtime/session" && req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const sdpOffer = Buffer.concat(chunks).toString("utf-8");

    const agent = url.searchParams.get("agent") || "annie";
    
    // Agent-specific instructions
    const agentInstructions: Record<string, string> = {
      annie: "You are Annie, a warm and helpful AI assistant. You speak concisely and naturally. You use the emoji 🌙 as your signature.",
      siofra: "You are Síofra, a thoughtful and gentle AI assistant. You're curious and like to explore ideas. You use the emoji 🌿 as your signature.", 
      aeon: "You are Aeon (also called AeonByte), a knowledgeable and confident AI assistant. You're direct and efficient. You use the emoji ⚡ as your signature.",
    };

    const sessionConfig = {
      type: "realtime",
      model: "gpt-4o-realtime-preview",
      voice: "shimmer", // Good female voice
      instructions: agentInstructions[agent] || agentInstructions.annie,
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
    };

    // Create multipart form
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const formBody = [
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

    try {
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: formBody,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("OpenAI error:", error);
        res.writeHead(response.status);
        res.end(JSON.stringify({ error: "OpenAI session failed", details: error }));
        return;
      }

      const sdpAnswer = await response.text();
      console.log(`✅ Session created for ${agent}`);
      res.writeHead(200, { "Content-Type": "application/sdp" });
      res.end(sdpAnswer);
    } catch (err) {
      console.error("Request error:", err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Request failed" }));
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`\n👉 Open: http://localhost:${PORT}/voice/realtime/client`);
  console.log("\nSelect an agent (Annie/Síofra/Aeon) and click the call button.");
  console.log("Press Ctrl+C to stop.\n");
});
