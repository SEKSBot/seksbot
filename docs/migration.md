# Migration from OpenClaw

This guide helps you migrate from OpenClaw to Seksbot while maintaining functionality.

---

## Overview

Seksbot is a **conservative fork** of OpenClaw. Most features work identically. The main differences are in how credentials and shell execution are handled.

---

## Step 1: Backup Your Config

```bash
# Backup your OpenClaw configuration
cp -r ~/.openclaw ~/.openclaw-backup
```

---

## Step 2: Install Seksbot

```bash
# Clone Seksbot
git clone https://github.com/rotcsgame/seksbot.git
cd seksbot

# Install dependencies
npm install

# Build
npm run build

# Link globally (optional)
npm link
```

---

## Step 3: Migrate Configuration

Your existing OpenClaw config will mostly work. Key changes:

### Credentials

**Before (OpenClaw):**
```yaml
# Credentials in config or environment
env:
  GITHUB_TOKEN: ghp_xxxxx
  OPENAI_API_KEY: sk-xxxxx
```

**After (Seksbot):**
```yaml
# Credentials reference the broker
credentials:
  github_token:
    broker: local  # or 'cloudflare', 'vault'
    key: GITHUB_TOKEN
  openai_key:
    broker: local
    key: OPENAI_API_KEY
```

### Exec Commands

**Before (OpenClaw):**
```yaml
# Arbitrary shell allowed
exec:
  mode: permissive
```

**After (Seksbot):**
```yaml
# Template-based execution
exec:
  mode: strict  # or 'moderate'
  templates:
    - git
    - npm
    - file_ops
```

---

## Step 4: Review Your Skills

Skills that use arbitrary shell commands need updating:

### Before
```typescript
// Direct shell execution
await exec({ command: `curl -H "Authorization: Bearer ${token}" ${url}` });
```

### After
```typescript
// Template-based execution
await exec({
  template: "http_get",
  params: {
    url: url,
    auth: "<secret:api_token>"  // Broker resolves this
  }
});
```

---

## Step 5: Test in Permissive Mode

Start with warnings only:

```yaml
exec:
  mode: permissive  # Logs but doesn't block
```

Review logs for blocked commands, then update your workflows.

---

## Step 6: Enable Strict Mode

Once everything works:

```yaml
exec:
  mode: strict
```

---

## Common Migration Issues

### "Command not in allowlist"

Add the command template to your config:

```yaml
exec:
  templates:
    - name: my_custom_command
      pattern: "myapp {action} {target}"
      params:
        action: { type: "string", allowlist: ["start", "stop"] }
        target: { type: "string" }
```

### "Credential not found"

Register the credential with the broker:

```yaml
credentials:
  my_api_key:
    broker: local
    key: MY_API_KEY  # Environment variable name
```

### "Dangerous pattern detected"

Review the command — it may be genuinely risky. If it's safe:

```yaml
exec:
  allowed_patterns:
    - "curl.*example\\.com"  # Allowlist specific patterns
```

---

## Rollback

If you need to go back:

```bash
# Restore OpenClaw config
cp -r ~/.openclaw-backup ~/.openclaw

# Use OpenClaw
openclaw gateway start
```

---

## Getting Help

- [GitHub Discussions](https://github.com/rotcsgame/seksbot/discussions)
- [Security Model Documentation](./security-model.md)
- [Command Templates Reference](./command-templates.md)
