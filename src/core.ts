/**
 * The log model with no Node dependency. The Claude Code pane runs in a
 * sandbox without `node:*` modules or `process`, so everything it shares with
 * the CLI and the opencode sidebar lives here; `log.ts` adds the file I/O.
 */

export type SkillEvent = {
    ts: string;
    kind: "skill";
    name: string;
    args?: string;
    cwd?: string;
    source?: string;
};

export type FileEvent = {
    ts: string;
    kind: "file";
    tool: string;
    path: string;
    cwd?: string;
};

export type AuditEvent = SkillEvent | FileEvent;

/**
 * An environment variable where the host has one, `undefined` where it does
 * not. Read through `globalThis` because a bare `process` throws in the Claude
 * Code sandbox.
 */
export function env(name: string): string | undefined {
    const host = globalThis as { process?: { env?: Record<string, string | undefined> } };
    return host.process?.env?.[name];
}

/**
 * Parse NDJSON log text. Malformed lines are dropped rather than thrown on: the
 * sidebar reads the log while the logger is appending to it, so a truncated
 * trailing line is expected, not exceptional.
 */
export function parse(text: string): AuditEvent[] {
    const events: AuditEvent[] = [];
    for (const line of text.split("\n")) {
        if (!line.trim()) {
            continue;
        }
        try {
            const event = JSON.parse(line);
            if (event?.kind === "skill" || event?.kind === "file") {
                events.push(event);
            }
        } catch {
            // Ignore malformed or incomplete lines while a log is being written.
        }
    }
    return events;
}

export const NO_SKILL = "(no skill active)";

export type TimelineFile = { ts: string; tool: string; path: string };
export type SkillRun = { skill: string; ts: string; files: TimelineFile[] };

/** How long a skill run may sit idle before it stops claiming later edits. */
export const DEFAULT_IDLE_GAP_MS = 30 * 60_000;

/** `SKILL_AUDIT_IDLE_MINUTES` as milliseconds, or the default when unusable. */
export function idleGapFrom(minutes: string | undefined): number {
    const value = Number(minutes);
    return Number.isFinite(value) && value > 0 ? value * 60_000 : DEFAULT_IDLE_GAP_MS;
}

/**
 * The idle gap, in milliseconds. Without one a single skill invoked in the
 * morning claims every edit made for the rest of the day.
 */
export function idleGapMs(): number {
    return idleGapFrom(env("SKILL_AUDIT_IDLE_MINUTES"));
}

/** Epoch milliseconds, or NaN for a timestamp this log did not write. */
function epoch(ts: string): number {
    return new Date(ts).getTime();
}

/**
 * Group a flat event list into skill runs, each carrying the files edited after
 * it. Port of the jq reduce in scripts/skill-audit; the two must agree.
 *
 * A run only claims edits that keep arriving: once `gapMs` passes with no
 * activity, later files fall into a synthetic run instead. An unparseable
 * timestamp compares as NaN, which never exceeds the gap, so logs written
 * before this rule existed group exactly as they did before.
 */
export function group(events: AuditEvent[], gapMs: number = idleGapMs()): SkillRun[] {
    const runs: SkillRun[] = [];
    let lastActivity: number = NaN;

    for (const event of events) {
        if (event.kind === "skill") {
            runs.push({
                skill: event.name,
                ts: event.ts,
                files: [],
            });
            lastActivity = epoch(event.ts);
            continue;
        }

        const current: SkillRun | undefined = runs[runs.length - 1];
        const stale: boolean = epoch(event.ts) - lastActivity > gapMs;
        // A synthetic run has no skill to go stale, so a gap never splits it.
        if (!current || (stale && current.skill !== NO_SKILL)) {
            runs.push({
                skill: NO_SKILL,
                ts: event.ts,
                files: [],
            });
        }
        runs[runs.length - 1]!.files.push({
            ts: event.ts,
            tool: event.tool,
            path: event.path,
        });
        lastActivity = epoch(event.ts);
    }
    return runs;
}

export type Summary = { runs: number; distinct: number; files: number; orphan: number };

export function summarize(events: AuditEvent[], gapMs: number = idleGapMs()): Summary {
    const names: string[] = [];
    const paths = new Set<string>();

    for (const event of events) {
        if (event.kind === "skill") {
            names.push(event.name);
        } else {
            paths.add(event.path);
        }
    }

    const orphan = group(events, gapMs)
        .filter((run) => run.skill === NO_SKILL)
        .reduce((total, run) => total + run.files.length, 0);

    return {
        runs: names.length,
        distinct: new Set(names).size,
        files: paths.size,
        orphan,
    };
}

export type SessionView = { runs: SkillRun[]; summary: Summary; cwd: string };

/** A session's view from its raw log text; empty text is an empty session. */
export function toView(text: string, gapMs: number = idleGapMs()): SessionView {
    const events: AuditEvent[] = parse(text);
    const cwd: string = events.find((event) => event.cwd)?.cwd ?? "";
    return {
        runs: group(events, gapMs),
        summary: summarize(events, gapMs),
        cwd,
    };
}

/** `node:path` basename for POSIX paths: the last segment, trailing slashes ignored. */
export function baseName(path: string): string {
    const trimmed: string = path.replace(/\/+$/, "");
    return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/**
 * `path` relative to `cwd` when it sits under it, else `path` as given. The
 * sidebar only ever shortens paths inside the session directory.
 */
export function relativeTo(path: string, cwd: string): string {
    return cwd && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
}
