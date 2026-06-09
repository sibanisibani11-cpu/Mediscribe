#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/create-publish-pr.sh [branch-name] [base-branch] [repo]
# Defaults: branch-name=ci/add-msstore-publish, base-branch=main, repo=`git remote get-url origin` inferred

BRANCH_NAME="${1:-ci/add-msstore-publish}"
BASE_BRANCH="${2:-main}"
REPO_ARG="${3:-}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install from https://cli.github.com/"
  exit 2
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git not found."
  exit 2
fi

# infer repo if not provided
if [ -z "$REPO_ARG" ]; then
  REPO_URL=$(git remote get-url origin 2>/dev/null || true)
  if [ -z "$REPO_URL" ]; then
    echo "Could not infer repo URL. Provide it as third argument (owner/repo)."
    exit 2
  fi
  # convert URL to owner/repo
  if [[ "$REPO_URL" =~ github.com[:/](.+) ]]; then
    REPO="${BASH_REMATCH[1]}"
    REPO=${REPO%.git}
  else
    echo "Unexpected remote URL format: $REPO_URL"
    exit 2
  fi
else
  REPO="$REPO_ARG"
fi

echo "Creating branch $BRANCH_NAME from $BASE_BRANCH and committing workflow change..."

git fetch origin "$BASE_BRANCH"
git checkout -b "$BRANCH_NAME" "origin/$BASE_BRANCH"

git add .github/workflows/build-microsoft-store.yml
if git diff --staged --quiet; then
  echo "No staged changes to commit. Ensure you ran this from repo root after editing files."
else
  git commit -m "ci: add automatic Microsoft Store publish step (guarded by secrets)"
  git push --set-upstream origin "$BRANCH_NAME"
  echo "Branch pushed. Creating PR..."
  gh pr create --repo "$REPO" --base "$BASE_BRANCH" --head "$BRANCH_NAME" --title "ci: automatic Microsoft Store publish" --body "Adds a publish step to the Windows workflow that uploads the generated AppX to Partner Center when secrets are set."
  echo "PR created."
fi
