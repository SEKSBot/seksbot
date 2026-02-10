# Voice Comms Integration - Deep Exploration

## Current State

We have a working proof-of-concept:

- Browser captures speech via Web Speech API
- Server calls Claude API directly
- ElevenLabs generates TTS
- Browser plays audio

**Limitation:** This bypasses seksbot entirely — it's a standalone Claude conversation, not connected to real agent sessions with memory, tools, and context.

## Goal

Talk to the **actual** Annie/Síofra/Aeon sessions running in seksbot, with:

- Full conversation history
- Access to tools (file ops, web search, etc.)
- Memory integration
- Channel routing (so voice is another "channel" like Discord/Telegram)

## Architecture Options

### Option A: Voice as a Channel Plugin

Create voice as a first-class channel, similar to Discord/Telegram/Signal.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│   [Mic] → Speech Recognition → Text                         │
│   [Speaker] ← Audio ← TTS                                   │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket / HTTP
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Voice Channel Plugin                       │
│   - Receives transcribed text                                │
│   - Routes to agent session via dispatchInboundMessage       │
│   - Captures response                                        │
│   - Generates TTS                                            │
│   - Sends audio back                                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Seksbot Gateway                            │
│   - Agent sessions (Annie, Síofra, Aeon)                    │
│   - Tool execution                                           │
│   - Memory, context                                          │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**

- Full integration with existing session infrastructure
- Voice conversations persist in session history
- Agent has access to all tools
- Consistent with how other channels work

**Cons:**

- More complex to implement
- Need to handle streaming responses for low latency

### Option B: Gateway Method + HTTP Endpoint

Add gateway methods for voice and serve HTTP endpoints from the voice-call plugin.

```
Browser → POST /voice/message → Voice Plugin → Gateway RPC → Agent → Response → TTS → Audio
```

**Pros:**

- Simpler to implement
- Can reuse existing test code
- Doesn't require full channel plugin

**Cons:**

- Not a "real" channel
- May miss some channel features (typing indicators, etc.)

### Option C: WebSocket-based Voice Session

Maintain a persistent WebSocket connection for real-time voice.

```
Browser ←WebSocket→ Voice Plugin ←→ Agent Session
         (bidirectional audio + events)
```

**Pros:**

- Lowest latency
- Can stream partial responses
- Real-time status updates

**Cons:**

- Most complex
- State management challenges

## Recommended Approach: Option B (Gateway Method) First

Start with the simpler approach, then evolve to a full channel if needed.

### Implementation Plan

#### Phase 1: Wire Voice to Sessions (Gateway Methods)

1. **Add gateway methods to voice-call plugin:**

   ```typescript
   api.registerGatewayMethod("voice.send", async ({ params, respond }) => {
     // Receive transcribed text
     // Route to agent session
     // Return response text
   });

   api.registerGatewayMethod("voice.tts", async ({ params, respond }) => {
     // Convert text to speech
     // Return audio data or path
   });
   ```

2. **Use dispatchInboundMessage to route to agent:**

   ```typescript
   import { dispatchInboundMessageWithDispatcher } from "../../auto-reply/dispatch.js";

   const result = await dispatchInboundMessageWithDispatcher({
     ctx: {
       text: transcribedText,
       channel: "voice",
       sessionKey: agentSessionKey,
       // ... other context
     },
     cfg: api.config,
     dispatcherOptions: {
       onPartialReply: (text) => {
         /* stream to client */
       },
       onFinalReply: (text) => {
         /* complete response */
       },
     },
   });
   ```

3. **HTTP endpoints for browser client:**
   - `GET /voice/client` — Serve the voice UI
   - `POST /voice/send` — Receive transcribed text, return response + audio
   - `GET /voice/status` — Connection status

#### Phase 2: Improve Latency

1. **Stream responses:**
   - Start TTS generation as soon as first sentence is complete
   - Send audio chunks progressively
2. **WebSocket upgrade:**
   - Upgrade HTTP to WebSocket for persistent connection
   - Bidirectional streaming

3. **Server-side STT option:**
   - Use OpenAI Whisper API for more reliable transcription
   - Or Azure Speech Services for streaming STT

#### Phase 3: Full Channel Integration (Optional)

If needed, create a proper channel plugin:

- Register as a channel in config
- Handle channel-specific features
- Persist voice messages in channel history

## Key Integration Points

### 1. Session Resolution

```typescript
// Resolve which agent/session to talk to
const sessionKey = resolveSessionKey({
  agentId: "annie", // or "siofra", "aeon"
  channel: "voice",
  userId: uniqueVoiceClientId,
});
```

### 2. Message Dispatch

```typescript
// Create message context
const ctx: MsgContext = {
  text: transcribedText,
  channel: "voice",
  sessionKey,
  from: { id: clientId, name: "Voice User" },
  timestamp: Date.now(),
};

// Dispatch to agent
const result = await dispatchInboundMessage({
  ctx,
  cfg: loadConfig(),
  dispatcher: createReplyDispatcher({
    onReply: async (reply) => {
      // Generate TTS and send back
    },
  }),
});
```

### 3. TTS Integration

The gateway already has TTS support via `tts.convert`:

```typescript
const ttsResult = await api.runtime.tts.textToSpeech({
  text: agentResponse,
  cfg: api.config,
  channel: "voice",
});
```

Or use ElevenLabs directly for better voices:

```typescript
const audio = await generateElevenLabsTTS({
  text: agentResponse,
  voiceId: agentVoiceIds[agentId],
  apiKey: config.elevenlabs.apiKey,
});
```

### 4. Agent-Specific Voices

Store voice preferences in agent config:

```yaml
agents:
  annie:
    voice:
      provider: elevenlabs
      voiceId: "EXAVITQu4vr4xnSDxMaL"
  siofra:
    voice:
      provider: elevenlabs
      voiceId: "XB0fDUnXU5powFXDhCwa"
```

## Configuration

```yaml
plugins:
  voice-call:
    enabled: true
    provider: browser # New: browser-based voice

    browser:
      enabled: true
      port: 3334
      path: /voice

    stt:
      provider: browser # or "whisper", "azure"

    tts:
      provider: elevenlabs
      elevenlabs:
        apiKey: ${ELEVENLABS_API_KEY}

    # Per-agent voice mapping
    voices:
      annie: "EXAVITQu4vr4xnSDxMaL"
      siofra: "XB0fDUnXU5powFXDhCwa"
      aeon: "21m00Tcm4TlvDq8ikWAM"
```

## Files to Modify/Create

1. **extensions/voice-call/src/browser-voice/**
   - `handler.ts` — HTTP/WebSocket handlers
   - `session-bridge.ts` — Bridge to seksbot sessions
   - `client/index.html` — Browser UI

2. **extensions/voice-call/index.ts**
   - Register new gateway methods
   - Initialize browser voice handler

3. **extensions/voice-call/src/config.ts**
   - Add browser voice config schema

## Next Steps

1. Create `session-bridge.ts` that uses `dispatchInboundMessage`
2. Add gateway methods for voice.send and voice.tts
3. Update the HTTP handler to use the bridge
4. Test with actual agent sessions
5. Add per-agent voice configuration

## Questions to Resolve

1. **Session persistence:** Should voice create new sessions or connect to existing main sessions?
2. **Multi-agent:** How to switch between sisters mid-conversation?
3. **Interruption:** How to handle interrupting the agent while speaking?
4. **History:** Should voice messages appear in the regular session transcript?
