/**
 * LiveKit WebRTC Provider
 *
 * Implements VoiceCallProvider interface for browser-based WebRTC voice calls.
 * Uses LiveKit for transport, VAD, and turn detection.
 */

import type {
  HangupCallInput,
  InitiateCallInput,
  InitiateCallResult,
  PlayTtsInput,
  ProviderWebhookParseResult,
  StartListeningInput,
  StopListeningInput,
  WebhookContext,
  WebhookVerificationResult,
} from "../../types.js";
import type { VoiceCallProvider } from "../base.js";

export interface LiveKitConfig {
  /** LiveKit server WebSocket URL */
  wsUrl: string;
  /** LiveKit API key */
  apiKey: string;
  /** LiveKit API secret */
  apiSecret: string;
  /** Room name prefix */
  roomPrefix?: string;
  /** Max participants per room */
  maxParticipants?: number;
}

/**
 * LiveKit provider for WebRTC-based voice calls.
 *
 * Unlike telephony providers, this doesn't use phone numbers or HTTP webhooks.
 * Instead:
 * - Clients connect via WebRTC through LiveKit
 * - Agent joins the room as a participant
 * - Audio streams bidirectionally in real-time
 */
export class LiveKitProvider implements VoiceCallProvider {
  readonly name = "livekit" as const;
  private config: LiveKitConfig;

  constructor(config: LiveKitConfig) {
    this.config = config;
  }

  /**
   * For LiveKit, we use WebSocket signaling, not HTTP webhooks.
   * This is a no-op that always returns valid.
   */
  verifyWebhook(_ctx: WebhookContext): WebhookVerificationResult {
    // LiveKit doesn't use HTTP webhooks for call events
    // Events come through the LiveKit SDK
    return { ok: true };
  }

  /**
   * LiveKit events come through the SDK, not webhooks.
   * This returns an empty event list.
   */
  parseWebhookEvent(_ctx: WebhookContext): ProviderWebhookParseResult {
    return { events: [] };
  }

  /**
   * Create a room for the call and return connection details.
   * The "call" is initiated when the user joins the room.
   */
  async initiateCall(input: InitiateCallInput): Promise<InitiateCallResult> {
    // Dynamic import to avoid loading LiveKit SDK until needed
    const { RoomServiceClient, AccessToken } = await import("livekit-server-sdk");

    const roomService = new RoomServiceClient(
      this.config.wsUrl,
      this.config.apiKey,
      this.config.apiSecret
    );

    const roomName = `${this.config.roomPrefix || "seksbot-"}${input.callId}`;

    // Create the room
    await roomService.createRoom({
      name: roomName,
      maxParticipants: this.config.maxParticipants || 2,
      // Room will be cleaned up after everyone leaves
      emptyTimeout: 300, // 5 minutes
    });

    return {
      providerCallId: roomName,
      status: "initiated",
    };
  }

  /**
   * Close the room, ending the call for all participants.
   */
  async hangupCall(input: HangupCallInput): Promise<void> {
    const { RoomServiceClient } = await import("livekit-server-sdk");

    const roomService = new RoomServiceClient(
      this.config.wsUrl,
      this.config.apiKey,
      this.config.apiSecret
    );

    try {
      await roomService.deleteRoom(input.providerCallId);
    } catch (err) {
      // Room might already be gone
      console.warn(`[livekit] Failed to delete room ${input.providerCallId}:`, err);
    }
  }

  /**
   * Play TTS to the room.
   * This publishes audio to the room that all participants hear.
   */
  async playTts(input: PlayTtsInput): Promise<void> {
    // TTS is handled by the agent worker, not the provider directly
    // The agent worker receives text, generates audio via TTS, and publishes to room
    console.log(`[livekit] playTts requested for room ${input.providerCallId}: ${input.text}`);
  }

  /**
   * Start listening - agent worker handles this via LiveKit SDK
   */
  async startListening(input: StartListeningInput): Promise<void> {
    console.log(`[livekit] startListening for room ${input.providerCallId}`);
  }

  /**
   * Stop listening - agent worker handles this via LiveKit SDK
   */
  async stopListening(input: StopListeningInput): Promise<void> {
    console.log(`[livekit] stopListening for room ${input.providerCallId}`);
  }

  /**
   * Generate an access token for a participant to join a room.
   */
  async generateToken(
    roomName: string,
    participantName: string,
    options?: {
      canPublish?: boolean;
      canSubscribe?: boolean;
      ttl?: number;
    }
  ): Promise<string> {
    const { AccessToken } = await import("livekit-server-sdk");

    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: participantName,
      ttl: options?.ttl || 3600, // 1 hour default
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: options?.canPublish ?? true,
      canSubscribe: options?.canSubscribe ?? true,
    });

    return await token.toJwt();
  }
}

/**
 * Create a LiveKit provider instance from config.
 */
export function createLiveKitProvider(config: LiveKitConfig): LiveKitProvider {
  if (!config.wsUrl || !config.apiKey || !config.apiSecret) {
    throw new Error("[livekit] Missing required config: wsUrl, apiKey, apiSecret");
  }
  return new LiveKitProvider(config);
}
