#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/trigger-github-build.sh [owner/repo] [ref]
# Defaults: owner/repo=Kalpa-netizen/Mediscribe, ref=main

REPO="${1:-Kalpa-netizen/Mediscribe}"
REF="${2:-main}"
WORKFLOW_FILE="build-microsoft-store.yml"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install from https://cli.github.com/"
  exit 2
fi

echo "Triggering GitHub Actions workflow ${WORKFLOW_FILE} on ${REPO}@${REF}..."
gh workflow run "$WORKFLOW_FILE" --repo "$REPO" --ref "$REF"

echo "Workflow dispatched. Monitor run at: https://github.com/${REPO}/actions/workflows/${WORKFLOW_FILE}"
