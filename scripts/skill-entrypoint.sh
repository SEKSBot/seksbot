#!/usr/bin/env bash
# skill-entrypoint.sh — Entrypoint for seksbot skill-runner containers
#
# Validates required env vars, optionally waits for the broker, then runs
# the skill's main script from /skill.
set -euo pipefail

# ─── Validate required env vars ─────────────────────────────────────────────

missing=()
[ -z "${SEKS_BROKER_URL:-}" ]  && missing+=("SEKS_BROKER_URL")
[ -z "${SEKS_SKILL_NAME:-}" ]  && missing+=("SEKS_SKILL_NAME")
[ -z "${SEKS_SKILL_TASK:-}" ]  && missing+=("SEKS_SKILL_TASK")

if [ ${#missing[@]} -gt 0 ]; then
  echo "ERROR: missing required env vars: ${missing[*]}" >&2
  exit 1
fi

# ─── Wait for broker (optional, max 30s) ────────────────────────────────────

BROKER_WAIT_TIMEOUT="${SEKS_BROKER_WAIT_TIMEOUT:-30}"

if [ "$BROKER_WAIT_TIMEOUT" -gt 0 ] 2>/dev/null; then
  echo "Waiting for broker at $SEKS_BROKER_URL (timeout: ${BROKER_WAIT_TIMEOUT}s)..."
  elapsed=0
  until curl -sf "${SEKS_BROKER_URL}/health" >/dev/null 2>&1; do
    if [ "$elapsed" -ge "$BROKER_WAIT_TIMEOUT" ]; then
      echo "ERROR: broker not reachable after ${BROKER_WAIT_TIMEOUT}s" >&2
      exit 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "Broker reachable."
fi

# ─── Run skill ──────────────────────────────────────────────────────────────

if [ -f /skill/index.js ]; then
  exec node /skill/index.js "$@"
elif [ -f /skill/index.mjs ]; then
  exec node /skill/index.mjs "$@"
elif [ -f /skill/main.sh ]; then
  exec bash /skill/main.sh "$@"
else
  echo "ERROR: no runnable skill found in /skill (expected index.js, index.mjs, or main.sh)" >&2
  exit 1
fi
