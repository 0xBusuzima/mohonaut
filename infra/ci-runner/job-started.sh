#!/usr/bin/env bash
# Runs before every job (ACTIONS_RUNNER_HOOK_JOB_STARTED). Container jobs (Playwright) write
# files owned by root into the workspace; give them back to the runner user so the next
# checkout can clean the folder. Uses Docker instead of sudo (the runner has no password).
set -euo pipefail
work="${GITHUB_WORKSPACE:-}"
[ -n "$work" ] && [ -d "$work" ] || exit 0
if find "$work" -mindepth 1 ! -user "$(id -u)" -print -quit 2>/dev/null | grep -q .; then
  docker run --rm -v "$work:/w" alpine:3.22 chown -R "$(id -u):$(id -g)" /w
fi
