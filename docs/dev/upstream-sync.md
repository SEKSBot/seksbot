# Upstream Sync Guide

seksbot is forked from OpenClaw. We selectively absorb upstream improvements while maintaining our own architecture (skills deprecation, SEKS broker auth, branding).

## The Problem

Our rebrand (`openclaw→seksbot`) touched nearly every file. Direct cherry-picks from upstream produce conflicts on every commit — not because the code conflicts, but because the names differ.

## Solution: Rebranded Mirror

We maintain a `upstream-rebranded` branch — a copy of upstream with our branding transform applied. Cherry-picks from this branch apply cleanly.

```
upstream/main                    our main
     │                               │
     ▼                               │
upstream-rebranded ──cherry-pick──►  │
  (auto-rebranded)                   ▼
```

## Usage

### Rebuild the mirror (do this before each sync)

```bash
./scripts/upstream-sync.sh rebuild
```

This fetches `upstream/main`, creates `upstream-rebranded` with the branding transform, and switches back to your branch.

### Browse available commits

```bash
git log --oneline upstream-rebranded
```

### Cherry-pick a specific fix

```bash
./scripts/upstream-sync.sh pick <commit-hash>
```

### Full merge (when catching up on many commits)

```bash
git checkout -b sync/upstream-YYYY-MM-DD main
git merge upstream-rebranded
# Resolve any real conflicts (should be minimal)
# Push and PR
```

## What the transform does

The branding sed replaces:

- `openclaw` → `seksbot`
- `OpenClaw` → `seksbot`
- `OPENCLAW` → `SEKSBOT`
- `OpenClawConfig` → `seksbotConfig`
- `OpenClawPluginApi` → `seksbotPluginApi`
- `openclaw/plugin-sdk` → `seksbot/plugin-sdk`
- `clawdbot` → `seksbot`

## Areas we own (skip upstream changes)

These areas have diverged intentionally — don't sync them:

- **Skills system** — we deprecated it (`src/agents/skills-install.ts`, `src/security/skill-scanner.ts`, etc.)
- **Auth/config** — we're replacing with SEKS broker (`src/seks/`, `src/agents/model-auth.ts` broker path)
- **CI workflows** — we removed inherited ones (`labeler.yml`, `formal-conformance.yml`)
- **Package names** — keep `seksbot` in all `package.json`

## Frequency

Weekly or biweekly. More frequent = smaller diffs = easier merges.
