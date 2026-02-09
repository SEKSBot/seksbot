/**
 * LiveKit Agent Worker
 *
 * Joins LiveKit rooms and handles the voice AI pipeline:
 * - Receives user audio from the room
 * - Runs STT to get transcript
 * - Sends to LLM via existing seksbot session
 * - Runs TTS on response
 * - Publishes audio back to room
 *
 * This integrates with LiveKit's Agents framework for turn detection.
 */

import type { VoiceCallConfig } from "../../config.js";

export interface AgentWorkerConfig {
  /** LiveKit server URL */
  wsUrl: string;
  /** LiveKit API key */
  apiKey: string;
  /** LiveKit API secret */
  apiSecret: string;

  /** STT provider config */
  stt?: {
    provider: "azure" | "deepgram" | "openai";
    apiKey?: string;
    region?: string; // For Azure
  };

  /** TTS provider config (uses voice-call TTS config) */
  tts?: VoiceCallConfig["tts"];

  /** Callback to send transcript to seksbot session */
  onUserSpeech?: (roomName: string, transcript: string) => Promise<string>;
}

/**
 * Agent worker that handles voice AI in LiveKit rooms.
 *
 * Usage with LiveKit Agents Python SDK (recommended):
 * The actual agent logic runs in Python using livekit-agents.
 * This TypeScript code manages room lifecycle and config.
 *
 * Usage with pure Node.js:
 * Can run entirely in Node using livekit-client SDK,
 * but loses some of LiveKit Agents' optimizations.
 */
export class AgentWorker {
  private config: AgentWorkerConfig;
  private activeRooms = new Map<string, AgentRoomSession>();

  constructor(config: AgentWorkerConfig) {
    this.config = config;
  }

  /**
   * Start the agent worker.
   * In production, this would connect to LiveKit and wait for room events.
   */
  async start(): Promise<void> {
    console.log("[livekit-agent] Agent worker starting...");
    // TODO: Connect to LiveKit and listen for room events
    // When a user joins a room, spawn an agent session
  }

  /**
   * Stop the agent worker and leave all rooms.
   */
  async stop(): Promise<void> {
    console.log("[livekit-agent] Agent worker stopping...");
    for (const [roomName, session] of this.activeRooms) {
      await session.leave();
      this.activeRooms.delete(roomName);
    }
  }

  /**
   * Join a specific room as the AI agent.
   */
  async joinRoom(roomName: string, agentIdentity: string): Promise<AgentRoomSession> {
    if (this.activeRooms.has(roomName)) {
      return this.activeRooms.get(roomName)!;
    }

    const session = new AgentRoomSession({
      roomName,
      agentIdentity,
      config: this.config,
    });

    await session.join();
    this.activeRooms.set(roomName, session);

    return session;
  }

  /**
   * Leave a room.
   */
  async leaveRoom(roomName: string): Promise<void> {
    const session = this.activeRooms.get(roomName);
    if (session) {
      await session.leave();
      this.activeRooms.delete(roomName);
    }
  }
}

/**
 * Represents an active agent session in a LiveKit room.
 */
class AgentRoomSession {
  private roomName: string;
  private agentIdentity: string;
  private config: AgentWorkerConfig;
  private connected = false;

  constructor(options: {
    roomName: string;
    agentIdentity: string;
    config: AgentWorkerConfig;
  }) {
    this.roomName = options.roomName;
    this.agentIdentity = options.agentIdentity;
    this.config = options.config;
  }

  async join(): Promise<void> {
    console.log(`[livekit-agent] Joining room ${this.roomName} as ${this.agentIdentity}`);

    // Dynamic import of LiveKit client
    const { Room, RoomEvent } = await import("livekit-client");

    const room = new Room();

    // Set up event handlers
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === "audio") {
        console.log(`[livekit-agent] Subscribed to audio from ${participant.identity}`);
        this.handleUserAudio(track);
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log(`[livekit-agent] Disconnected from room ${this.roomName}`);
      this.connected = false;
    });

    // TODO: Generate token and connect
    // const token = await this.generateAgentToken();
    // await room.connect(this.config.wsUrl, token);

    this.connected = true;
    console.log(`[livekit-agent] Connected to room ${this.roomName}`);
  }

  async leave(): Promise<void> {
    if (this.connected) {
      console.log(`[livekit-agent] Leaving room ${this.roomName}`);
      // TODO: Disconnect from room
      this.connected = false;
    }
  }

  /**
   * Handle incoming user audio.
   * This is where STT → LLM → TTS pipeline runs.
   */
  private handleUserAudio(track: unknown): void {
    // TODO: Implement audio processing pipeline
    // 1. Pipe audio to STT
    // 2. Wait for turn detection (speech end)
    // 3. Send transcript to seksbot session
    // 4. Get response
    // 5. Run TTS
    // 6. Publish audio back to room
    console.log(`[livekit-agent] Processing user audio...`);
  }

  /**
   * Speak text to the room.
   */
  async speak(text: string): Promise<void> {
    console.log(`[livekit-agent] Speaking: ${text}`);
    // TODO: Generate TTS audio and publish to room
  }
}

/**
 * Create and start an agent worker.
 */
export async function createAgentWorker(config: AgentWorkerConfig): Promise<AgentWorker> {
  const worker = new AgentWorker(config);
  await worker.start();
  return worker;
}
