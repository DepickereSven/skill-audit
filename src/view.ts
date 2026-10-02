import {
    baseName,
    env,
    NO_SKILL,
    relativeTo,
    type SessionView,
    type SkillRun,
    type Summary,
    type TimelineFile,
} from "./core";

export type IconSet = {
    run: string;
    file: string;
    warn: string;
    open: string;
    closed: string;
};

/**
 * The sidebar is laid out in fixed columns, so an icon the terminal draws two
 * cells wide shifts every row carrying it. `⚡` and `⚠` are emoji-presentation
 * characters and do exactly that, so the default set replaces them with glyphs
 * that are always one cell. `SKILL_AUDIT_ICONS=emoji` opts back in.
 */
const TEXT_ICONS: IconSet = {
    run: "·",
    file: "✎",
    warn: "!",
    open: "▼",
    closed: "▶",
};
const EMOJI_ICONS: IconSet = {
    run: "⚡",
    file: "✎",
    warn: "⚠",
    open: "▼",
    closed: "▶",
};

/** The icon set for a `SKILL_AUDIT_ICONS` value; anything but `emoji` is the text set. */
export function iconsFor(style: string | undefined): IconSet {
    return style === "emoji" ? EMOJI_ICONS : TEXT_ICONS;
}

export function icons(): IconSet {
    return iconsFor(env("SKILL_AUDIT_ICONS"));
}

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

/**
 * Logs are written in UTC so they stay comparable across machines; the sidebar
 * shows the clock the user was actually looking at.
 */
function local(ts: string): Date | null {
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function hhmm(ts: string): string {
    const date = local(ts);
    return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";
}

/** The local hour a timestamp belongs to, as a bucket label. */
export function hourKey(ts: string): string {
    const date = local(ts);
    return date ? `${pad(date.getHours())}:00` : "";
}

/** `superpowers:brainstorming` -> `brainstorming`, the way the statusline snippet does. */
export function shortName(name: string): string {
    const parts = name.split(":");
    return parts[parts.length - 1] || name;
}

/** `day` is carried so a run spanning midnight gets one bucket per calendar hour. */
export type HourBucket = { day: string; hour: string; files: TimelineFile[] };

/**
 * Split a run's files into consecutive local-hour buckets. Consecutive rather
 * than keyed, so the same hour on the next day opens a second bucket instead of
 * folding a day's gap into one row.
 */
export function bucketByHour(files: TimelineFile[]): HourBucket[] {
    const buckets: HourBucket[] = [];

    for (const file of files) {
        const day: string = file.ts.slice(0, 10);
        const hour: string = hourKey(file.ts);
        const last: HourBucket | undefined = buckets[buckets.length - 1];
        if (!last || last.day !== day || last.hour !== hour) {
            buckets.push({
                day,
                hour,
                files: [],
            });
        }
        buckets[buckets.length - 1]!.files.push(file);
    }
    return buckets;
}

export function headerLine(summary: Summary, icon: IconSet = icons()): string {
    const counts = `${icon.run}${summary.runs} ${icon.file}${summary.files}${
        summary.orphan > 0 ? ` ${icon.warn}${summary.orphan}` : ""
    }`;
    return `Skill audit  ${counts}`;
}

/** The skill name leads the row; its times live on the hour buckets below it. */
export function runTitle(run: SkillRun, collapsed: boolean, icon: IconSet = icons()): string {
    const name: string = run.skill === NO_SKILL ? `${icon.warn} no skill` : shortName(run.skill);
    if (run.files.length === 0) {
        return `  ${name}`;
    }
    return collapsed ? `${icon.closed} ${name} (${run.files.length})` : `${icon.open} ${name}`;
}

export function hourTitle(bucket: HourBucket, collapsed: boolean, icon: IconSet = icons()): string {
    const marker: string = collapsed ? icon.closed : icon.open;
    return `${marker} ${bucket.hour} (${bucket.files.length})`;
}

/**
 * Fit a path into the sidebar: relative to the session directory, then the
 * basename, then a truncated basename.
 */
export function displayPath(path: string, cwd: string, width: number): string {
    const rel: string = relativeTo(path, cwd);
    if (rel.length <= width) {
        return rel;
    }
    const base: string = baseName(rel);
    if (base.length <= width) {
        return base;
    }
    return `${base.slice(0, Math.max(0, width - 1))}…`;
}

export type Tone = "text" | "muted" | "accent" | "warning";
/** `key` marks a collapsible node; the sidebar toggles whatever key it carries. */
export type Line = { text: string; tone: Tone; key?: string };

export type SidebarOptions = {
    /** Whether the whole section is expanded. */
    sectionOpen: boolean;
    /** Keys of runs and hour buckets whose children are hidden. */
    collapsed: Set<string>;
    /** Usable sidebar width, in columns. */
    width: number;
    /** Icons to draw with; the environment's set when omitted. */
    icons?: IconSet;
};

const HOUR_INDENT = "  ";
const FILE_INDENT = "    ";

export function runKey(index: number): string {
    return `run:${index}`;
}

export function hourKeyOf(index: number, bucket: HourBucket): string {
    return `${runKey(index)}/hour:${bucket.day} ${bucket.hour}`;
}

/**
 * The entire sidebar section as plain lines. Keeping layout here rather than in
 * the OpenTUI glue means it can be tested without a terminal.
 */
export function sidebarLines(view: SessionView, options: SidebarOptions): Line[] {
    const icon: IconSet = options.icons ?? icons();
    const marker = options.sectionOpen ? icon.open : icon.closed;
    const lines: Line[] = [
        {
            text: `${marker} ${headerLine(view.summary, icon)}`,
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
        const key: string = runKey(index);
        const runCollapsed: boolean = options.collapsed.has(key);
        lines.push({
            text: runTitle(run, runCollapsed, icon),
            tone: run.skill === NO_SKILL ? "warning" : "accent",
            key,
        });
        if (runCollapsed) {
            return;
        }

        for (const bucket of bucketByHour(run.files)) {
            const bucketKey: string = hourKeyOf(index, bucket);
            const hourCollapsed: boolean = options.collapsed.has(bucketKey);
            lines.push({
                text: `${HOUR_INDENT}${hourTitle(bucket, hourCollapsed, icon)}`,
                tone: "text",
                key: bucketKey,
            });
            if (hourCollapsed) {
                continue;
            }
            for (const file of bucket.files) {
                const stamp = `${hhmm(file.ts)} ${icon.file} `;
                const room: number = options.width - FILE_INDENT.length - stamp.length;
                lines.push({
                    text: `${FILE_INDENT}${stamp}${displayPath(file.path, view.cwd, room)}`,
                    tone: "muted",
                });
            }
        }
    });
    return lines;
}
