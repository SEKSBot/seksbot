/**
 * LiveKit Agent Worker
 *
 * Joins LiveKit rooms and handles the voice AI pipeline:
 * - Receives user audio from the room
 * - Runs STT to get transcript
 * - Sends to LLM via callback (seksbot session)
 * - Runs TTS on response
 * - Publishes audio back to room
 *
 * This is the Node.js equivalent of LiveKit's Python Agents framework.
 */

import { EventEmitter } from "node:events";

export interface AgentWorkerConfig {
  /** LiveKit server URL */
  wsUrl: string;
  /** LiveKit API key */
  apiKey: string;
  /** LiveKit API secret */
  apiSecret: string;

  /** STT configuration */
  stt: {
    provider: "openai-realtime" | "azure" | "deepgram";
    apiKey: string;
    /** For Azure: region (e.g., "westus2") */
    region?: string;
    /** Model/config overrides */
    model?: string;
  };

  /** TTS callback - provided by runtime */
  synthesizeSpeech?: (text: string) => Promise<Buffer>;

  /** Callback when user finishes speaking - returns agent response */
  onUserSpeech: (roomName: string, transcript: string, agentId: string) => Promise<string>;

  /** Optional: callback for partial transcripts */
  onPartialTranscript?: (roomName: string, partial: string) => void;

  /** Turn detection settings */
  turnDetection?: {
    /** Minimum silence before end-of-turn (ms) */
    silenceMs?: number;
    /** Use semantic turn detection if available */
    useSemantic?: boolean;
  };
}

export interface AgentSession {
  roomName: string;
  agentId: string;
  participantId: string;
  speaking: boolean;
  connected: boolean;
}

/**
 * Events emitted by AgentWorker:
 * - 'session-started': { roomName, agentId }
 * - 'session-ended': { roomName, agentId, reason }
 * - 'user-speaking': { roomName, speaking: boolean }
 * - 'transcript': { roomName, text, isFinal }
 * - 'agent-speaking': { roomName, text }
 * - 'error': { roomName?, error }
 */
export class AgentWorker extends EventEmitter {
  private config: AgentWorkerConfig;
  private sessions = new Map<string, LiveKitAgentSession>();
  private running = false;

  constructor(config: AgentWorkerConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the agent worker.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log("[livekit-agent] Worker started");
  }

  /**
   * Stop the worker and disconnect all sessions.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    const promises: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      promises.push(session.disconnect());
    }
    await Promise.all(promises);
    this.sessions.clear();

    console.log("[livekit-agent] Worker stopped");
  }

  /**
   * Join a room as the AI agent.
   */
  async joinRoom(roomName: string, agentId: string): Promise<AgentSession> {
    if (this.sessions.has(roomName)) {
      const existing = this.sessions.get(roomName)!;
      return existing.getInfo();
    }

    const session = new LiveKitAgentSession({
      roomName,
      agentId,
      config: this.config,
      onEvent: (event, data) => this.emit(event, data),
    });

    await session.connect();
    this.sessions.set(roomName, session);

    return session.getInfo();
  }

  /**
   * Leave a room.
   */
  async leaveRoom(roomName: string): Promise<void> {
    const session = this.sessions.get(roomName);
    if (session) {
      await session.disconnect();
      this.sessions.delete(roomName);
    }
  }

  /**
   * Get all active sessions.
   */
  getSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).map(s => s.getInfo());
  }

  /**
   * Speak text in a specific room.
   */
  async speak(roomName: string, text: string): Promise<void> {
    const session = this.sessions.get(roomName);
    if (!session) {
      throw new Error(`No session for room ${roomName}`);
    }
    await session.speak(text);
  }
}

/**
 * Individual agent session in a LiveKit room.
 */
class LiveKitAgentSession {
  private roomName: string;
  private agentId: string;
  private config: AgentWorkerConfig;
  private onEvent: (event: string, data: unknown) => void;

