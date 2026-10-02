import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { type AuditEvent, type SessionView, toView } from "./core";

export * from "./core";

/** Directory holding the per-session NDJSON logs, shared with the bash logger. */
export function logDir(): string {
    return process.env.SKILL_AUDIT_DIR || join(homedir(), ".claude", "skill-audit");
}

export function logPath(sessionID: string): string {
    return join(logDir(), `${sessionID}.ndjson`);
}

/**
 * Append one line, creating the log directory if needed. Mirrors the guarantee
 * logger.sh makes by always exiting 0: logging must never disturb a session.
 */
function append(sessionID: string, event: AuditEvent): void {
    try {
        mkdirSync(logDir(), { recursive: true });
        appendFileSync(logPath(sessionID), `${JSON.stringify(event)}\n`);
    } catch {
        return;
    }
}

export function appendSkill(
    sessionID: string,
    input: { ts: string; name: string; cwd: string },
): void {
    if (!input.name) return;
    append(sessionID, {
        ts: input.ts,
        kind: "skill",
        name: input.name,
        args: "",
        cwd: input.cwd,
        source: "tool",
    });
}

export function appendFile(
    sessionID: string,
    input: { ts: string; tool: string; path: string; cwd: string },
): void {
    if (!input.path || input.path === "/dev/null") {
        return;
    }
    const path: string =
        isAbsolute(input.path) || !input.cwd ? input.path : join(input.cwd, input.path);
    append(sessionID, {
        ts: input.ts,
        kind: "file",
        tool: input.tool,
        path,
        cwd: input.cwd,
    });
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
                : "";

    const paths: string[] = [];
    for (const line of patchText.split("\n")) {
        const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/.exec(
            line.trim(),
        );
        const path = match?.[1]?.trim();
        if (path && !paths.includes(path)) {
            paths.push(path);
        }
    }
    return paths;
}

/** Second-precision UTC timestamp, matching `date -u +%FT%TZ` in logger.sh. */
export function nowTs(date: Date = new Date()): string {
    return `${date.toISOString().slice(0, 19)}Z`;
}

/**
 * Read one session's log. A missing or unreadable file is an empty session, not
 * an error: the sidebar renders before the first event is ever written.
 */
export function readSession(sessionID: string): SessionView {
    let text: string;
    try {
        text = readFileSync(logPath(sessionID), "utf8");
    } catch {
        text = "";
    }
    return toView(text);
}
