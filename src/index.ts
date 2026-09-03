import type { Plugin } from "@opencode-ai/plugin"

import { record } from "./record"

/**
 * Server plugin: turns completed tool calls into audit events.
 *
 * The equivalent of the PostToolUse hooks the plugin registers on Claude Code
 * and Codex, writing the same NDJSON log those hosts write.
 */
export const SkillAuditServer: Plugin = async ({directory, worktree}) => {
    const cwd = directory || worktree || process.cwd()
    return {
        "tool.execute.after": async ({tool, sessionID, args}) => {
            record({tool, sessionID, args}, cwd)
        },
    }
}

export default {id: "skill-audit", server: SkillAuditServer}
