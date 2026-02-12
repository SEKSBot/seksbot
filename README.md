# 🦞 seksbot

<p align="center">
  <strong>Secure Environment for Key Services</strong>
</p>

<p align="center">
  <a href="https://github.com/seksbot/seksbot/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/seksbot/seksbot/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/seksbot/seksbot/releases"><img src="https://img.shields.io/github/v/release/seksbot/seksbot?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

**seksbot** is a hard fork of [OpenClaw](https://github.com/openclaw/openclaw) focused on making AI agents safe for production use. OpenClaw showed the world what personal AI agents can do. seksbot is building the infrastructure to make them trustworthy.

## The Problem

AI agents are powerful — but giving them access to your APIs, credentials, and services means giving them your keys. Today, most agent setups have:

- **Secrets in environment variables** — agents can read (and leak) every API key
- **No audit trail** — no record of what an agent accessed or when
- **No granular permissions** — it's all-or-nothing access

## What We're Building

| Component       | What it does                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **seksbot**     | Hard fork of OpenClaw — the agent runtime                                                                                                  |
| **seksh**       | Nushell fork with broker integration. Secure commands enable powerful agent scripting with zero access to keys.                            |
| **seks-broker** | Secret broker that injects credentials at the network layer. Agents request secrets by name, never see the values. Every access is logged. |

```bash
# Agent can list what's available, not the values
listseks
STRIPE_KEY, OPENAI_KEY, GITHUB_PAT...

# Use secrets without seeing them
seksh-http get api.stripe.com/v1/charges --auth-bearer <secret:STRIPE_KEY>
→ 200 OK  {"data": [...]}

# Broker logs every access — compliance built in
[audit] agent:aeonbyte accessed STRIPE_KEY at 2026-02-12T13:42:00Z
```

## Status

**Active development.** The broker is live. We have four agents running 24/7 on this infrastructure.

seksbot tracks OpenClaw upstream and inherits its full feature set: multi-channel messaging (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, etc.), voice, canvas, browser control, cron, multi-agent sessions, and the skills platform.

## Fork Relationship

seksbot is a hard fork of OpenClaw. For the time being, most setup and configuration documentation lives in the [OpenClaw docs](https://docs.openclaw.ai). We sync regularly from upstream.

**What's different:**

- SEKS Broker integration for zero-knowledge secret access
- seksh shell with broker-aware commands
- New skills format (complete revamp in progress — see `skills/README.md`)
- Security-first defaults for multi-agent deployments

## Quick Start

Runtime: **Node ≥ 22**

```bash
# Clone and build
git clone https://github.com/SEKSBot/seksbot.git
cd seksbot
pnpm install
pnpm build

# Run the onboarding wizard
pnpm seksbot onboard --install-daemon

# Or start the gateway directly
pnpm seksbot gateway --port 18789
```

For detailed setup, channels, and configuration: see the [OpenClaw docs](https://docs.openclaw.ai/start/getting-started) (applies to seksbot with minor differences).

## Skills

We're completely revamping the skills system. OpenClaw skills relied on CLI tools installed on the host with markdown instruction files. We're moving to a structured, broker-integrated format with proper manifests and sandboxed execution. See [`skills/README.md`](skills/README.md) for the new direction.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Acknowledgments

seksbot wouldn't exist without [OpenClaw](https://github.com/openclaw/openclaw) by Peter Steinberger and the OpenClaw community. We're grateful for the foundation.

## License

[MIT](LICENSE)
