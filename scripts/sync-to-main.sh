#!/usr/bin/env bash
#
# Sync only the *necessary* project files from `dev` onto `main`, then push.
#
# `main` intentionally holds none of the dev-only artifacts (plan/, .claude/,
# log.md, docs/). Instead of merging dev -> main (which would drag those in),
# this copies just the shipped paths across, commits, and pushes.
#
#   Usage:  bash scripts/sync-to-main.sh ["optional commit message"]
#
set -euo pipefail

DEV_BRANCH="dev"
MAIN_BRANCH="main"

# The files that belong on main. Keep this list in step with the project.
PATHS=(
  src
  package.json
  package-lock.json
  tsconfig.json
  vite.config.code.ts
  vite.config.ui.ts
  eslint.config.js
  index.html
  manifest.json
  .gitignore
  CLAUDE.md
  .github
)

MSG="${1:-Sync necessary files from $DEV_BRANCH}"

# Refuse to run on a dirty tree — we switch branches below.
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree not clean. Commit or stash your changes first." >&2
  exit 1
fi

start_branch="$(git rev-parse --abbrev-ref HEAD)"
cleanup() { git checkout --quiet "$start_branch"; }
trap cleanup EXIT

echo "→ Updating $MAIN_BRANCH from $DEV_BRANCH…"
git checkout --quiet "$MAIN_BRANCH"
git checkout "$DEV_BRANCH" -- "${PATHS[@]}"

if git diff --cached --quiet; then
  echo "✓ $MAIN_BRANCH already matches $DEV_BRANCH for the necessary files. Nothing to do."
  exit 0
fi

git commit --quiet -m "$MSG"
echo "→ Pushing $MAIN_BRANCH…"
git push origin "$MAIN_BRANCH"
echo "✓ $MAIN_BRANCH synced and pushed."
