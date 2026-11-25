#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[hermifacts] building desktop/plugin.js..."
node build.mjs
node --check desktop/plugin.js

SYNC_EXCLUDES=(--exclude '.git' --exclude '__pycache__' --exclude '*.pyc' --exclude '.pytest_cache' --exclude 'tests/tmp')

DEPLOYED_JS=("$ROOT/desktop/plugin.js")

for HERMES_ROOT in "$HOME/.hermes-webapp" "$HOME/.hermes" "/home/streamuser/.hermes"; do
  if [ -d "$HERMES_ROOT" ] && [ -w "$HERMES_ROOT" ]; then
    mkdir -p "$HERMES_ROOT/plugins/hermifacts" "$HERMES_ROOT/desktop-plugins/hermifacts"
    rsync -a --delete "${SYNC_EXCLUDES[@]}" "$ROOT/" "$HERMES_ROOT/plugins/hermifacts/"
    cp -f "$ROOT/desktop/plugin.js" "$HERMES_ROOT/desktop-plugins/hermifacts/plugin.js"
    DEPLOYED_JS+=("$HERMES_ROOT/desktop-plugins/hermifacts/plugin.js")
    echo "[hermifacts] synced to $HERMES_ROOT/{plugins,desktop-plugins}/hermifacts"
  fi
done

echo "[hermifacts] bundle checksum verification:"
md5sum "${DEPLOYED_JS[@]}"
echo "[hermifacts] deploy complete."
