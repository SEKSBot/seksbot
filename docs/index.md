# Seksbot Documentation

**Secure Execution Kernel Shell Bot** — A security-hardened fork of OpenClaw

---

## Why Seksbot?

OpenClaw is powerful, but its permissive security model creates risks:

- **Arbitrary shell execution** — Agents can run any command
- **Credential exposure** — API keys pass through agent-visible channels  
- **No output scrubbing** — Leaked secrets appear in logs and responses

**Seksbot fixes this** with a security-first architecture.

---

## Core Security Features

| Feature | Description |
|---------|-------------|
| 🔐 **Credential Isolation** | Secrets never enter agent-accessible memory |
| 📋 **Command Templates** | No arbitrary shell — only predefined patterns |
| 🛡️ **Structural Safety** | REST APIs with broker-injected auth headers |
| 🧹 **Output Scrubbing** | Leaked credentials caught and redacted |

---

## Quick Start

```bash
# Clone
git clone https://github.com/rotcsgame/seksbot.git
cd seksbot

# Install
npm install

# Build
npm run build

# Run
./seksbot.mjs gateway start
```

---

## Documentation

- [Security Model](./security-model.md) — How credential isolation works
- [Command Templates](./command-templates.md) — Using the template system
- [Migration Guide](./migration.md) — Moving from OpenClaw to Seksbot
- [API Reference](./api.md) — Tool and configuration reference

---

## Comparison: OpenClaw vs Seksbot

| Aspect | OpenClaw | Seksbot |
|--------|----------|---------|
| Exec model | Arbitrary shell | Allowlist + templates |
| Credentials | In config/env | Broker-injected at runtime |
| HTTP auth | Agent builds headers | Broker injects headers |
| Default stance | Permissive | Deny by default |

---

## The CVE-2026-25253 Response

Seksbot was created in direct response to the security vulnerabilities disclosed in OpenClaw. Our architecture addresses:

- **Command injection** — Template-based execution prevents shell metacharacter attacks
- **Credential theft** — Broker pattern keeps secrets out of agent memory
- **Exfiltration** — Output scrubbing catches leaked credentials before they reach the agent

---

## Links

- [GitHub Repository](https://github.com/rotcsgame/seksbot)
- [Security Documentation](https://github.com/rotcsgame/seksbot/blob/main/SECURITY.md)
- [Roadmap](https://www.notion.so/Seksbot-Roadmap-3004e31c2611817da601e8794ff45771)
- [OpenClaw (upstream)](https://github.com/openclaw/openclaw)

---

*Built with 🛡️ by the Seksbot team*
