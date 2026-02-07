# Security Model

Seksbot implements a **defense-in-depth** security architecture with three primary layers.

---

## The Prepared Statement Analogy

Just as SQL prepared statements prevent injection by separating query structure from data:

```sql
-- ❌ Unsafe: string concatenation
"SELECT * FROM users WHERE id = " + userInput

-- ✅ Safe: prepared statement  
"SELECT * FROM users WHERE id = ?" + [userInput]
```

Seksbot separates command structure from secrets:

```bash
# ❌ Unsafe: shell interpolation (OpenClaw default)
curl -H "Bearer $TOKEN" https://api.example.com

# ✅ Safe: broker injection (Seksbot)
Agent: {"template": "api_call", "params": {"url": "https://api.example.com"}}
Broker: Injects Authorization header, executes, scrubs output
```

---

## Layer 1: Tool Allowlist

**Default: DENY ALL**

Only explicitly approved tools can execute. Each tool is classified:

| Classification | Description | Approval |
|---------------|-------------|----------|
| `safe` | Read-only, no secrets | Auto-approved |
| `sensitive` | Touches secrets or network | Requires allowlist |
| `dangerous` | System modification, arbitrary exec | Blocked by default |

---

## Layer 2: Command Templates

No arbitrary shell commands. All execution uses predefined templates:

```typescript
// Template definition
{
  name: "git_clone",
  pattern: "git clone {url} {dest}",
  params: {
    url: { type: "url", allowlist: ["github.com", "gitlab.com"] },
    dest: { type: "path", validate: "no_traversal" }
  },
  classification: "safe"
}
```

Templates enforce:
- **Type validation** — URLs, paths, strings with patterns
- **Length limits** — Prevent buffer attacks  
- **Allowlists** — Restrict to known-good values
- **No shell metacharacters** — `;`, `|`, `$()`, backticks blocked

---

## Layer 3: Credential Broker

Secrets never touch agent memory. The broker:

1. **Receives** requests with `<secret:name>` markers
2. **Resolves** markers to actual credentials from secure storage
3. **Injects** credentials at the HTTP layer (not shell interpolation)
4. **Executes** the request
5. **Scrubs** output for any leaked credentials
6. **Returns** sanitized results to agent

### Scrubbing Modes

| Mode | Catches |
|------|---------|
| Literal | Exact credential matches |
| Base64 | Base64-encoded credentials |
| Hex | Hex-encoded credentials |
| Partial | Credential substrings (configurable) |

---

## Dangerous Pattern Detection

The exec hardening layer detects and blocks:

### Network Exfiltration
- `curl -d`, `curl --data`
- `wget --post-data`
- `nc` (netcat)

### Credential Exposure
- `env`, `printenv`
- `echo $VAR` patterns
- Process listing with environment

### System Modification
- `rm -rf /`
- `chmod 777`
- `chown` on system paths

### Code Injection
- `eval`
- `sh -c`
- Backticks and `$()`

---

## Policy Modes

| Mode | Behavior |
|------|----------|
| `strict` | Templates only, no exceptions |
| `moderate` | Templates + allowlisted raw commands |
| `permissive` | Warning mode (logs but doesn't block) |

**Default: `strict`**

---

## Audit Logging

All security events are logged:

```json
{
  "timestamp": "2026-02-07T08:00:00Z",
  "event": "exec_blocked",
  "reason": "dangerous_pattern",
  "pattern": "network_exfil",
  "command": "curl -d @/etc/passwd ...",
  "agent_session": "abc123"
}
```

---

## Next Steps

- [Command Templates Reference](./command-templates.md)
- [Credential Broker Setup](./credential-broker.md)
- [Migration from OpenClaw](./migration.md)
