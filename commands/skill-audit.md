---
description: Show the skill-usage audit timeline for the current Claude Code session
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/skill-audit:*)
---

Run `${CLAUDE_PLUGIN_ROOT}/scripts/skill-audit report` and show the user its
output verbatim as a fenced code block. Do not summarize, reorder, or omit
lines. If it reports no events, state that plainly.

Note: this command consumes a model turn. For a zero-token view the user can
run `! skill-audit status` or use `skill-audit watch` in a separate terminal.
