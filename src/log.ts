import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"

/** Directory holding the per-session NDJSON logs, shared with the bash logger. */
export function logDir(): string {
    return process.env.SKILL_AUDIT_DIR || join(homedir(), ".claude", "skill-audit")
}

export function logPath(sessionID: string): string {
    return join(logDir(), `${sessionID}.ndjson`)
}

export type SkillEvent = {
    ts: string
    kind: "skill"
    name: string
    args?: string
    cwd?: string
    source?: string
}

export type FileEvent = {
    ts: string
    kind: "file"
    tool: string
    path: string
    cwd?: string
}

export type AuditEvent = SkillEvent | FileEvent

/**
 * Parse NDJSON log text. Malformed lines are dropped rather than thrown on: the
 * sidebar reads the log while the logger is appending to it, so a truncated
 * trailing line is expected, not exceptional.
 */
export function parse(text: string): AuditEvent[] {
    const events: AuditEvent[] = []
    for (const line of text.split("\n")) {
        if (!line.trim()) {
            continue
        }
        try {
            const event = JSON.parse(line)
            if (event?.kind === "skill" || event?.kind === "file") {
                events.push(event)
            }
        } catch {

        }
    }
    return events
}

export const NO_SKILL = "(no skill active)"

export type TimelineFile = { ts: string; tool: string; path: string }
export type SkillRun = { skill: string; ts: string; files: TimelineFile[] }

/**
 * Group a flat event list into skill runs, each carrying the files edited after
 * it. Port of the jq reduce in scripts/skill-audit; the two must agree.
 */
export function group(events: AuditEvent[]): SkillRun[] {
    const runs: SkillRun[] = []
    for (const event of events) {
        if (event.kind === "skill") {
            runs.push({skill: event.name, ts: event.ts, files: []})
            continue
        }
        if (runs.length === 0) {
            runs.push({skill: NO_SKILL, ts: event.ts, files: []})
        }
        runs[runs.length - 1]!.files.push({ts: event.ts, tool: event.tool, path: event.path})
    }
    return runs
}

export type Summary = { runs: number; distinct: number; files: number; orphan: number }

export function summarize(events: AuditEvent[]): Summary {
    const names: string[] = []
    const paths = new Set<string>()

    for (const event of events) {

        if (event.kind === "skill") {
            names.push(event.name)
        } else {
            paths.add(event.path)
        }
    }

    const orphan = group(events)
        .filter((run) => run.skill === NO_SKILL)
        .reduce((total, run) => total + run.files.length, 0)

    return {
        runs: names.length,
        distinct: new Set(names).size,
        files: paths.size,
        orphan
    }
}

/**
 * Append one line, creating the log directory if needed. Mirrors the guarantee
 * logger.sh makes by always exiting 0: logging must never disturb a session.
 */
function append(sessionID: string, event: AuditEvent): void {
    try {
        mkdirSync(logDir(), {recursive: true})
        appendFileSync(logPath(sessionID), `${JSON.stringify(event)}\n`)
    } catch {
        return
    }
}

export function appendSkill(sessionID: string, input: { ts: string; name: string; cwd: string }): void {
    if (!input.name) return
    append(sessionID, {
        ts: input.ts,
        kind: "skill",
        name: input.name,
        args: "",
        cwd: input.cwd,
        source: "tool",
    })
}

export function appendFile(
    sessionID: string,
    input: { ts: string; tool: string; path: string; cwd: string },
): void {
    if (!input.path || input.path === "/dev/null") {
        return
    }
    const path: string = isAbsolute(input.path) || !input.cwd ? input.path : join(input.cwd, input.path)
    append(sessionID, {
        ts: input.ts,
        kind: "file",
        tool: input.tool,
        path,
        cwd: input.cwd,
    })
}

/**
 * Extract touched paths from an apply_patch payload. opencode uses the same
 * `*** Begin Patch` envelope as Codex, so this mirrors the sed parsing in
 * logger.sh. Duplicates are collapsed, order of first appearance kept.
 */
export function parsePatch(args: unknown): string[] {
    const patchText =
        typeof args === "string"
            ? args
            : typeof (args as { patchText?: unknown })?.patchText === "string"
                ? (args as { patchText: string }).patchText
                : typeof (args as { patch?: unknown })?.patch === "string"
                    ? (args as { patch: string }).patch
                    : ""

    const paths: string[] = []
    for (const line of patchText.split("\n")) {
        const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/.exec(line.trim())
        const path = match?.[1]?.trim()
        if (path && !paths.includes(path)) {
            paths.push(path)
        }
    }
    return paths
}

/** Second-precision UTC timestamp, matching `date -u +%FT%TZ` in logger.sh. */
export function nowTs(date: Date = new Date()): string {
    return `${date.toISOString().slice(0, 19)}Z`
}

export type SessionView = { runs: SkillRun[]; summary: Summary; cwd: string }

const EMPTY: SessionView = {runs: [], summary: {runs: 0, distinct: 0, files: 0, orphan: 0}, cwd: ""}

/**
 * Read one session's log. A missing or unreadable file is an empty session, not
 * an error: the sidebar renders before the first event is ever written.
 */
export function readSession(sessionID: string): SessionView {
    let text: string
    try {
        text = readFileSync(logPath(sessionID), "utf8")
    } catch {
        return EMPTY
    }
    const events: AuditEvent[] = parse(text)
    const cwd: string = events.find((event) => event.cwd)?.cwd ?? ""
    return {
        runs: group(events),
        summary: summarize(events),
        cwd
    }
}
