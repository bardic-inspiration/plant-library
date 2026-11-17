#!/usr/bin/env bash
# Install dependencies when a session starts in a fresh checkout, so the
# validate, build, check, and test scripts are ready to run.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund >/dev/null 2>&1 || npm ci --no-audit --no-fund
fi
echo "Plant Library: read AGENTS.md first. Unbuilt design is in spec/v1/; what exists is in docs/."
