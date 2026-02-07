# 🛡️ Seksbot

**Secure Execution Kernel Shell Bot**  
*A security-hardened fork of OpenClaw*

[![Security](https://img.shields.io/badge/security-hardened-green)](./SECURITY.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

---

## What is Seksbot?

Seksbot is a fork of [OpenClaw](https://github.com/openclaw/openclaw) with security as the primary design goal. It implements the SEKS (Secure Execution Kernel for Shells) architecture to ensure:

**Agents can use authenticated tools without ever seeing credentials.**

## Core Security Features

| Feature | Description |
|---------|-------------|
| 🔐 **Credential Isolation** | Secrets never enter agent-accessible memory |
| 📋 **Command Templates** | No arbitrary shell execution — only predefined patterns |
| 🛡️ **Structural Safety** | REST APIs with header-based auth enforced everywhere |
| 🧹 **Output Scrubbing** | Leaked credentials caught and redacted |

## Quick Comparison

| Aspect | OpenClaw | Seksbot |
|--------|----------|---------|
| Exec model | Arbitrary shell | Allowlist + templates |
| Credentials | In config/env | Broker-injected at runtime |
| HTTP auth | Agent builds headers | Broker injects headers |
| Default stance | Permissive | Deny by default |

## Installation

```bash
# Clone the repository
git clone https://github.com/rotcsgame/seksbot.git
cd seksbot

# Install dependencies
npm install

# Build
npm run build

# Run
./seksbot.mjs gateway start
```

## Security Model

See [SECURITY.md](./SECURITY.md) for the full security architecture.

### The Prepared Statement Analogy

Just as SQL prepared statements prevent injection by separating query structure from data:

```sql
-- Unsafe: string concatenation
"SELECT * FROM users WHERE id = " + userInput

-- Safe: prepared statement
"SELECT * FROM users WHERE id = ?" + [userInput]
```

Seksbot separates command structure from secrets:

```
-- Unsafe: shell interpolation
curl -H "Bearer $TOKEN" https://api.example.com

-- Safe: broker injection
Agent: {"template": "api_call", "params": {"url": "https://api.example.com"}}
Broker: Injects Authorization header, executes, scrubs output
```

## Architecture

```
AGENT (writes commands, sees only sanitized output)
    │
    ▼
SEKSBOT
  ├─ LAYER 1: Tool Allowlist
  │    • Approved tools only
  │    • Default: DENY ALL
  │
  ├─ LAYER 2: Command Templates
  │    • Predefined patterns
  │    • Schema validation
  │    • No shell metacharacters
  │
  └─ LAYER 3: Credential Broker
       • HTTP header injection
       • Output scrubbing
       • Audit logging
    │
    ▼
EXTERNAL SERVICES
```

## Related Projects

- **[seksh](https://github.com/rotcsgame/seksh)** — Secure shell (nushell fork) with credential isolation
- **seks-broker** — Cloudflare Workers credential broker
- **[OpenClaw](https://github.com/openclaw/openclaw)** — Upstream project

## Roadmap

- [x] Fork OpenClaw
- [x] Security architecture documentation
- [ ] Command template system
- [ ] Exec allowlist implementation
- [ ] Credential broker integration
- [ ] Output scrubbing
- [ ] Security audit

## Contributing

Security-focused contributions welcome. See [SECURITY.md](./SECURITY.md) for guidelines.

Priority areas:
1. Exec hardening
2. Credential broker integration
3. Output scrubbing
4. Security audit tooling

## License

MIT (same as OpenClaw)

---

*Built with 🌿 by the Seksbot team*
