# Security Policy

If you believe you've found a security issue in seksbot, please report it privately.

## Reporting

Open a [GitHub Security Advisory](https://github.com/SEKSBot/seksbot/security/advisories/new) or email the maintainers directly.

Include: reproduction steps, impact assessment, and (if possible) a minimal PoC.

**For issues in the core runtime** (inherited from OpenClaw): please also report upstream at the [OpenClaw Trust page](https://trust.openclaw.ai).

## Bug Bounties

There is no bug bounty program at this time. Please still disclose responsibly so we can fix issues quickly. PRs welcome.

## Out of Scope

- Public internet exposure (seksbot is designed for local/tailnet use)
- Prompt injection attacks
- Using seksbot in ways the docs recommend against

## Operational Guidance

For threat model and hardening guidance, see the [OpenClaw security docs](https://docs.openclaw.ai/gateway/security) (applies to seksbot).

### Web Interface Safety

The web interface is intended for local use only. Do **not** bind it to the public internet.

## Runtime Requirements

### Node.js Version

seksbot requires **Node.js 22.12.0 or later** (LTS).

```bash
node --version  # Should be v22.12.0 or later
```

### Docker Security

When running in Docker:

1. The image runs as a non-root user (`node`)
2. Use `--read-only` flag when possible
3. Limit container capabilities with `--cap-drop=ALL`

## Security Scanning

This project uses `detect-secrets` for automated secret detection in CI/CD.

```bash
pip install detect-secrets==1.5.0
detect-secrets scan --baseline .secrets.baseline
```
