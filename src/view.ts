import { basename, relative } from "node:path";

import { NO_SKILL, type SessionView, type SkillRun, type Summary } from "./log";

export function hhmm(ts: string): string {
    return ts.slice(11, 16);
}

/** `superpowers:brainstorming` -> `brainstorming`, the way the statusline snippet does. */
export function shortName(name: string): string {
    const parts = name.split(":");
    return parts[parts.length - 1] || name;
}

export function headerLine(summary: Summary): string {
    const counts = `⚡${summary.runs} ✎${summary.files}${summary.orphan > 0 ? ` ⚠${summary.orphan}` : ""}`;
    return `Skill audit  ${counts}`;
}

export function runTitle(run: SkillRun, collapsed: boolean): string {
    const time: string = hhmm(run.ts);
    if (run.skill === NO_SKILL) {
        return `⚠ ${time} no skill`;
    }
    const name: string = shortName(run.skill);
    if (run.files.length === 0) {
        return `  ${time} ${name}`;
    }
    return collapsed ? `▶ ${time} ${name} (${run.files.length})` : `▼ ${time} ${name}`;
}

/**
 * Fit a path into the sidebar: relative to the session directory, then the
 * basename, then a truncated basename.
 */
export function displayPath(path: string, cwd: string, width: number): string {
    const rel: string = cwd && path.startsWith(`${cwd}/`) ? relative(cwd, path) : path;
    if (rel.length <= width) {
        return rel;
    }
    const base: string = basename(rel);
    if (base.length <= width) {
        return base;
    }
    return `${base.slice(0, Math.max(0, width - 1))}…`;
}

export type Tone = "text" | "muted" | "accent" | "warning";
export type Line = { text: string; tone: Tone; runIndex?: number };

export type SidebarOptions = {
    /** Whether the whole section is expanded. */
    sectionOpen: boolean;
    /** Indices of runs whose files are hidden. */
    collapsed: Set<number>;
    /** Usable sidebar width, in columns. */
    width: number;
};

const FILE_INDENT = "     ✎ ";

/**
 * The entire sidebar section as plain lines. Keeping layout here rather than in
 * the OpenTUI glue means it can be tested without a terminal.
 */
export function sidebarLines(view: SessionView, options: SidebarOptions): Line[] {
    const marker = options.sectionOpen ? "▼" : "▶";
    const lines: Line[] = [
        {
            text: `${marker} ${headerLine(view.summary)}`,
            tone: "text",
        },
    ];

    if (!options.sectionOpen) {
        return lines;
    }

    if (view.runs.length === 0) {
        lines.push({
            text: "  no events yet",
            tone: "muted",
        });
        return lines;
    }

    view.runs.forEach((run, index) => {
        const collapsed = options.collapsed.has(index);
        lines.push({
            text: runTitle(run, collapsed),
            tone: run.skill === NO_SKILL ? "warning" : "accent",
            runIndex: index,
        });
        if (collapsed) {
            return;
        }
        for (const file of run.files) {
            lines.push({
                text: `${FILE_INDENT}${displayPath(file.path, view.cwd, options.width - FILE_INDENT.length)}`,
                tone: "muted",
            });
        }
    });
    return lines;
}