  private connected = false;
  private speaking = false;
  private room: unknown = null; // LiveKit Room instance
  private localAudioTrack: unknown = null;

  // Audio pipeline state
  private sttSession: STTSession | null = null;
  private currentTranscript = "";
  private processingResponse = false;

  constructor(params: {
    roomName: string;
    agentId: string;
    config: AgentWorkerConfig;
    onEvent: (event: string, data: unknown) => void;
  }) {
    this.roomName = params.roomName;
    this.agentId = params.agentId;
    this.config = params.config;
    this.onEvent = params.onEvent;
  }

  async connect(): Promise<void> {
    console.log(`[livekit-agent] Connecting to room ${this.roomName} as ${this.agentId}`);

    try {
      // Dynamic imports to avoid loading SDK until needed
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const { AccessToken } = await import("livekit-server-sdk");

      // Generate agent token
      const token = new AccessToken(
        this.config.apiKey,
        this.config.apiSecret,
        {
          identity: `agent-${this.agentId}`,
          name: this.agentId,
          ttl: 86400, // 24 hours
        }
      );
      token.addGrant({
        room: this.roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      });
      const jwt = await token.toJwt();

      // Create and connect to room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      // Set up event handlers
      room.on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed.bind(this));
      room.on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed.bind(this));
      room.on(RoomEvent.Disconnected, this.handleDisconnected.bind(this));
      room.on(RoomEvent.ParticipantConnected, this.handleParticipantConnected.bind(this));
      room.on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected.bind(this));

      await room.connect(this.config.wsUrl, jwt);
      this.room = room;
      this.connected = true;

      // Initialize STT session
      await this.initializeSTT();

      console.log(`[livekit-agent] Connected to room ${this.roomName}`);
      this.onEvent("session-started", { roomName: this.roomName, agentId: this.agentId });

    } catch (err) {
      console.error(`[livekit-agent] Failed to connect to room ${this.roomName}:`, err);
      this.onEvent("error", { roomName: this.roomName, error: err });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    console.log(`[livekit-agent] Disconnecting from room ${this.roomName}`);

    if (this.sttSession) {
      this.sttSession.close();
      this.sttSession = null;
    }

    if (this.room) {
      const room = this.room as { disconnect: () => Promise<void> };
      await room.disconnect();
    }

    this.connected = false;
    this.onEvent("session-ended", { 
      roomName: this.roomName, 
      agentId: this.agentId, 
      reason: "disconnect" 
    });
  }

  getInfo(): AgentSession {
    return {
      roomName: this.roomName,
      agentId: this.agentId,
      participantId: `agent-${this.agentId}`,
      speaking: this.speaking,
      connected: this.connected,
    };
  }

  /**
   * Speak text to the room.
   */
  async speak(text: string): Promise<void> {
    if (!this.connected || !this.config.synthesizeSpeech) {
      console.warn(`[livekit-agent] Cannot speak: not connected or no TTS`);
      return;
    }

    try {
      this.speaking = true;
      this.onEvent("agent-speaking", { roomName: this.roomName, text });

      // Generate TTS audio
      const audioBuffer = await this.config.synthesizeSpeech(text);

      // Publish audio to room
      await this.publishAudio(audioBuffer);

      this.speaking = false;
    } catch (err) {
      console.error(`[livekit-agent] TTS/publish error:`, err);
      this.speaking = false;
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Audio Pipeline
  // ---------------------------------------------------------------------------

  private async initializeSTT(): Promise<void> {
    // Create STT session based on provider
    const { provider, apiKey, region, model } = this.config.stt;

    switch (provider) {
      case "openai-realtime":
        this.sttSession = await createOpenAIRealtimeSTT({
          apiKey,
          model: model || "gpt-4o-transcribe",
          silenceDurationMs: this.config.turnDetection?.silenceMs || 800,
          onPartial: (text) => this.handlePartialTranscript(text),
          onFinal: (text) => this.handleFinalTranscript(text),
          onSpeechStart: () => this.handleSpeechStart(),
          onSpeechEnd: () => this.handleSpeechEnd(),
        });
        break;

      case "azure":
        this.sttSession = await createAzureSTT({
          apiKey,
          region: region || "westus2",
          onPartial: (text) => this.handlePartialTranscript(text),
          onFinal: (text) => this.handleFinalTranscript(text),
        });
        break;

      case "deepgram":
        this.sttSession = await createDeepgramSTT({
          apiKey,
          onPartial: (text) => this.handlePartialTranscript(text),
          onFinal: (text) => this.handleFinalTranscript(text),
        });
        break;

      default:
        throw new Error(`Unsupported STT provider: ${provider}`);
    }

    console.log(`[livekit-agent] STT initialized with ${provider}`);
  }

  private handleTrackSubscribed(
    track: unknown,
    _publication: unknown,
    participant: unknown
  ): void {
    const trackObj = track as { kind: string; on: (event: string, cb: (data: unknown) => void) => void };
    const participantObj = participant as { identity: string };

    // Skip our own tracks
    if (participantObj.identity.startsWith("agent-")) {
      return;
    }

    if (trackObj.kind === "audio") {
      console.log(`[livekit-agent] Subscribed to audio from ${participantObj.identity}`);
      
      // Pipe audio to STT
      trackObj.on("audioData", (data: unknown) => {
        if (this.sttSession && !this.processingResponse) {
          const audioData = data as { samples: Float32Array; sampleRate: number };
          this.sttSession.sendAudio(audioData.samples, audioData.sampleRate);
        }
      });
    }
  }

  private handleTrackUnsubscribed(
    _track: unknown,
    _publication: unknown,
    participant: unknown
  ): void {
    const participantObj = participant as { identity: string };
    console.log(`[livekit-agent] Unsubscribed from ${participantObj.identity}`);
  }

  private handleDisconnected(): void {
    console.log(`[livekit-agent] Disconnected from room ${this.roomName}`);
    this.connected = false;
    this.onEvent("session-ended", { 
      roomName: this.roomName, 
      agentId: this.agentId, 
      reason: "disconnected" 
    });
  }

  private handleParticipantConnected(participant: unknown): void {
    const participantObj = participant as { identity: string };
    console.log(`[livekit-agent] Participant connected: ${participantObj.identity}`);
  }

  private handleParticipantDisconnected(participant: unknown): void {
    const participantObj = participant as { identity: string };
    console.log(`[livekit-agent] Participant disconnected: ${participantObj.identity}`);
  }

  private handleSpeechStart(): void {
    this.onEvent("user-speaking", { roomName: this.roomName, speaking: true });
  }

  private handleSpeechEnd(): void {
    this.onEvent("user-speaking", { roomName: this.roomName, speaking: false });
  }

  private handlePartialTranscript(text: string): void {
    this.currentTranscript = text;
    this.onEvent("transcript", { roomName: this.roomName, text, isFinal: false });
    
    if (this.config.onPartialTranscript) {
      this.config.onPartialTranscript(this.roomName, text);
    }
  }

  private async handleFinalTranscript(text: string): Promise<void> {
    if (!text.trim()) return;

    console.log(`[livekit-agent] Final transcript: "${text}"`);
    this.onEvent("transcript", { roomName: this.roomName, text, isFinal: true });

    // Get response from LLM
    this.processingResponse = true;
    try {
      const response = await this.config.onUserSpeech(
        this.roomName, 
        text, 
        this.agentId
      );

      if (response && response.trim()) {
        await this.speak(response);
      }
    } catch (err) {
      console.error(`[livekit-agent] Error getting response:`, err);
      this.onEvent("error", { roomName: this.roomName, error: err });
    } finally {
      this.processingResponse = false;
      this.currentTranscript = "";
    }
  }

  private async publishAudio(audioBuffer: Buffer): Promise<void> {
    // TODO: Convert audio buffer to LiveKit audio track and publish
    // This requires converting the TTS output format to WebRTC-compatible format
    // and using LocalAudioTrack to publish
    console.log(`[livekit-agent] Publishing ${audioBuffer.length} bytes of audio`);
  }
}

// ---------------------------------------------------------------------------
// STT Session Interfaces and Implementations
// ---------------------------------------------------------------------------

interface STTSession {
  sendAudio(samples: Float32Array, sampleRate: number): void;
  close(): void;
}

interface STTSessionConfig {
  apiKey: string;
  model?: string;
  silenceDurationMs?: number;
  region?: string;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

/**
 * OpenAI Realtime STT session.
 */
async function createOpenAIRealtimeSTT(config: STTSessionConfig): Promise<STTSession> {
  const WebSocket = (await import("ws")).default;

  let ws: InstanceType<typeof WebSocket> | null = null;
  let connected = false;

  const connect = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const url = "wss://api.openai.com/v1/realtime?model=" + (config.model || "gpt-4o-transcribe");
      
      ws = new WebSocket(url, {
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      ws.on("open", () => {
        connected = true;
        
        // Configure session
        ws?.send(JSON.stringify({
          type: "session.update",
          session: {
            input_audio_transcription: {
              model: config.model || "whisper-1",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: config.silenceDurationMs || 800,
            },
          },
        }));

        resolve();
      });

      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          
          switch (msg.type) {
            case "input_audio_buffer.speech_started":
              config.onSpeechStart?.();
              break;
              
            case "input_audio_buffer.speech_stopped":
              config.onSpeechEnd?.();
              break;
              
            case "conversation.item.input_audio_transcription.delta":
              if (msg.delta) {
                config.onPartial(msg.delta);
              }
              break;
              
            case "conversation.item.input_audio_transcription.completed":
              if (msg.transcript) {
                config.onFinal(msg.transcript);
              }
              break;
          }
        } catch (err) {
          console.error("[openai-realtime-stt] Parse error:", err);
        }
      });

      ws.on("error", (err) => {
        console.error("[openai-realtime-stt] WebSocket error:", err);
        if (!connected) {
          reject(err);
        }
      });

      ws.on("close", () => {
        connected = false;
      });
    });
  };

  await connect();

  return {
    sendAudio(samples: Float32Array, sampleRate: number): void {
      if (!connected || !ws) return;

      // Convert Float32Array to base64 PCM16
      const pcm16 = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      const buffer = Buffer.from(pcm16.buffer);
      const base64 = buffer.toString("base64");

      ws.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64,
      }));
    },

    close(): void {
      if (ws) {
        ws.close();
        ws = null;
      }
      connected = false;
    },
  };
}

/**
 * Azure Speech STT session (placeholder).
 */
async function createAzureSTT(config: STTSessionConfig): Promise<STTSession> {
  // TODO: Implement Azure Speech SDK integration
  console.log(`[azure-stt] Would initialize with region ${config.region}`);
  
  return {
    sendAudio(_samples: Float32Array, _sampleRate: number): void {
      // TODO: Implement
    },
    close(): void {
      // TODO: Implement
    },
  };
}

/**
 * Deepgram STT session (placeholder).
 */
async function createDeepgramSTT(config: STTSessionConfig): Promise<STTSession> {
  // TODO: Implement Deepgram SDK integration
  console.log(`[deepgram-stt] Would initialize with key ${config.apiKey.slice(0, 8)}...`);
  
  return {
    sendAudio(_samples: Float32Array, _sampleRate: number): void {
      // TODO: Implement
    },
    close(): void {
      // TODO: Implement
    },
  };
}

/**
 * Create and start an agent worker.
 */
export async function createAgentWorker(config: AgentWorkerConfig): Promise<AgentWorker> {
  const worker = new AgentWorker(config);
  await worker.start();
  return worker;
}
