# skill-audit

Deterministic audit trail for [Claude Code](https://code.claude.com),
[Codex](https://developers.openai.com/codex/) and [opencode](https://opencode.ai) sessions: which
observable **skills** were invoked, when, and which **files** were changed afterwards. It gives you
a quick skill-compliance signal before you read the code.

On opencode it also renders live in the TUI sidebar, so the audit sits next to the conversation
with no command to run.

LLMs are not deterministic; hook events are. This plugin logs the facts exposed by each host's
documented hook API. It performs no LLM judging, spends no tokens, and does not parse transcripts.

```text
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

`PostToolUse` hooks capture skill-tool calls and file edits. On Codex, a `UserPromptSubmit` hook
also captures explicit `$skill-name` references, and `apply_patch` payloads are expanded into one
file event per path. On opencode a plugin does the same job through the `tool.execute.after` hook.
Events are appended as NDJSON to `~/.claude/skill-audit/<session_id>.ndjson`; override the location
with `SKILL_AUDIT_DIR`.

```text
Claude Code / Codex ──hooks───▶ logger.sh ──┐
                                            ├─▶ ~/.claude/skill-audit/<sid>.ndjson
opencode ──tool.execute.after──▶ plugin ────┘             │
                                                          ├─▶ skill-audit status/report/watch/list
                                                          └─▶ opencode sidebar (live)
```

The log is the only contract between the writers and the viewers, so the CLI reads opencode
sessions and the opencode sidebar reads Claude Code sessions.

Subagent hook calls use the parent session ID, so delegated edits appear in the same audit.

## Install

### Claude Code

```text
/plugin marketplace add DepickereSven/skill-audit
/plugin install skill-audit@depickeresven-skill-audit
```

Restart Claude Code so the hooks load.

> **Migrating from a manual setup?** Remove any `logger.sh` entries from the `hooks` block of
> `~/.claude/settings.json` first, or every event is logged twice.

### Codex

```bash
codex plugin marketplace add DepickereSven/skill-audit
codex plugin add skill-audit@depickeresven-skill-audit
```

Start a new Codex session after installation. Codex asks you to review and trust plugin-bundled
hooks before they run. Plugins are available in Codex CLI and the ChatGPT desktop app's Codex
surface, but not in the IDE extension. See the official
[plugin](https://developers.openai.com/codex/plugins/build) and
[hook](https://developers.openai.com/codex/hooks) documentation.

Invoke the bundled Codex skill with `$skill-audit`.

### opencode

```bash
opencode plugin opencode-skill-audit --global
```

Restart opencode so the plugin loads. It registers two things: a server hook that logs
`skill`, `edit`, `write` and `apply_patch` tool calls, and a sidebar section that renders the
current session's timeline live.

```text
▼ Skill audit  ⚡2 ✎4 ⚠1
⚠ 14:01 no skill
     ✎ src/index.ts
  14:02 brainstorming
▼ 14:05 test-driven-development
     ✎ src/auth/token.ts
     ✎ src/auth/token.test.ts
```

Click the header to collapse the section, or a skill row to fold its files away.

opencode discovers skills natively, including from `.claude/skills/` and `.agents/skills/`, so
skills you already use are logged without moving them. To get the in-session report as well, link
the bundled skill into a directory opencode scans:

```bash
ln -sf "$PWD/skills/skill-audit" ~/.config/opencode/skills/skill-audit
```

### CLI on your PATH (recommended)

The viewer works from any terminal. Link the installed script somewhere on your PATH.

Claude Code:

```bash
ln -sf ~/.claude/plugins/cache/*/skill-audit/*/scripts/skill-audit ~/.local/bin/skill-audit
```

Codex:

```bash
ln -sf ~/.codex/plugins/cache/*/skill-audit/*/scripts/skill-audit ~/.local/bin/skill-audit
```

You can also clone this repository and link `scripts/skill-audit` directly.

### Claude Code statusline segment (optional)

Plugins cannot modify your statusline. Add this to your own statusline script to get a live
`⚡2 ✎5 tdd` segment:

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

| Command                    | What                                                             |     Tokens |
|----------------------------|------------------------------------------------------------------|-----------:|
| `skill-audit status`       | Compact counts and recent timeline                               |          0 |
| `skill-audit report [sid]` | Full timeline                                                    |          0 |
| `skill-audit watch`        | Live view, refreshed every two seconds; `q` quits                |          0 |
| `skill-audit list`         | Recent sessions                                                  |          0 |
| `! skill-audit status`     | Run inside a Claude Code session; queues while the model is busy |          0 |
| opencode sidebar           | Live timeline beside the conversation; no command to run         |          0 |
| `/skill-audit`             | Show the report inside Claude Code                               | Model turn |
| `$skill-audit`             | Show the report inside Codex                                     | Model turn |

The `⚠ edits outside skill context` counter is the compliance red flag: files changed while no
observable skill was active.

## Data format

One NDJSON file per session:

```json
{"ts":"2026-07-10T14:05:11Z","kind":"skill","name":"superpowers:test-driven-development","args":"","cwd":"/Users/me/proj","source":"tool"}
{"ts":"2026-07-10T14:06:40Z","kind":"file","tool":"apply_patch","path":"/Users/me/proj/src/auth/token.ts","cwd":"/Users/me/proj"}
```

`source` is `tool` for an observed skill tool call and `prompt` for an explicit Codex `$skill-name`
reference. Codex events can also include `turn_id`.

The format is open, so you can build other viewers on top. Prune old logs with:

```bash
find ~/.claude/skill-audit -name '*.ndjson' -mtime +30 -delete
```

## Honest limitations

- **Invocation is not compliance.** The log proves that a skill was explicitly selected or exposed
  as a tool event, not that the result followed every instruction.
- **Codex automatic skill loading is not a hook event today.** Explicit `$skill-name` references
  are captured; skills that Codex chooses automatically are not. No transcript parsing is used to
  fill that gap.
- **Prompt-sourced entries are syntax-level evidence.** Codex supplies plain prompt text to the
  hook, so a lower-case dollar-prefixed token can be logged even if it does not resolve to an
  installed skill. The NDJSON `source: "prompt"` field distinguishes these entries.
- **Only observable file tools are captured.** Claude `Edit`/`Write`/`NotebookEdit`, Codex
  `apply_patch`, and opencode `edit`/`write`/`apply_patch` edits are logged. Files created
  indirectly by shell commands are not visible as separate file events.
- **opencode agents and subagents are not logged.** They have no equivalent on the other two
  hosts, so logging them would add an event kind only one host can emit. The audit keeps one data
  model across all three.
- **Session-start injected skills** are context, not skill tool calls, and do not appear.
- **Concurrent sessions:** the newest-log default can pick the wrong session; pass the session ID
  explicitly after using `skill-audit list`.

## Requirements

- macOS or Linux
- `bash` and `jq` for the CLI viewer and the Claude Code / Codex hooks
- opencode `>= 1.14` for the plugin and its sidebar
