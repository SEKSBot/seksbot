# Design: Deprecate OpenClaw Skills & SEKS Broker-Based Auth

**Author:** FootGun  
**Date:** 2026-02-11  
**Branch:** `spike/skills-deprecation-seks-broker-auth`  
**Status:** Draft / Spike

---

## 1. Problem Statement

seksbot inherits two large subsystems from OpenClaw that don't fit our architecture:

1. **Skills system** — 52 bundled skill folders with SKILL.md files, a clawhub marketplace integration, skill installation/scanning/eligibility engine, remote node bin probing, frontmatter parsing, and workspace syncing. We want our own skill system, not OpenClaw's.

2. **Auth/config model** — API keys and OAuth tokens stored in `auth-profiles.json`, env vars, and config entries scattered across the agent dir. Each provider token lives on the machine. We want _all_ external auth to flow through the SEKS broker, with the broker token being the only secret the agent software holds.

---

## 2. Part 1: Skills Deprecation

### 2.1 What Exists Today

The skills system spans these files/dirs:

| Component            | Path                                   | Lines                  | Purpose                           |
| -------------------- | -------------------------------------- | ---------------------- | --------------------------------- |
| Bundled skills       | `skills/` (52 dirs)                    | ~52 SKILL.md + scripts | Skill definitions                 |
| Core types           | `src/agents/skills/types.ts`           | 88                     | SkillEntry, SkillSnapshot, etc.   |
| Config types         | `src/config/types.skills.ts`           | 30                     | SkillsConfig schema               |
| Workspace loader     | `src/agents/skills/workspace.ts`       | 440                    | Load/sync/filter/prompt skills    |
| Config/eligibility   | `src/agents/skills/config.ts`          | 172                    | shouldIncludeSkill, binary checks |
| Frontmatter parser   | `src/agents/skills/frontmatter.ts`     | ~100                   | Parse SKILL.md metadata           |
| Env overrides        | `src/agents/skills/env-overrides.ts`   | ~80                    | Apply skill env vars              |
| Plugin skills        | `src/agents/skills/plugin-skills.ts`   | ~60                    | Resolve plugin skill dirs         |
| Bundled dir resolver | `src/agents/skills/bundled-dir.ts`     | ~30                    | Find bundled skills path          |
| Bundled context      | `src/agents/skills/bundled-context.ts` | ~40                    | Bundled skill context             |
| Refresh/versioning   | `src/agents/skills/refresh.ts`         | ~50                    | Bump snapshot version             |
| Serialization        | `src/agents/skills/serialize.ts`       | ~30                    | Serialize by key                  |
| Skills re-export     | `src/agents/skills.ts`                 | 46                     | Barrel re-export                  |
| Install engine       | `src/agents/skills-install.ts`         | 571                    | brew/npm/go/uv installers         |
| Status display       | `src/agents/skills-status.ts`          | 316                    | CLI status formatting             |
| Remote skills        | `src/infra/skills-remote.ts`           | ~280                   | Remote node bin probing           |
| Skill scanner        | `src/security/skill-scanner.ts`        | ~100                   | Security scanning                 |
| System prompt        | `src/agents/system-prompt.ts`          | refs                   | clawhub link, skills section      |
| CLI                  | `src/cli/skills-cli.ts`                | ~200                   | `seksbot skills` commands         |

**Key integration points:**

- `buildWorkspaceSkillsPrompt()` → called from `system-prompt.ts` to inject `<available_skills>` into agent system prompt
- `resolveSkillsPromptForRun()` → called from `pi-embedded-runner/run/params.ts` for each agent run
- `loadWorkspaceSkillEntries()` → called from workspace loader and remote skills
- `syncSkillsToWorkspace()` → called during agent init to copy skills to workspace
- `buildWorkspaceSkillCommandSpecs()` → generates slash-command specs from skills
- `SkillsConfig` in `seksbotConfig` → config schema integration

### 2.2 Deprecation Strategy

**Phase 1: Gut the bundled skills (easy, do now)**

- Delete all 52 `skills/` directories
- Keep `skills/` as empty dir with a README pointing to seksbot skill format (TBD)
- Remove clawhub references from system prompt

**Phase 2: Hollow out the skills engine (medium, do now)**

- Replace `buildWorkspaceSkillsPrompt()` with a stub that returns empty prompt or reads a simple `skills/` dir with plain SKILL.md files (no frontmatter, no eligibility, no install specs)
- Replace `resolveSkillsPromptForRun()` with same stub
- Delete `skills-install.ts` entirely (571 lines — brew/npm/go/uv install logic)
- Delete `skills-remote.ts` entirely (280 lines — remote bin probing)
- Delete `skill-scanner.ts` (security scanning of skill scripts)
- Gut `skills-status.ts` to minimal status
- Remove `skills` CLI subcommand or reduce to listing workspace skills

