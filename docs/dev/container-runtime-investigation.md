# Container Runtime Investigation for seksbot Skills

**Date:** 2026-02-11  
**Author:** FootGun  
**Status:** Investigation / Research

## Requirements

seksbot skills run as containerized sub-agents. The container runtime must:

1. **Isolate** the skill from the host filesystem, other agents, and raw credentials
2. **Restrict networking** — only the SEKS broker should be reachable (`broker-only` mode)
3. **Be ephemeral** — containers are created per-skill-run and destroyed after
4. **Start fast** — skills should feel responsive, not like deploying infrastructure
5. **Be enforceable** — the skill can't escape the sandbox to access raw keys

## Options Evaluated

### 1. Docker (OCI Containers)

**Pros:**
- Already in our stack (Dockerfile.seksbot exists)
- Fast startup (~200ms)
- Mature tooling, well-understood
- Easy network policy via `--network none` + explicit broker access
- Works on Linux, macOS (via VM), and in CI

**Cons:**
- Shared kernel — container escapes are a known attack surface
- Docker daemon required (or Podman as drop-in)
- Network isolation requires iptables rules or custom networks

**Network enforcement:**
```bash
# Create a network that only allows traffic to the broker
docker network create --driver bridge \
  --opt com.docker.network.bridge.enable_ip_masquerade=false \
  seksbot-skill-net

# Run skill with restricted networking
docker run --rm \
  --network seksbot-skill-net \
  --add-host broker.seks.local:${BROKER_IP} \
  -e SEKS_BROKER_URL=http://broker.seks.local:8080 \
  -e SEKS_AGENT_TOKEN=${SCOPED_TOKEN} \
  seksbot-skill-runner:latest
```

### 2. gVisor (runsc)

**Pros:**
- Drop-in replacement for runc (Docker's default runtime)
- User-space kernel — intercepts syscalls, much stronger isolation than containers
- Same Docker workflow, just `--runtime=runsc`
- Used by Google Cloud Run, GKE Sandbox

**Cons:**
- Linux only (no macOS)
- Some syscall compatibility gaps (mostly edge cases)
- Slight performance overhead on syscall-heavy workloads

**Usage:**
```bash
docker run --runtime=runsc --rm \
  --network none \
  -e SEKS_BROKER_URL=... \
  -e SEKS_AGENT_TOKEN=... \
  seksbot-skill-runner:latest
```

### 3. Firecracker (microVMs)

**Pros:**
- Full VM isolation — separate kernel, strongest security boundary
- Sub-second startup (~125ms)
- Used by AWS Lambda, Fly.io
- Perfect for multi-tenant / untrusted code

**Cons:**
- Linux only, KVM required
- More complex orchestration than Docker
- No native macOS support
- Heavier resource footprint per instance

### 4. Wasm (WasmEdge / Wasmtime)

**Pros:**
- Near-instant startup (<10ms)
- Extremely lightweight
- Capability-based security by design
- Cross-platform

**Cons:**
- Limited ecosystem — most tools/SDKs aren't Wasm-ready
- Node.js in Wasm is experimental
- Can't run arbitrary Docker images
- Would need a custom skill runner SDK

## Recommendation

**Start with Docker, plan for gVisor.**

| Phase | Runtime | Why |
|-------|---------|-----|
| **Now** | Docker with `--network` restrictions | Works everywhere, fast iteration, already in our stack |
| **Soon** | Docker + gVisor (`--runtime=runsc`) on Linux hosts | Stronger isolation, drop-in upgrade |
| **Later** | Firecracker for cloud deployments | When we need multi-tenant skill execution at scale |

### Network Enforcement Strategy

The key insight: we don't need to prevent ALL network access. We need to ensure the **only** network path out of the container goes through the SEKS broker.

```
┌─────────────────────────────┐
│  Skill Container             │
│                              │
│  - No raw API keys           │
│  - SEKS_BROKER_URL set       │
│  - SEKS_AGENT_TOKEN (scoped) │
│  - seksh binary available    │
│                              │
│  Can reach: SEKS broker ONLY │
│  Can't reach: anything else  │
└──────────────┬───────────────┘
               │ only allowed connection
               ▼
        SEKS Broker → Provider APIs
```

Implementation:
1. Run container with `--network=none`
2. Use a sidecar proxy or socat to forward broker traffic only
3. OR: create a custom Docker network with iptables rules allowing only broker IP
4. The broker validates the scoped token against the skill's capability grants

---

## Scoped Token Minting

For each skill execution, the broker should issue a **scoped token** that:

1. Is valid only for the duration of the skill run
2. Grants only the capabilities declared in the skill manifest
3. Is tied to the parent agent's identity (audit trail)
4. Has a short TTL (e.g., 5 minutes or the skill timeout, whichever is shorter)

### Token Flow

```
Agent → Broker: "I need a scoped token for skill 'weather-lookup' 
                 with capabilities: [custom/openweathermap-api-key]
                 TTL: 30s"

Broker: validates parent agent token
        checks parent agent has those capabilities (or can delegate)
        mints scoped JWT:
        {
          sub: "footgun:weather-lookup:run-abc123",
          capabilities: ["custom/openweathermap-api-key"],
          exp: now + 30s,
          parent: "footgun"
        }

Agent → Container: passes scoped token as SEKS_AGENT_TOKEN env var

Container (skill) → Broker: uses scoped token for API calls
                            broker validates capabilities per-request
```

### Broker API Addition

```
POST /v1/tokens/scoped
Authorization: Bearer <parent-agent-token>
{
  "skillName": "weather-lookup",
  "capabilities": ["custom/openweathermap-api-key"],
  "ttlSeconds": 30
}

Response:
{
  "token": "seks_scoped_...",
  "expiresAt": "2026-02-11T16:10:00Z",
  "capabilities": ["custom/openweathermap-api-key"]
}
```

### Implementation Notes

- Scoped tokens should be JWTs signed by the broker's key
- The broker validates the JWT signature + claims on every proxied request
- No database lookup needed for validation (stateless verification)
- Token revocation: short TTL makes explicit revocation unnecessary for most cases
- For long-running skills: broker can support token refresh within the original capability scope

## Next Steps

1. **Implement Docker executor** in `src/seks/skills/executor.ts`
2. **Add scoped token minting** to broker client (`src/seks/broker-client.ts`)
3. **Build the skill runner base image** (`Dockerfile.skill-runner`)
4. **Add network restriction** setup to the executor
5. **Wire into sessions_spawn** as an alternative execution path
