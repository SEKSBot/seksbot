#!/usr/bin/env bash
set -euo pipefail

cd /repo

export SEKSBOT_STATE_DIR="/tmp/openclaw-test"
export SEKSBOT_CONFIG_PATH="${SEKSBOT_STATE_DIR}/openclaw.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${SEKSBOT_STATE_DIR}/credentials"
mkdir -p "${SEKSBOT_STATE_DIR}/agents/main/sessions"
echo '{}' >"${SEKSBOT_CONFIG_PATH}"
echo 'creds' >"${SEKSBOT_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${SEKSBOT_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm openclaw reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${SEKSBOT_CONFIG_PATH}"
test ! -d "${SEKSBOT_STATE_DIR}/credentials"
test ! -d "${SEKSBOT_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${SEKSBOT_STATE_DIR}/credentials"
echo '{}' >"${SEKSBOT_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm openclaw uninstall --state --yes --non-interactive

test ! -d "${SEKSBOT_STATE_DIR}"

echo "OK"
