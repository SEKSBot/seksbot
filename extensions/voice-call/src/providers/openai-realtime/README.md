# OpenAI Realtime WebRTC Provider

Direct voice-to-voice using OpenAI's Realtime API with WebRTC.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Client                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  WebRTC PeerConnection                               │    │
│  │  - Captures mic audio                               │    │
│  │  - Plays agent audio                                │    │
│  │  - Data channel for events                          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │ 
    ┌─────────────────────┼─────────────────────┐
    │ 1. Get token        │                     │ 2. WebRTC
    ▼                     │                     ▼
┌──────────────┐          │          ┌─────────────────────────┐
│   Seksbot    │          │          │   OpenAI Realtime API   │
│   Server     │──────────┘          │   - STT (Whisper)       │
│              │                     │   - LLM (GPT-4o)        │
│  /session    │                     │   - TTS (built-in)      │
└──────────────┘                     │   - Turn detection      │
                                     └─────────────────────────┘
```

## Key Differences from LiveKit

| Aspect | LiveKit | OpenAI Realtime |
|--------|---------|-----------------|
| STT | Configurable (Azure, Deepgram, etc.) | OpenAI Whisper only |
| LLM | Any (Claude, GPT, etc.) | GPT-4o only |
| TTS | Configurable (ElevenLabs, etc.) | OpenAI voices only |
| Turn detection | LiveKit transformer model | OpenAI server VAD |
| Infrastructure | LiveKit server needed | Direct to OpenAI |
| Voice customization | Full control | Limited to OpenAI voices |
| Cost | Transport + STT + LLM + TTS | ~$0.06/min all-in |

## When to Use

**OpenAI Realtime is better when:**
- You want simplest possible setup
- OpenAI's voices are acceptable
- You're okay with GPT-4o for responses
- You want lowest latency (one hop)

**LiveKit is better when:**
- You need custom voices (ElevenLabs)
- You want to use Claude or other LLMs
- You need more control over the pipeline
- You want enhanced turn detection

## Configuration

```yaml
plugins:
  voice-call:
    provider: openai-realtime
    openaiRealtime:
      # Uses OPENAI_API_KEY env var by default
      apiKey: sk-...
      model: gpt-4o-realtime  
      voice: marin  # alloy, echo, fable, onyx, nova, shimmer, marin
      # System prompt for the realtime model
      instructions: |
        You are Annie, a helpful AI assistant.
        Be concise in voice responses.
```

## OpenAI Realtime Voices

| Voice | Description |
|-------|-------------|
| alloy | Neutral, balanced |
| echo | Warm, conversational |
| fable | Expressive, storytelling |
| onyx | Deep, authoritative |
| nova | Friendly, upbeat |
| shimmer | Clear, professional |
| marin | Natural, warm (newest) |

## Cost

OpenAI Realtime API pricing (as of late 2024):
- Audio input: $0.06 / minute
- Audio output: $0.24 / minute
- Text input: $5.00 / 1M tokens
- Text output: $20.00 / 1M tokens

For a typical 10-minute voice conversation:
- ~$0.60 audio in + ~$2.40 audio out = **~$3.00**

Compare to LiveKit + ElevenLabs:
- Transport: ~$0.04
- STT: ~$0.15
- LLM: ~$0.50
- TTS: ~$0.30
- Total: **~$1.00**

OpenAI Realtime is simpler but ~3x more expensive for extended conversations.

## Files

- `provider.ts` - VoiceCallProvider implementation (minimal)
- `http-handler.ts` - Token/session endpoints
- `client/index.html` - Browser UI with WebRTC

## Implementation Notes

Unlike other providers, OpenAI Realtime doesn't need an "agent worker" on the server.
The browser connects directly to OpenAI. The server only:
1. Mints ephemeral tokens (or proxies SDP)
2. Stores conversation history if needed
3. Provides the web client

The LLM conversation happens entirely within OpenAI's infrastructure.
