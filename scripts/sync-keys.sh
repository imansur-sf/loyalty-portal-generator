#!/usr/bin/env bash
# ============================================================
# sync-keys.sh — Centralized API key rotation for Heroku apps
# ============================================================
# Reads GEMINI_API_KEY from the vault app and pushes it to all
# consumer apps in one command.
#
# Usage:
#   ./scripts/sync-keys.sh
#
# 90-Day Rotation Workflow:
#   1. Generate new key in Google Cloud Console
#   2. heroku config:set GEMINI_API_KEY=<new-key> --app imansur-api-keys
#   3. ./scripts/sync-keys.sh
#
# To add a new consumer app, just add it to the CONSUMER_APPS array.
# ============================================================

set -euo pipefail

VAULT_APP="imansur-api-keys"
CONSUMER_APPS=(
  "sassysolutions-loyaltygen"
  # Add future apps here as you build them:
  # "my-other-app"
  # "another-heroku-app"
)

echo "🔑 Reading GEMINI_API_KEY from vault app: $VAULT_APP"
KEY=$(heroku config:get GEMINI_API_KEY --app "$VAULT_APP" 2>/dev/null || true)

if [ -z "$KEY" ]; then
  echo "❌ GEMINI_API_KEY not found on $VAULT_APP. Set it first:"
  echo "   heroku config:set GEMINI_API_KEY=<your-key> --app $VAULT_APP"
  exit 1
fi

echo "✅ Key retrieved (${#KEY} chars). Syncing to ${#CONSUMER_APPS[@]} app(s)..."
echo ""

FAILED=0
for APP in "${CONSUMER_APPS[@]}"; do
  echo -n "  → $APP ... "
  if heroku config:set GEMINI_API_KEY="$KEY" --app "$APP" >/dev/null 2>&1; then
    echo "✅"
  else
    echo "❌ (failed)"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "🎉 Done. All ${#CONSUMER_APPS[@]} app(s) updated successfully."
else
  echo "⚠️  Done with $FAILED failure(s). Check the apps above marked ❌."
  exit 1
fi
