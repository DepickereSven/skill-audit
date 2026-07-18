# claude-skill-audit

Deterministic audit trail for [Claude Code](https://code.claude.com) sessions: which **skills** were invoked, when, and which **files** were changed afterwards — so you can check skill compliance at a glance *before* reading any code.

LLMs are not deterministic; skill *invocation* is. This plugin logs the facts (skill fired yes/no, files touched under which skill) through Claude Code's documented hook API. No LLM judging, no tokens spent, no transcript parsing.

```
● Skill audit — f3a91c2e · ~/Dev/Web · 14:02→14:20 UTC

  14:02 ⚡ superpowers:brainstorming
  14:05 ⚡ superpowers:test-driven-development
  14:06 │  ✎ src/auth/token.ts  Edit
  14:09 │  ✎ src/auth/token.test.ts  Write
  14:20 ⚠ (no skill active)
  14:20 │  ✎ src/index.ts  Edit

● 2 skill runs (2 distinct) · 3 files touched · ⚠ 1 edits outside skill context
```

## How it works

`PostToolUse` hooks capture every `Skill` invocation and every `Edit`/`Write`/`NotebookEdit`, appending one NDJSON line per event to `~/.claude/skill-audit/<session_id>.ndjson`. Subagent tool calls fire the same hooks, so delegated work is captured too. The `skill-audit` CLI renders timelines from those logs.

```
Claude Code ──PostToolUse──▶ logger.sh ──▶ ~/.claude/skill-audit/<sid>.ndjson
                                                      │
                            skill-audit status/report/watch/list ◀─┘
```

## Install

```
/plugin marketplace add DepickereSven/claude-skill-audit
/plugin install skill-audit@claude-skill-audit
```

Restart Claude Code so the hooks load.

> **Migrating from a manual setup?** Remove any `logger.sh` entries from the
> `hooks` block of `~/.claude/settings.json` first, or every event is logged twice.

### CLI on your PATH (recommended)

The viewer works from any terminal — link it somewhere on your PATH:

```bash
ln -sf ~/.claude/plugins/cache/*/skill-audit/*/scripts/skill-audit ~/.local/bin/skill-audit
```

(Or clone this repo and link `scripts/skill-audit` directly.)

### Statusline segment (optional, live while model busy)

Plugins cannot modify your statusline; add this to your own statusline script to get a live `⚡2 ✎5 tdd` segment:

```sh
sid=$(echo "$input" | jq -r '.session_id // empty')
audit_log="$HOME/.claude/skill-audit/$sid.ndjson"
if [ -n "$sid" ] && [ -s "$audit_log" ]; then
  audit=$(jq -rs '
    [ .[] | select(.kind=="skill") ] as $s
    | ([ .[] | select(.kind=="file") | .path ] | unique | length) as $f
    | "⚡\($s|length) ✎\($f)"
      + (if ($s|length) > 0 then " " + ($s[-1].name | split(":") | last) else "" end)
  ' "$audit_log" 2>/dev/null)
  [ -n "$audit" ] && parts="$parts | $audit"
fi
```

## Usage

| Command | What | Tokens |
|---|---|---|
| `skill-audit status` | compact view: counts + recent timeline | 0 |
| `skill-audit report [sid]` | full timeline | 0 |
| `skill-audit watch` | live view in a second terminal, 2s refresh, `q` quits — works while the model is generating | 0 |
| `skill-audit list` | recent sessions | 0 |
| `! skill-audit status` | same, inside a Claude session (queues while model busy) | 0 |
| `/skill-audit` | timeline inside the conversation | model turn |

The `⚠ edits outside skill context` counter is the compliance red flag: files changed while no skill was active.

## Data format

One NDJSON file per session in `~/.claude/skill-audit/` (override with `SKILL_AUDIT_DIR`):

```json
{"ts":"2026-07-10T14:05:11Z","kind":"skill","name":"superpowers:test-driven-development","args":"","cwd":"/Users/me/proj"}
{"ts":"2026-07-10T14:06:40Z","kind":"file","tool":"Edit","path":"/Users/me/proj/src/auth/token.ts","cwd":"/Users/me/proj"}
```

Open format — build your own viewers on top. Prune old logs with:
`find ~/.claude/skill-audit -name '*.ndjson' -mtime +30 -delete`

## Honest limitations

- **Invocation ≠ compliance.** The log proves a skill's instructions entered context, not that the output followed them. It's a pre-filter: when something looks off, prompt Claude to re-verify against the skill before you spend review time.
- **User-typed slash commands** may be injected directly by the harness without a `Skill` tool call; model-initiated skill use is always captured.
- **Session-start injected skills** (e.g. content added via SessionStart hooks) are not `Skill` tool calls and won't appear.
- **Concurrent sessions**: the newest-log default can pick the wrong session; pass the session id explicitly (`skill-audit list` to find it).

## Requirements

- macOS/Linux, `bash`, `jq`
