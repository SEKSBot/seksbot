/**
 * OpenAI Realtime WebRTC Provider
 *
 * Minimal provider for direct browser-to-OpenAI voice connections.
 * Unlike telephony providers, this doesn't manage calls on the server -
 * the browser connects directly to OpenAI via WebRTC.
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

export interface OpenAIRealtimeConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env) */
  apiKey?: string;
  /** Model to use (default: gpt-4o-realtime) */
  model?: string;
  /** Voice for TTS output */
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "marin";
  /** System instructions for the model */
  instructions?: string;
  /** Turn detection settings */
  turnDetection?: {
    /** Type of turn detection */
    type?: "server_vad" | "none";
    /** VAD threshold (0-1) */
    threshold?: number;
    /** Padding before speech (ms) */
    prefixPaddingMs?: number;
    /** Silence duration to end turn (ms) */
    silenceDurationMs?: number;
  };
}

/**
 * OpenAI Realtime provider.
 *
 * This is a minimal provider because the actual voice connection
 * happens directly between the browser and OpenAI - not through our server.
 *
 * Our server's role is limited to:
 * 1. Minting ephemeral tokens
 * 2. Serving the client UI
 * 3. Optionally storing conversation history
 */
export class OpenAIRealtimeProvider implements VoiceCallProvider {
  readonly name = "openai-realtime" as const;
  private config: OpenAIRealtimeConfig;

  constructor(config: OpenAIRealtimeConfig) {
    this.config = config;
  }

  getConfig(): OpenAIRealtimeConfig {
    return this.config;
  }

  getApiKey(): string {
    return this.config.apiKey || process.env.OPENAI_API_KEY || "";
  }

  /**
   * Generate session configuration for the Realtime API.
   */
  getSessionConfig(): object {
    return {
      type: "realtime",
      model: this.config.model || "gpt-4o-realtime",
      audio: {
        output: {
          voice: this.config.voice || "marin",
        },
      },
      instructions: this.config.instructions,
      turn_detection: this.config.turnDetection
        ? {
            type: this.config.turnDetection.type || "server_vad",
            threshold: this.config.turnDetection.threshold,
            prefix_padding_ms: this.config.turnDetection.prefixPaddingMs,
            silence_duration_ms: this.config.turnDetection.silenceDurationMs,
          }
        : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // VoiceCallProvider interface (mostly no-ops for this provider)
  // ---------------------------------------------------------------------------

  verifyWebhook(_ctx: WebhookContext): WebhookVerificationResult {
    return { ok: true };
  }

  parseWebhookEvent(_ctx: WebhookContext): ProviderWebhookParseResult {
    return { events: [] };
  }

  async initiateCall(_input: InitiateCallInput): Promise<InitiateCallResult> {
    // Calls are initiated by the browser, not the server
    throw new Error("OpenAI Realtime calls are initiated from the browser");
  }

  async hangupCall(_input: HangupCallInput): Promise<void> {
    // Browser manages its own connection
  }

  async playTts(_input: PlayTtsInput): Promise<void> {
    // TTS is handled by OpenAI directly
  }

  async startListening(_input: StartListeningInput): Promise<void> {
    // Listening is managed by the browser connection
  }

  async stopListening(_input: StopListeningInput): Promise<void> {
    // Listening is managed by the browser connection
  }
}

/**
 * Create an OpenAI Realtime provider.
 */
export function createOpenAIRealtimeProvider(
  config: OpenAIRealtimeConfig
): OpenAIRealtimeProvider {
  return new OpenAIRealtimeProvider(config);
}
