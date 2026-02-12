# seksbot Skills Format

## Overview

A seksbot skill is a directory containing:
- `skill.yaml` (or `skill.yml` or `skill.json`) — the manifest
- `SKILL.md` — instructions for the agent (what the skill does, when to use it)

Skills are containerized sub-agent tasks. They declare what capabilities they need, and the SEKS broker enforces access.

## Manifest Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique name, lowercase kebab-case (`a-z`, `0-9`, hyphens) |
| `description` | string | What the skill does (≤200 chars, shown in system prompt) |
| `capabilities` | list | API capabilities and custom secrets the skill requires |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | number | `1` | Manifest format version |
| `emoji` | string | — | Display emoji |
| `author` | string | — | Skill author |
| `always` | boolean | `false` | Always show in system prompt (vs. conditional) |
| `os` | list | — | OS restrictions (e.g., `["darwin", "linux"]`) |
| `skillMdPath` | string | `SKILL.md` | Custom path to skill instructions |
| `container_image` | string | default runner | Container image |
| `container_timeout` | number | `300` | Execution timeout (seconds) |
| `container_network` | string | `broker-only` | Network policy: `broker-only` or `none` |
| `container_memory` | string | — | Memory limit (e.g., `512m`) |
| `container_cpu` | string | — | CPU limit (e.g., `1.0`) |

## Capabilities

Capabilities declare what external access the skill needs. The SEKS broker enforces these — the skill never gets raw API keys.

### API Capabilities

Format: `provider/endpoint`

```yaml
capabilities:
  - anthropic/messages.create    # Can call Anthropic messages API
  - openai/chat.completions      # Can call OpenAI chat API
  - discord/messages.send        # Can send Discord messages
```

The broker maps these to the real API keys stored in its credential store. The skill's container gets a scoped broker token that only allows the declared capabilities.

### Custom Secrets

Format: `custom/key-name`

```yaml
capabilities:
  - custom/my-webhook-secret     # Free-form secret
  - custom/deploy-token          # Another free-form secret
```

Retrieved inside the container via `seksh get custom/my-webhook-secret` or the broker API.

## Example

```yaml
# skill.yaml
version: 1
name: weather-lookup
description: Get current weather and forecasts for any location
emoji: "🌤"
author: FootGun
capabilities:
  - custom/openweathermap-api-key
container_network: broker-only
container_timeout: 30
```

```markdown
<!-- SKILL.md -->
# Weather Lookup

Look up current weather and forecasts using OpenWeatherMap.

## When to Use
When someone asks about weather conditions or forecasts.

## How to Use
1. Get the API key: `seksh get custom/openweathermap-api-key`
2. Call the OpenWeatherMap API with the key
3. Return formatted weather data
```

## Skill Directories

Skills are loaded from:
1. `skills/` in the seksbot repo (bundled skills)
2. Agent workspace `skills/` directory (user skills)
3. Additional directories configured in `skills.load.extraDirs`

Later directories override earlier ones (by skill name).

## Security Model

- Skills run in **containers** — isolated from host, other agents, and raw credentials
- **Network is restricted** — `broker-only` means only the SEKS broker is reachable
- **Capabilities are enforced** — the broker validates every request against the skill's grants
- **Containers are ephemeral** — destroyed after execution, no persistent state
- **No raw API keys** — ever, anywhere in the container
