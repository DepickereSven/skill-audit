#!/usr/bin/env bash
# logger.sh <skill|file> — Claude Code PostToolUse hook target.
# Reads hook JSON on stdin, appends one NDJSON line to the per-session audit log.
# Must never fail or block the session: always exits 0.
set -uo pipefail

LOG_DIR="${SKILL_AUDIT_DIR:-$HOME/.claude/skill-audit}"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0

kind="${1:-}"
input="$(cat)"

sid="$(jq -r '.session_id // "unknown"' <<<"$input" 2>/dev/null)" || exit 0
cwd="$(jq -r '.cwd // ""' <<<"$input" 2>/dev/null)" || exit 0
ts="$(date -u +%FT%TZ)"
log="$LOG_DIR/$sid.ndjson"

case "$kind" in
  skill)
    name="$(jq -r '.tool_input.skill // empty' <<<"$input" 2>/dev/null)"
    [ -z "$name" ] && exit 0
    args="$(jq -r '.tool_input.args // ""' <<<"$input" 2>/dev/null)"
    jq -cn --arg ts "$ts" --arg name "$name" --arg args "$args" --arg cwd "$cwd" \
      '{ts:$ts, kind:"skill", name:$name, args:$args, cwd:$cwd}' >> "$log" 2>/dev/null
    ;;
  file)
    tool="$(jq -r '.tool_name // "?"' <<<"$input" 2>/dev/null)"
    path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)"
    [ -z "$path" ] && exit 0
    jq -cn --arg ts "$ts" --arg tool "$tool" --arg path "$path" --arg cwd "$cwd" \
      '{ts:$ts, kind:"file", tool:$tool, path:$path, cwd:$cwd}' >> "$log" 2>/dev/null
    ;;
esac

exit 0