**Phase 3: Leave hooks for seksbot skills (keep)**

- Keep `SkillsConfig` type (simplified) in config schema
- Keep `SkillEntry` / `SkillSnapshot` types (simplified)
- Keep `loadWorkspaceSkillEntries()` but simplify to just scan dirs for SKILL.md
- Keep the system prompt `<available_skills>` injection point
- Keep `buildWorkspaceSkillCommandSpecs()` for slash commands

### 2.3 What We Keep (Scaffolding)

```
src/agents/skills/
  types.ts          — simplified: { name, description, location }
  workspace.ts      — simplified: scan dir, read SKILL.md, format prompt
  config.ts         — simplified: enabled/disabled per skill
src/config/types.skills.ts  — simplified SkillsConfig
skills/                     — empty, ready for seksbot-native skills
```

### 2.4 Estimated Effort

| Task                  | Lines removed | Complexity                             |
| --------------------- | ------------- | -------------------------------------- |
| Delete `skills/` dirs | ~5000         | Trivial                                |
| Delete install engine | 571           | Low (no callers outside skills)        |
| Delete remote skills  | 280           | Low (one integration point in gateway) |
| Delete skill scanner  | 100           | Trivial                                |
| Simplify workspace.ts | ~300 removed  | Medium (touch prompt pipeline)         |
| Simplify config types | ~20           | Low                                    |
| Remove clawhub refs   | ~5            | Trivial                                |
| Fix broken imports    | ?             | Medium (grep and fix)                  |

**Total: ~1-2 days of focused work.**

---

## 3. Part 2: SEKS Broker-Based Auth

### 3.1 Current Auth Architecture

```
┌─────────────────────────────────────────────┐
│  seksbot agent process                       │
│                                              │
│  config.yaml                                 │
│    auth.profiles: { anthropic: {api_key} }   │
│    env.vars: { OPENAI_API_KEY: "sk-..." }    │
│    channels.discord.token: "Bot ..."         │
│    channels.telegram.token: "123:ABC..."     │
│                                              │
│  auth-profiles.json                          │
│    { "anthropic-default": { key: "sk-..." }} │
│                                              │
│  Environment variables                       │
│    ANTHROPIC_API_KEY, DISCORD_TOKEN, etc.    │
└──────────────┬──────────────────────────────┘
               │ direct API calls with embedded keys
               ▼
         Provider APIs (Anthropic, OpenAI, Discord, etc.)
```

**Problems:**

- Every token lives on the agent machine in plaintext (config, env, auth-profiles.json)
- Each agent machine needs its own copy of every credential
- No centralized revocation or rotation
- Agent process has direct access to raw API keys
- Compromised agent = compromised keys

### 3.2 Target Architecture: SEKS Broker

```
┌─────────────────────────────────┐
│  seksbot agent process           │
│                                  │
│  Only secret: SEKS_BROKER_TOKEN  │
│  (scoped, revocable, per-agent)  │
│                                  │
│  All API calls go through:       │
│    broker.seks.example/v1/proxy  │
└──────────────┬───────────────────┘
               │ SEKS_BROKER_TOKEN in header
               ▼
┌──────────────────────────────────┐
│  SEKS Broker                      │
│                                   │
│  - Validates agent token          │
│  - Looks up allowed providers     │
│  - Injects real API key           │
│  - Proxies request to provider    │
│  - Logs usage / rate limits       │
│  - Scrubs keys from responses     │
│                                   │
│  Credential store (encrypted):    │
│    anthropic → sk-ant-...         │
│    openai → sk-...                │
│    discord → Bot ...              │
│    telegram → 123:ABC...          │
└──────────────┬───────────────────┘
               │ real API keys
               ▼
         Provider APIs
```

### 3.3 What Needs to Change

#### 3.3.1 Model/Provider Auth (`src/agents/auth-profiles/`, `src/agents/model-auth.ts`)

**Current:** `getApiKeyForModel()` reads from auth-profiles.json, env vars, or config.  
**Target:** `getApiKeyForModel()` returns the SEKS broker token + sets base URL to broker proxy endpoint.

Implementation approach:

```typescript
// When SEKS_BROKER_TOKEN is set, ALL provider auth resolves to:
{
  apiKey: process.env.SEKS_BROKER_TOKEN,
  baseUrl: `${SEKS_BROKER_URL}/v1/proxy/${providerId}`,
}
```

