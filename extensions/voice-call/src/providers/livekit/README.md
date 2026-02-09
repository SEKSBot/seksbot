# LiveKit WebRTC Provider

WebRTC-based voice communication via LiveKit, enabling browser-to-agent voice calls without phone numbers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Client                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  LiveKit JS SDK                                      │    │
│  │  - Captures mic audio                               │    │
│  │  - Plays agent audio                                │    │
│  │  - Handles WebRTC connection                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebRTC (via LiveKit Cloud/Server)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    LiveKit Server                            │
│  - Manages rooms and participants                           │
│  - Routes audio between browser ↔ agent                     │
│  - Provides VAD + turn detection                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ 
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Seksbot Agent Worker                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  LiveKit Agent (Python/Node)                          │   │
│  │  - Joins room as participant                          │   │
│  │  - Receives user audio → STT                          │   │
│  │  - Sends to LLM (existing seksbot session)            │   │
│  │  - TTS → sends audio back                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Differences from Telephony Providers

| Aspect | Twilio/Telnyx/Plivo | LiveKit |
|--------|---------------------|---------|
| Connection | Phone number + PSTN | WebRTC from browser |
| Signaling | HTTP webhooks | WebSocket + LiveKit protocol |
| Audio | RTP/SIP | WebRTC (Opus codec) |
| Turn detection | DIY | Built-in (VAD + transformer) |
| Cost model | Per-minute + phone number | Per-minute (no phone costs) |

## Configuration

```yaml
plugins:
  voice-call:
    provider: livekit
    livekit:
      # LiveKit Cloud or self-hosted
      wsUrl: wss://your-app.livekit.cloud
      apiKey: APIxxxxxxx
      apiSecret: xxxxxxxxxxxxxxxxxxxxxxx
      
      # Optional: room settings
      roomPrefix: seksbot-  # Rooms created as seksbot-{sessionId}
      maxParticipants: 2    # 1 user + 1 agent
      
    # STT/TTS still uses existing config
    tts:
      provider: elevenlabs
      elevenlabs:
        voiceId: Rachel
```

## Implementation Plan

### Phase 1: Basic Voice Loop
1. [ ] LiveKit provider implementing VoiceCallProvider interface
2. [ ] Room creation/management
3. [ ] Agent worker that joins rooms
4. [ ] Audio pipeline: user speech → STT → session → TTS → playback
5. [ ] Simple HTML client for testing

### Phase 2: Integration
1. [ ] Per-agent voice configuration
2. [ ] Session binding (voice call → existing chat session)
3. [ ] Graceful handoff (voice → text and back)

### Phase 3: Polish
1. [ ] Connection state UI
2. [ ] Mute/unmute
3. [ ] Call duration limits
4. [ ] Error handling and reconnection

## Files

- `provider.ts` - LiveKit VoiceCallProvider implementation
- `agent-worker.ts` - Agent that joins LiveKit rooms
- `room-manager.ts` - Room lifecycle management
- `client/` - Browser SDK integration example

## Dependencies

```bash
pnpm add livekit-server-sdk @livekit/agents
```
