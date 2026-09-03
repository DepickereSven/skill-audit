import { appendFile, appendSkill, nowTs, parsePatch } from "./log"

/** opencode tools that write a single file, keyed by the argument holding the path. */
const FILE_TOOLS = new Set(["edit", "write", "multiedit"])
const PATCH_TOOLS = new Set(["apply_patch", "patch"])

export type ToolCall = { tool: string; sessionID: string; args: unknown }

function stringField(args: unknown, key: string): string {
    const value = (args as Record<string, unknown> | null | undefined)?.[key]
    return typeof value === "string" ? value : ""
}

/**
 * Map one completed opencode tool call onto audit events. Never throws: a hook
 * that disturbs the session is worse than a missing log line.
 */
export function record(call: ToolCall, cwd: string): void {
    try {
        const {tool, sessionID, args} = call
        const ts = nowTs()

        if (tool === "skill") {
            appendSkill(sessionID, {ts, name: stringField(args, "name") || stringField(args, "skill"), cwd})
            return
        }
        if (FILE_TOOLS.has(tool)) {
            appendFile(sessionID, {ts, tool, path: stringField(args, "filePath"), cwd})
            return
        }
        if (PATCH_TOOLS.has(tool)) {
            for (const path of parsePatch(args)) {
                appendFile(sessionID, {ts, tool, path, cwd})
            }
        }
    } catch {
        return
    }
}
