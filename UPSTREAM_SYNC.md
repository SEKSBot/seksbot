# Upstream Sync SOP

seksbot is a hard fork of OpenClaw. We selectively absorb upstream improvements while maintaining our own branding and architecture.

## Repo Layout

```
openclaw/openclaw          ← canonical upstream
        ↓ GitHub Sync Fork
SEKSBot/openclaw           ← proper GitHub fork (mirror only, no custom work)
        ↓ upstream-sync.sh (rebrand transform)
SEKSBot/seksbot            ← our hard fork (rebranded, diverged)
```

## Step 1: Sync the Fork

In GitHub UI: **SEKSBot/openclaw → Sync fork → Update branch**

Or via CLI:

```bash
cd ~/openclaw  # local clone of SEKSBot/openclaw
git fetch upstream
git checkout main
git merge upstream/main --ff-only
git push origin main
```

## Step 2: Rebuild the Rebranded Mirror

From a working clone of SEKSBot/seksbot:

```bash
./scripts/upstream-sync.sh rebuild
```

This:

1. Fetches upstream/main (from openclaw/openclaw)
2. Creates/updates `upstream-rebranded` branch with branding transform applied
3. Switches back to your branch

## Step 3: Cherry-pick or Merge

### Cherry-pick specific fixes:

```bash
git log --oneline upstream-rebranded  # browse available commits
./scripts/upstream-sync.sh pick <commit-hash>
```

### Full merge (catching up on many commits):

```bash
git checkout -b sync/upstream-YYYY-MM-DD main
git merge upstream-rebranded
# Resolve any real conflicts (should be minimal)
# Push and PR
```

## What the Transform Does

The branding sed replaces:

- `openclaw` → `seksbot`
- `OpenClaw` → `seksbot`
- `OPENCLAW` → `SEKSBOT`
- `OpenClawConfig` → `seksbotConfig`
- `OpenClawPluginApi` → `seksbotPluginApi`
- `openclaw/plugin-sdk` → `seksbot/plugin-sdk`
- `clawdbot` → `seksbot`

## Areas We Own (Skip Upstream Changes)

These areas have diverged intentionally — don't sync them:

- **Skills system** — deprecated in favor of SEKS broker
- **Auth/config** — replacing with SEKS broker
- **CI workflows** — we removed inherited ones
- **Package names** — keep `seksbot` in all `package.json`

## Frequency

Weekly or biweekly. More frequent = smaller diffs = easier merges.

## Rules

- **Never push custom work to SEKSBot/openclaw** — it's a mirror only
- **Always PR sync changes** into SEKSBot/seksbot main (branch protection enforced)
- **Squash merge** the sync PR for clean history
