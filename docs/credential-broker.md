# Credential Broker

The credential broker is the heart of Seksbot's security model. It ensures secrets never enter agent-accessible memory.

---

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│    Agent    │────▶│   Seksbot    │────▶│    Broker    │
│  (untrusted)│     │  (gateway)   │     │  (trusted)   │
└─────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │ Request with       │ Forward with       │ Resolve secrets,
       │ <secret:name>      │ secret markers     │ execute, scrub
       │ markers            │                    │
       ▼                    ▼                    ▼
   Never sees           Passes through       Has access to
   actual secrets       markers only         credential store
```

---

## Broker Types

### Local Broker (Default)

Credentials stored in environment or encrypted local file:

```yaml
credentials:
  broker: local
  store: env  # or 'file'
  secrets:
    github_token: GITHUB_TOKEN  # env var name
    openai_key: OPENAI_API_KEY
```

### Cloudflare Workers Broker

Credentials stored in Cloudflare Workers secrets:

```yaml
credentials:
  broker: cloudflare
  worker_url: https://seks-broker.your-account.workers.dev
  auth: <secret:broker_auth>  # Meta-credential for broker access
```

### Vault Broker (Coming Soon)

HashiCorp Vault integration:

```yaml
credentials:
  broker: vault
  address: https://vault.example.com
  auth:
    method: approle
    role_id: <secret:vault_role>
    secret_id: <secret:vault_secret>
```

---

## Using Secret Markers

In templates and commands, use markers instead of actual values:

```typescript
// Agent requests
{
  template: "http_auth",
  params: {
    url: "https://api.github.com/user",
    auth: "<secret:github_token>"
  }
}

// Broker resolves and executes
curl -H "Authorization: Bearer ghp_xxxxx" https://api.github.com/user

// Agent receives (scrubbed)
{ "login": "myuser", "id": 12345, ... }
```

---

## Output Scrubbing

The broker scrubs all output before returning to the agent:

### Literal Matching
Exact credential values are replaced:

```
Before: "Token: ghp_abc123xyz"
After:  "Token: [REDACTED:github_token]"
```

### Base64 Matching
Base64-encoded credentials are caught:

```
Before: "Auth: Z2hwX2FiYzEyM3h5eg=="
After:  "Auth: [REDACTED:github_token:base64]"
```

### Partial Matching (Configurable)
For high-security environments:

```yaml
scrubbing:
  partial_match: true
  min_length: 8  # Match substrings of 8+ chars
```

---

## HTTP Header Injection

For REST APIs, the broker injects auth headers directly:

```typescript
// Agent request
{
  template: "http_auth",
  params: {
    url: "https://api.stripe.com/v1/customers",
    method: "GET",
    auth_header: "<secret:stripe_key>"
  }
}

// Broker constructs
GET /v1/customers HTTP/1.1
Host: api.stripe.com
Authorization: Bearer sk_live_xxxxx  // Injected, never visible to agent

// Agent sees only the response body
```

---

## Security Properties

| Property | Guarantee |
|----------|-----------|
| **Isolation** | Secrets never in agent memory or context |
| **Injection-proof** | Headers injected at HTTP layer, not shell |
| **Audit trail** | All secret access logged |
| **Revocation** | Rotate credentials without agent restart |
| **Least privilege** | Agents only access secrets they need |

---

## Configuring Access Control

Limit which secrets each agent session can access:

```yaml
agents:
  default:
    allowed_secrets:
      - github_token  # Read-only
      - slack_webhook
      
  admin:
    allowed_secrets: "*"  # All secrets (use carefully)
```

---

## Audit Logging

All credential access is logged:

```json
{
  "timestamp": "2026-02-07T10:30:00Z",
  "event": "secret_access",
  "secret": "github_token",
  "operation": "http_header_inject",
  "target_url": "https://api.github.com/user",
  "agent_session": "sess_abc123",
  "result": "success"
}
```

---

## Best Practices

1. **Use the Cloudflare broker for production** — Secrets never touch your machine
2. **Rotate credentials regularly** — Broker makes this seamless
3. **Enable partial matching** — Catches creative exfiltration attempts
4. **Review audit logs** — Detect unusual access patterns
5. **Principle of least privilege** — Only grant secrets agents actually need

---

## Next Steps

- [Security Model](./security-model.md)
- [Command Templates](./command-templates.md)
- [Migration from OpenClaw](./migration.md)
