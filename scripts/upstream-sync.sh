#!/bin/bash
# upstream-sync.sh — Rebranded upstream mirror for clean cherry-picks
#
# Usage:
#   ./scripts/upstream-sync.sh              # Rebuild rebranded mirror
#   ./scripts/upstream-sync.sh pick <hash>  # Cherry-pick from rebranded mirror
#
# How it works:
#   1. Fetches upstream/main
#   2. Creates/updates 'upstream-rebranded' branch with branding transform applied
#   3. Cherry-picks from that branch apply cleanly against our main
#
# The branding transform (openclaw→seksbot) eliminates naming conflicts,
# leaving only real code differences to resolve.

set -euo pipefail

UPSTREAM_REMOTE="upstream"
REBRANDED_BRANCH="upstream-rebranded"

rebrand_file() {
  local f="$1"
  sed -i '' \
    -e 's/openclaw\/plugin-sdk/seksbot\/plugin-sdk/g' \
    -e 's/openclaw/seksbot/g' \
    -e 's/OpenClawConfig/seksbotConfig/g' \
    -e 's/OpenClawPluginApi/seksbotPluginApi/g' \
    -e 's/OpenClaw/seksbot/g' \
    -e 's/OPENCLAW/SEKSBOT/g' \
    -e 's/open-claw/seksbot/g' \
    -e 's/clawdbot/seksbot/g' \
    -e 's/Clawdbot/Seksbot/g' \
    "$f" 2>/dev/null || true
}

cmd_rebuild() {
  echo "Fetching upstream..."
  git fetch "$UPSTREAM_REMOTE"

  local current_branch
  current_branch=$(git branch --show-current)

  # Delete old rebranded branch if exists
  git branch -D "$REBRANDED_BRANCH" 2>/dev/null || true

  echo "Creating rebranded mirror from upstream/main..."
  git checkout -b "$REBRANDED_BRANCH" "$UPSTREAM_REMOTE/main"

  echo "Applying branding transform..."
  find . \( -name '*.ts' -o -name '*.md' -o -name '*.json' -o -name '*.js' -o -name '*.mjs' \) \
    -not -path './node_modules/*' \
    -not -path './.git/*' \
    -print0 | while IFS= read -r -d '' f; do
    rebrand_file "$f"
  done

  echo "Committing rebrand..."
  git add -A
  git commit -m "rebrand: openclaw → seksbot (automated transform)" --allow-empty

  echo "Switching back to $current_branch..."
  git checkout "$current_branch"

  local upstream_head
  upstream_head=$(git rev-parse "$UPSTREAM_REMOTE/main" --short)
  echo ""
  echo "Done. '$REBRANDED_BRANCH' is ready at upstream $upstream_head (rebranded)."
  echo ""
  echo "To cherry-pick a commit:"
  echo "  git log --oneline $REBRANDED_BRANCH   # find commits"
  echo "  $0 pick <hash>                         # apply it"
}

cmd_pick() {
  local hash="$1"
  echo "Cherry-picking $hash from $REBRANDED_BRANCH..."
  git cherry-pick "$hash"
}

case "${1:-rebuild}" in
  rebuild) cmd_rebuild ;;
  pick)    cmd_pick "${2:?Usage: $0 pick <hash>}" ;;
  *)       echo "Usage: $0 [rebuild|pick <hash>]"; exit 1 ;;
esac
