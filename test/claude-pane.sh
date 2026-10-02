#!/usr/bin/env bash
# Validates and tests the Claude Code pane (hooks/claude.tsx) with the claude
# CLI. `claude plugin test` runs every *.test.ts(x) under the folder it is
# given in the mod sandbox, where the bun tests in test/ cannot load, so the
# mod's own files are staged into a scratch folder and tested there.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"

if ! command -v claude >/dev/null 2>&1; then
  printf 'claude-pane: the claude CLI is not installed; skipping\n' >&2
  exit 0
fi

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

mkdir -p "$stage/.claude-plugin" "$stage/src"
cp "$root/.claude-plugin/plugin.json" "$stage/.claude-plugin/"
cp -R "$root/hooks" "$root/types" "$root/scripts" "$stage/"
cp "$root/src/core.ts" "$root/src/view.ts" "$stage/src/"

claude plugin validate "$stage/.claude-plugin/plugin.json"
claude plugin test "$stage"