The broker receives the request, validates the agent token, injects the real provider key, and forwards. The agent never sees the real key.

#### 3.3.2 Channel Auth (Discord, Telegram, Slack, Signal, etc.)

**Current:** Each channel reads its token from config (`channels.discord.token`).  
**Target:** Channel tokens retrieved from broker at startup via authenticated API call.

```typescript
// At gateway start:
const channelTokens = await seksBroker.getChannelTokens(SEKS_BROKER_TOKEN);
// Returns: { discord: "Bot ...", telegram: "123:ABC..." }
// Injected into channel config in-memory, never written to disk
```

#### 3.3.3 Config Simplification

**Current `config.yaml`:**

```yaml
auth:
  profiles:
    anthropic-default:
      provider: anthropic
      mode: api_key
env:
  vars:
    ANTHROPIC_API_KEY: "sk-ant-..."
channels:
  discord:
    token: "Bot ..."
```

**Target `config.yaml`:**

```yaml
seks:
  broker:
    url: "https://broker.seks.local"
    token: "seks_agent_footgun_..." # or read from seksh
    # OR:
    tokenCommand: "seksh get-token" # shell-out to seksh
channels:
  discord:
    # no token here — broker provides it
    guildId: "1467558890484011223"
```

#### 3.3.4 `seksh` Integration

For machines where even the broker token shouldn't be in config:

```yaml
seks:
  broker:
    tokenCommand: "seksh get-token --agent footgun"
```

`seksh` handles the local key material (hardware keychain, TPM, etc.). The agent calls it once at startup to get its broker token, then uses that for everything.

### 3.4 Broker Data Model

Secrets in the broker are **not** opaque key bags. They follow a structured model:

#### Scoping

- **Account-global secrets** — shared across all agents in the account (e.g., the Anthropic API key, the Discord bot token). Can be mapped to any agent via grants.
- **Agent-scoped secrets** — belong to a specific agent only (e.g., an agent-specific OAuth refresh token, a per-agent webhook secret).

#### Per-API Secrets (Structured)

- Secrets are organized **per-API** with standardized naming. The user doesn't choose key names — the broker defines the schema for each API (e.g., `anthropic` requires `api_key`; `discord` requires `bot_token`; `openai` requires `api_key` + optional `org_id`).
- **Agents are not granted secrets directly.** Instead, agents are granted **capabilities** — permission to use specific API calls or functions. The broker resolves which secrets are needed to fulfill a capability grant.

Example:

```
# Account-global API secret
anthropic:
  api_key: "sk-ant-..."       # standardized field name

# Agent capability grant (not a secret grant)
agent "footgun":
  capabilities:
    - anthropic/messages.create    # can call the messages API
    - anthropic/models.list        # can list models
    - discord/messages.send        # can send Discord messages
    # NOT: "here's the anthropic key" — the broker injects it
```

#### Free-Form Secrets

- Key-value pairs with a defined prefix (e.g., `custom/` or `freeform/`).
- Can be account-global or agent-scoped.
- For non-standardized integrations, user scripts, etc.
- Retrieved via `seksh get custom/my-webhook-secret` or broker API.

```
# Free-form examples
custom/my-webhook-secret: "abc123"           # account-global
agent "footgun":
  custom/deploy-token: "ghp_..."             # agent-scoped
```

### 3.5 Broker API Surface (Minimum Viable)

```
POST /v1/proxy/{provider}/*     — Proxy API call (broker injects credentials based on capability grants)
GET  /v1/tokens/channels        — Get channel tokens for this agent (based on granted capabilities)
GET  /v1/secrets/custom/{key}   — Get free-form secret (scoped to agent + account-global)
POST /v1/auth/verify             — Verify agent token is valid
GET  /v1/agent/capabilities      — List this agent's granted capabilities
```

### 3.5 Migration Path

| Phase | What                                                             | Risk                         |
| ----- | ---------------------------------------------------------------- | ---------------------------- |
| **0** | Add `seks.broker` config section, no behavior change             | None                         |
| **1** | If broker configured, model auth routes through broker proxy     | Low — fallback to local keys |
| **2** | If broker configured, channel tokens fetched from broker         | Medium — startup dependency  |
| **3** | Remove local auth-profiles.json support when broker is sole auth | High — breaking change       |
| **4** | `seksh` integration for broker token itself                      | Low — optional enhancement   |

### 3.6 Estimated Effort

