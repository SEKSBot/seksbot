#!/bin/bash
# ci-local.sh — Run CI checks locally before pushing
#
# Replaces the GitHub Actions round-trip. Catches lint, format,
# type, and test failures fast.
#
# Usage:
#   ./scripts/ci-local.sh          # run all checks
#   ./scripts/ci-local.sh --quick  # skip tests (lint/format/types only)
#   ./scripts/ci-local.sh --test   # tests only

set -euo pipefail

QUICK=false
TEST_ONLY=false
FAILED=0
RESULTS=()

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=true ;;
    --test) TEST_ONLY=true ;;
  esac
done

run_step() {
  local name="$1"
  local cmd="$2"
  echo ""
  echo "━━━ $name ━━━"
  if eval "$cmd"; then
    RESULTS+=("✅ $name")
  else
    RESULTS+=("❌ $name")
    FAILED=$((FAILED + 1))
  fi
}

START=$(date +%s)

if ! $TEST_ONLY; then
  run_step "Format (oxfmt)" "pnpm format"
  run_step "Lint (oxlint)" "pnpm lint"
  run_step "Types (tsgo)" "pnpm tsgo"
fi

if ! $QUICK; then
  run_step "Build (canvas bundle)" "pnpm canvas:a2ui:bundle"
  run_step "Tests (vitest)" "pnpm test"
fi

END=$(date +%s)
ELAPSED=$((END - START))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results (${ELAPSED}s):"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILED -gt 0 ]; then
  echo "💥 $FAILED check(s) failed"
  exit 1
else
  echo "🎉 All checks passed"
  exit 0
fi
