/**
 * OpenAI Realtime WebRTC Provider
 *
 * Direct voice-to-voice using OpenAI's Realtime API.
 */

export {
  OpenAIRealtimeProvider,
  createOpenAIRealtimeProvider,
  type OpenAIRealtimeConfig,
} from "./provider.js";

export {
  createOpenAIRealtimeHttpHandler,
  type OpenAIRealtimeHttpConfig,
} from "./http-handler.js";
