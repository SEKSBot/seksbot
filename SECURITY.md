# Seksbot Security Model

**Secure Execution Kernel Shell Bot**  
*A security-hardened fork of OpenClaw*

---

## Core Principle

Like SQL prepared statements separate query structure from data, Seksbot separates command structure from secrets.

**Agents never see credential values.**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        AGENT                                │
│  (writes commands, sees only sanitized output)              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      SEKSBOT                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ LAYER 1: Tool Allowlist                             │   │
│  │   • Approved tools only (no arbitrary exec)         │   │
│  │   • Each tool has a security classification         │   │
│  │   • Default: DENY ALL                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ LAYER 2: Command Templates                          │   │
│  │   • Predefined command patterns                     │   │
│  │   • Parameters validated against schema             │   │
│  │   • No shell metacharacter interpretation           │   │
│  │   • Direct execve() with argv array                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ LAYER 3: Credential Broker                          │   │
│  │   • Injects auth headers at HTTP layer              │   │
│  │   • Agent never sees secret values                  │   │
│  │   • Scrubs any leaked values from output            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Properties

### What Seksbot Prevents

| Attack Vector | How Prevented |
|---------------|---------------|
| Credential theft via env vars | Credentials in broker, not environment |
| Credential theft via shell interpolation | No arbitrary shell execution |
| Credential theft via output | Output scrubbing |
| Command injection | Template-based execution only |
| Header injection | Broker constructs headers |
| Arbitrary code execution | Tool allowlist |

### What's Structurally Safe

REST APIs with header-based auth are inherently safe — agent-controlled data cannot become HTTP headers.

| Integration | Auth Location | Data Location | Status |
|-------------|---------------|---------------|--------|
| Telegram | URL path | JSON body | ✅ Safe |
| Anthropic | Header | JSON body | ✅ Safe |
| OpenAI | Header | JSON body | ✅ Safe |
| Discord | Header | JSON body | ✅ Safe |
| Google APIs | Header | JSON body | ✅ Safe |
| GitHub API | Header | JSON body | ✅ Safe |

### What Requires Special Handling

| Surface | Risk | Mitigation |
|---------|------|------------|
| Shell exec | Command injection | Template broker only |
| SMTP email | Header injection | Gmail API only |
| AppleScript | Code injection | Avoid entirely |

---

## Implementation Details

### Layer 1: Tool Allowlist

```yaml
# seksbot.security.yaml
tools:
  exec:
    mode: template  # "template" | "allowlist" | "deny"
    templates:
      - git_status
      - git_commit
      - npm_install
    allowlist: []   # Raw commands (if mode=allowlist)
  
  http:
    mode: broker    # All HTTP goes through credential broker
  
  file:
    mode: sandbox   # Restricted to workspace
```

### Layer 2: Command Templates

```yaml
# templates/git.yaml
templates:
  git_status:
    command: ["git", "status"]
    params: {}
    
  git_commit:
    command: ["git", "commit", "-m", "{message}"]
    params:
      message:
        type: string
        maxLength: 500
        sanitize: true
```

Agent invokes:
```json
{"template": "git_commit", "params": {"message": "fix bug"}}
```

Broker executes:
```
execve("git", ["git", "commit", "-m", "fix bug"])
```

No shell parsing. Semicolons in message are just characters.

### Layer 3: Credential Broker

```
Agent Request:
POST /api/github/repos
{"owner": "user", "repo": "project"}

Broker:
1. Validates request against schema
2. Fetches github_token from vault
3. Constructs HTTP request:
   GET https://api.github.com/repos/user/project
   Authorization: Bearer ghp_xxx...
4. Executes request
5. Scrubs response (in case token echoed)
6. Returns to agent
```

---

## Credential Storage

Credentials are **never** stored in:
- ❌ Environment variables
- ❌ Config files accessible to agent
- ❌ Shell history
- ❌ Log files

Credentials are stored in:
- ✅ External broker (seks-broker)
- ✅ OS keychain (optional)
- ✅ Hardware security module (future)

---

## Output Scrubbing

All output flowing back to agent is scrubbed:

1. **Literal match** — Known secret values replaced with `<secret:name>`
2. **Base64 detection** — Base64-encoded secrets caught
3. **Hex detection** — Hex-encoded secrets caught
4. **Pattern match** — Common credential patterns (API keys, tokens)

---

## Threat Model

### In Scope

- Malicious prompts attempting credential exfiltration
- Command injection via user-controlled input
- Output-based data exfiltration
- Header injection attacks

### Out of Scope (Known Limitations)

- Timing side channels
- Single-character oracle attacks
- Exotic encodings (rot13, custom ciphers)
- Compromised model weights
- Physical access to host

---

## Security Reporting

Found a vulnerability? Contact: security@rotcsgame.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

---

## Changelog

- **2026-02-07**: Initial security model documentation
- Fork from OpenClaw with security-first architecture

---

*Document maintained as part of Seksbot project*