| Task                          | Complexity | Notes                                   |
| ----------------------------- | ---------- | --------------------------------------- |
| Broker config schema          | Low        | Add to seksbotConfig                    |
| Model auth broker path        | Medium     | Modify `getApiKeyForModel` + base URL   |
| Channel token fetch           | Medium     | Each channel plugin needs a broker path |
| Broker server (separate repo) | **High**   | This is a whole service                 |
| seksh integration             | Medium     | Shell-out + caching                     |
| Tests                         | Medium     | Mock broker, test fallback              |

**Agent-side changes: ~1 week.**  
**Broker server: separate project, ~2-3 weeks for MVP.**

---

## 4. Spike Branch Plan

The spike branch (`spike/skills-deprecation-seks-broker-auth`) will:

### 4.1 Skills (implement on branch)

- [ ] Delete all 52 `skills/` directories, replace with `skills/README.md`
- [ ] Delete `src/agents/skills-install.ts`
- [ ] Delete `src/infra/skills-remote.ts`
- [ ] Delete `src/security/skill-scanner.ts`
- [ ] Simplify `src/agents/skills/workspace.ts` to basic dir scan
- [ ] Simplify `src/agents/skills/types.ts`
- [ ] Remove clawhub references from system prompt
- [ ] Fix all broken imports
- [ ] Verify build passes

### 4.2 SEKS Broker Auth (stub on branch)

- [ ] Add `seks.broker` config schema (`url`, `token`, `tokenCommand`)
- [ ] Add `src/seks/broker-client.ts` — client for broker API
- [ ] Add broker-aware path in `getApiKeyForModel()` (if broker configured, use proxy URL)
- [ ] Add broker-aware channel token resolution (stub)
- [ ] Add `src/seks/seksh.ts` — shell-out to seksh for token

---

## 5. Open Questions

1. **Broker hosting** — ✅ RESOLVED: Deployed in cloud at `https://seks-broker.stcredzero.workers.dev` (Cloudflare Workers). This is the "eat your own cooking" deployment.
2. **Broker implementation** — Separate repo? What language/framework? _(Awaiting Síofra's input)_
3. **Channel WebSocket connections** — Discord/Slack maintain persistent WebSocket connections. Can we proxy those through the broker, or does the agent need the raw token for WS? _(Awaiting Síofra's input)_
4. **Rate limiting** — Does the broker enforce per-agent rate limits? _(Awaiting Síofra's input)_
5. **Skill format / execution model** — ✅ RESOLVED: seksbot-native skills run as **sub-agents inside security-focused containers**. All software tools used by the sub-agent are required to use `seksh` or the SEKS broker proxy. No direct API key access inside the container. This makes skills sandboxed by default — the container is the security boundary, and the broker is the only way out.
6. ~~**Offline fallback**~~ — Not applicable for cloud-hosted broker. Agent requires broker connectivity.

---

## 6. Recommendation

**Do both, in order:**

1. **Skills deprecation first** (1-2 days) — Low risk, immediate reduction in inherited complexity. Keeps hooks for our own skill system.
2. **SEKS broker auth stubs** (2-3 days) — Add the config schema and client-side plumbing. The actual broker server is a separate project.
3. **Broker server** — Separate repo, separate design doc, separate timeline.

The spike branch proves the skills can be ripped out cleanly and that the auth path can be redirected to a broker without breaking the existing flow.

---

## 7. seksbot-Native Skill Execution Model

OpenClaw skills run in the agent's own process — same permissions, same keys, same machine. That's the opposite of what we want.

### Target: Containerized Sub-Agent Skills

```
┌────────────────────────────────────┐
│  seksbot agent (host)               │
│                                     │
│  Receives task → spawns sub-agent   │
│  in security-focused container      │
└──────────────┬──────────────────────┘
               │ spawn
               ▼
┌────────────────────────────────────┐
│  Container (skill sandbox)          │
│                                     │
│  Sub-agent runs skill logic         │
│  ALL external calls go through:     │
│    - seksh (local key material)     │
│    - SEKS broker proxy (API calls)  │
│                                     │
│  No raw API keys in container       │
│  No direct network to providers     │
│  Scoped broker token per-skill-run  │
└─────────────────────────────────────┘
```

### Properties

- **Isolation:** Each skill run is containerized — can't read host filesystem, other agents' state, or raw credentials
- **Least privilege:** Scoped broker token grants only the providers/permissions that skill needs
- **Auditable:** All API calls flow through broker → logged per-agent, per-skill
- **Ephemeral:** Container is destroyed after skill completes — no persistent state leakage
- **Composable:** Skills are just sub-agent tasks with a container spec + broker scope definition
