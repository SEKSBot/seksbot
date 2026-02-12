#!/bin/bash
# upstream-transform.sh — AST-aware upstream code transformation
#
# Uses ast-grep for syntactically correct transforms, plus sed for
# simple string replacements that don't need AST awareness.
#
# Usage:
#   ./scripts/upstream-transform/transform.sh [--dry-run] [--check-stale]
#
# --dry-run:      Show what would change without modifying files
# --check-stale:  Report rules with 0 matches (possibly obsolete)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SG="${SG:-sg}"
DRY_RUN=false
CHECK_STALE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --check-stale) CHECK_STALE=true ;;
  esac
done

# ─── AST-aware transforms (ast-grep) ───────────────────────────

echo "=== AST-aware transforms (ast-grep) ==="

if $CHECK_STALE; then
  echo ""
  echo "Checking rule match counts..."
  results=$($SG scan --config "$SCRIPT_DIR/sgconfig.yml" --json 2>/dev/null || echo "[]")
  
  # Count matches per rule
  echo "$results" | jq -r '
    group_by(.ruleId) | 
    map({rule: .[0].ruleId, matches: length}) |
    .[] | 
    if .matches == 0 then "⚠️  STALE: \(.rule) — 0 matches (review for removal)"
    else "✅ \(.rule) — \(.matches) matches"
    end
  '
  
  # Check for rules that had no matches at all
  all_rules=$(find "$SCRIPT_DIR/rules" -name "*.yml" -exec grep -l "^id:" {} \; | xargs grep "^id:" | sed 's/.*id: //')
  matched_rules=$(echo "$results" | jq -r '.[].ruleId' | sort -u)
  
  for rule in $all_rules; do
    if ! echo "$matched_rules" | grep -q "^${rule}$"; then
      echo "⚠️  STALE: $rule — 0 matches (rule never triggered)"
    fi
  done
  
  echo ""
fi

if $DRY_RUN; then
  echo "(dry run — showing matches only)"
  $SG scan --config "$SCRIPT_DIR/sgconfig.yml" 2>/dev/null || true
else
  echo "Applying AST transforms..."
  $SG scan --config "$SCRIPT_DIR/sgconfig.yml" --update-all 2>/dev/null || true
fi

# ─── Simple string transforms (sed) ────────────────────────────
# For things that don't need AST awareness: comments, strings,
# config files, markdown, JSON keys, etc.

echo ""
echo "=== String transforms (sed) ==="

apply_sed() {
  local pattern="$1"
  local description="$2"
  
  if $DRY_RUN; then
    count=$(grep -rl "$pattern" --include="*.ts" --include="*.md" --include="*.json" --include="*.js" --include="*.mjs" . 2>/dev/null | wc -l | tr -d ' '; exit 0)
    echo "  $description: $count files would change"
  else
    find . \( -name '*.ts' -o -name '*.md' -o -name '*.json' -o -name '*.js' -o -name '*.mjs' \) \
      -not -path './node_modules/*' \
      -not -path './.git/*' \
      -exec sed -i '' "$pattern" {} + 2>/dev/null || true
    echo "  ✅ $description"
  fi
}

apply_sed 's/openclaw\/plugin-sdk/seksbot\/plugin-sdk/g' "plugin-sdk package refs"
apply_sed 's/openclaw/seksbot/g' "openclaw → seksbot (lowercase)"
apply_sed 's/OpenClawConfig/seksbotConfig/g' "OpenClawConfig → seksbotConfig"
apply_sed 's/OpenClawPluginApi/seksbotPluginApi/g' "OpenClawPluginApi → seksbotPluginApi"
apply_sed 's/OpenClaw/seksbot/g' "OpenClaw → seksbot (mixed case)"
apply_sed 's/OPENCLAW/SEKSBOT/g' "OPENCLAW → SEKSBOT (uppercase)"
apply_sed 's/open-claw/seksbot/g' "open-claw → seksbot (kebab)"
apply_sed 's/clawdbot/seksbot/g' "clawdbot → seksbot"
apply_sed 's/Clawdbot/Seksbot/g' "Clawdbot → Seksbot"

# Zero-width character variants (tests embed ZWC in brand names)
apply_sed 's/open\\u200bclaw/seks\\u200bbot/g' "openclaw with ZWC in tests"

# ─── Skills deprecation ─────────────────────────────────────────
# Remove all bundled OpenClaw skills (restored by upstream sync).
# Our skills framework uses skill.yaml manifests + containerized execution.

echo ""
echo "=== Skills deprecation ==="

# List of upstream skill directories to remove (everything except our custom ones)
SKILLS_KEEP="example-skill"
SKILLS_DIR="./skills"

if [ -d "$SKILLS_DIR" ]; then
  removed=0
  for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name="$(basename "$skill_dir")"
    # Keep our custom skills
    case "$skill_name" in
      $SKILLS_KEEP) continue ;;
    esac
    if $DRY_RUN; then
      echo "  Would remove: skills/$skill_name/"
      removed=$((removed + 1))
    else
      rm -rf "$skill_dir"
      removed=$((removed + 1))
    fi
  done
  echo "  ✅ Removed $removed upstream skill directories"
else
  echo "  (no skills/ directory found)"
fi

# Stub out skills engine files if upstream restores them
SKILLS_STUBS=(
  "src/infra/skills-remote.ts"
  "src/security/skill-scanner.ts"
  "src/agents/skills-status.ts"
  "src/agents/skills-install.ts"
)

for stub_target in "${SKILLS_STUBS[@]}"; do
  stub_name="$(basename "$stub_target")"
  if [ -f "./$stub_target" ]; then
    if ! head -1 "./$stub_target" | grep -q "DEPRECATED"; then
      if $DRY_RUN; then
        echo "  Would stub: $stub_target"
      else
        cp "$SCRIPT_DIR/stubs/$stub_name" "./$stub_target"
        echo "  ✅ Stubbed $stub_target"
      fi
    else
      echo "  $stub_target already stubbed"
    fi
  fi
done

# ─── Auto-format (oxfmt) ────────────────────────────────────────

echo ""
echo "=== Auto-format (oxfmt) ==="

if $DRY_RUN; then
  format_count=$(npx oxfmt --check 2>&1 | grep -c "Format issues" || echo "0")
  echo "  $format_count files need formatting"
else
  echo "  Formatting all files..."
  npx oxfmt --write . 2>/dev/null || true
  echo "  ✅ Formatted"
fi

echo ""
echo "Done."
