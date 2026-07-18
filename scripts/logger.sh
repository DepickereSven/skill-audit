#!/usr/bin/env bash
# logger.sh <prompt|skill|file> — Claude Code and Codex hook target.
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
turn_id="$(jq -r '.turn_id // ""' <<<"$input" 2>/dev/null)" || exit 0

append_skill() {
  local name="$1" args="${2:-}" source="${3:-tool}"
  [ -z "$name" ] && return

  if [ -n "$turn_id" ] && [ -f "$log" ] && jq -e \
    --arg turn_id "$turn_id" --arg name "$name" \
    'select(.kind == "skill" and .turn_id == $turn_id and .name == $name)' \
    "$log" >/dev/null 2>&1; then
    return
  fi

  jq -cn --arg ts "$ts" --arg name "$name" --arg args "$args" --arg cwd "$cwd" \
    --arg source "$source" --arg turn_id "$turn_id" \
    '{ts:$ts, kind:"skill", name:$name, args:$args, cwd:$cwd, source:$source}
     + (if $turn_id == "" then {} else {turn_id:$turn_id} end)' >> "$log" 2>/dev/null
}

append_file() {
  local tool="$1" path="$2"
  [ -z "$path" ] || [ "$path" = "/dev/null" ] && return
  if [[ "$path" != /* ]] && [ -n "$cwd" ]; then
    path="$cwd/$path"
  fi
  jq -cn --arg ts "$ts" --arg tool "$tool" --arg path "$path" --arg cwd "$cwd" \
    '{ts:$ts, kind:"file", tool:$tool, path:$path, cwd:$cwd}' >> "$log" 2>/dev/null
}

case "$kind" in
  prompt)
    # Codex does not currently expose automatic skill loading as a hook event.
    # Its explicit invocation syntax is observable in UserPromptSubmit instead.
    [ -z "${PLUGIN_ROOT:-}" ] && exit 0
    while IFS= read -r name; do
      append_skill "$name" "" "prompt"
    done < <(jq -r '
      .prompt // ""
      | [scan("\\$[a-z0-9](?:[a-z0-9:-]*[a-z0-9])?(?![A-Za-z0-9_:-])") | ltrimstr("$")]
      | unique[]
    ' <<<"$input" 2>/dev/null)
    ;;
  skill)
    name="$(jq -r '.tool_input.skill // .tool_input.name // .tool_input.skill_name // empty' <<<"$input" 2>/dev/null)"
    args="$(jq -r '.tool_input.args // ""' <<<"$input" 2>/dev/null)"
    append_skill "$name" "$args" "tool"
    ;;
  file)
    tool="$(jq -r '.tool_name // "?"' <<<"$input" 2>/dev/null)"
    path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)"
    if [ -n "$path" ]; then
      append_file "$tool" "$path"
      exit 0
    fi

    # Codex reports apply_patch edits as one patch string rather than file_path.
    patch="$(jq -r '
      if (.tool_input | type) == "string" then .tool_input
      else .tool_input.command // .tool_input.patch // empty
      end
    ' <<<"$input" 2>/dev/null)"
    while IFS= read -r path; do
      append_file "$tool" "$path"
    done < <(printf '%s\n' "$patch" | sed -n -E \
      -e 's/^\*\*\* (Add|Update|Delete) File: (.*)$/\2/p' \
      -e 's/^\*\*\* Move to: (.*)$/\1/p' | awk '!seen[$0]++')
    ;;
esac

exit 0
