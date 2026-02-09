---
summary: "CLI reference for `seksbot doctor` (health checks + guided repairs)"
read_when:
  - You have connectivity/auth issues and want guided fixes
  - You updated and want a sanity check
title: "doctor"
---

# `seksbot doctor`

Health checks + quick fixes for the gateway and channels.

Related:

- Troubleshooting: [Troubleshooting](/gateway/troubleshooting)
- Security audit: [Security](/gateway/security)

## Examples

```bash
seksbot doctor
seksbot doctor --repair
seksbot doctor --deep
```

Notes:

- Interactive prompts (like keychain/OAuth fixes) only run when stdin is a TTY and `--non-interactive` is **not** set. Headless runs (cron, Telegram, no terminal) will skip prompts.
- `--fix` (alias for `--repair`) writes a backup to `~/.seksbot/seksbot.json.bak` and drops unknown config keys, listing each removal.

## macOS: `launchctl` env overrides

If you previously ran `launchctl setenv SEKSBOT_GATEWAY_TOKEN ...` (or `...PASSWORD`), that value overrides your config file and can cause persistent “unauthorized” errors.

```bash
launchctl getenv SEKSBOT_GATEWAY_TOKEN
launchctl getenv SEKSBOT_GATEWAY_PASSWORD

launchctl unsetenv SEKSBOT_GATEWAY_TOKEN
launchctl unsetenv SEKSBOT_GATEWAY_PASSWORD
```
