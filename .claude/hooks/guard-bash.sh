#!/usr/bin/env bash
# PreToolUse guard for Bash tool calls. Exit code 2 blocks the call and the
# stderr line explains why; any other outcome lets the command proceed.
set -euo pipefail

input=$(cat)
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
else
  # Conservative fallback without jq: pattern-match the raw JSON payload.
  cmd=$input
fi
if [ -z "$cmd" ]; then exit 0; fi

block() { printf '%s\n' "$1" >&2; exit 2; }
has() { printf '%s' "$cmd" | grep -Eq "$1"; }

# 1) rm -rf targeting the filesystem root or the home directory
if has '(^|[;&|[:space:]])rm[[:space:]]' && has '[[:space:]]-[A-Za-z]*r' \
   && has '[[:space:]]-[A-Za-z]*f' && has '[[:space:]](/|~)/?\*?([[:space:]]|$|[;&|])'; then
  block "Blocked: rm -rf targeting / or the home directory."
fi

# 2) git push with a force flag (long, short, or clustered)
if has '(^|[;&|[:space:]])git[[:space:]]+push' \
   && has '[[:space:]](--force[^[:space:]]*|-[A-Za-z]*f[A-Za-z]*)([[:space:]]|$)'; then
  block "Blocked: force push is not allowed."
fi

# 3) reading .env secrets (.env.example is the committed template and is fine)
scrub=${cmd//.env.example/}
if printf '%s' "$scrub" | grep -Eq \
  '(^|[;&|[:space:]])(cat|head|tail|less|more|bat|grep|strings)[[:space:]][^;&|]*\.env(\.[A-Za-z0-9_.-]+)?([[:space:]]|$)'; then
  block "Blocked: reading .env files is not allowed (use .env.example)."
fi

# 4) writing into generated build output directories
dirs='(\./)?(build|\.svelte-kit|dist-desktop)/'
if has ">>?[[:space:]]*${dirs}" \
   || { has '(^|[;&|[:space:]])tee[[:space:]]' && has "[[:space:]]${dirs}"; } \
   || { has '(^|[;&|[:space:]])sed[[:space:]]+-[A-Za-z]*i' && has "[[:space:]]${dirs}"; }; then
  block "Blocked: writing into build/, .svelte-kit/ or dist-desktop/ (generated output)."
fi

# 5) committing directly on the release branch
if has '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit'; then
  branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null || true)
  if [ "$branch" = "main" ]; then
    block "main is the release branch; work on a feature branch"
  fi
fi

exit 0
