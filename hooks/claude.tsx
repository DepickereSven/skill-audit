import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";

import { idleGapFrom, type SessionView, toView } from "../src/core";
import { iconsFor, type Line, sidebarLines, type Tone } from "../src/view";
import type { AuditPaneView } from "../types";

/**
 * The skill-audit timeline as a live Claude Code pane. Display only: the shell
 * hooks in hooks.json keep writing the log through logger.sh, so recording
 * never depends on this early-access API.
 */

const PANE = "skill-audit";
const TITLE = "Skill audit";
const COMMAND = "skill-audit-pane";
const POLL_MS = 2000;
/**
 * `$.store` key, kept between sessions: set by `/skill-audit-pane hide`,
 * cleared by `show`. While set, a new session does not open the pane by itself.
 */
const HIDDEN = "hidden";
/**
 * The dock width asked for, in body columns: room for a file row (indent, time
 * and icon take 12) plus a readable path. A width the person drags wins.
 */
const COLUMNS = 40;

const EMPTY_VIEW: AuditPaneView = {
    runs: [],
    summary: {
        runs: 0,
        distinct: 0,
        files: 0,
        orphan: 0,
    },
    cwd: "",
};

const view = atom({ plugin: "skill-audit", key: "view" } as const, EMPTY_VIEW);
const source = atom({ plugin: "skill-audit", key: "source" } as const, "");
const collapsed = atom({ plugin: "skill-audit", key: "collapsed" } as const, [] as string[]);
const readError = atom({ plugin: "skill-audit", key: "readError" } as const, false);

/** Same resolution as `logPath` in src/log.ts, through `$` instead of Node. */
async function logFile($: EngineInterface): Promise<string> {
    const dir: string =
        (await $.env.get("SKILL_AUDIT_DIR")) || `${await $.env.get("HOME")}/.claude/skill-audit`;
    return `${dir}/${await $.session.id()}.ndjson`;
}

/**
 * Re-read the session log. The id is asked every time, so after `/clear` the
 * pane follows the new session's log. An unchanged log writes nothing, so an
 * idle poll never redraws.
 */
async function refresh($: EngineInterface): Promise<void> {
    let text = "";
    try {
        const path: string = await logFile($);
        if (await $.fs.exists(path)) {
            const body = await $.fs.read(path);
            text = typeof body === "string" ? body : "";
        }
    } catch {
        await update($, readError, () => true);
        return;
    }

    await update($, readError, () => false);
    if (text === (await read($, source))) {
        return;
    }
    const next: SessionView = toView(
        text,
        idleGapFrom(await $.env.get("SKILL_AUDIT_IDLE_MINUTES")),
    );
    await update($, view, () => next);
    await update($, source, () => text);
}

function toggle(keys: string[], key: string): string[] {
    return keys.includes(key) ? keys.filter((one) => one !== key) : [...keys, key];
}

function toneProps(tone: Tone): { color?: string; dimColor?: boolean } {
    if (tone === "accent") {
        return { color: "cyan" };
    }
    if (tone === "warning") {
        return { color: "yellow" };
    }
    if (tone === "muted") {
        return { dimColor: true };
    }
    return {};
}

/** `  ▼ 14:00 (4)` -> indent 2, marker `▼`, rest `14:00 (4)`. */
function splitMarker(text: string): { indent: number; marker: string; rest: string } | null {
    const match = /^( *)(\S+) (.*)$/.exec(text);
    return match ? { indent: match[1]!.length, marker: match[2]!, rest: match[3]! } : null;
}

export const register: Register = (on) => {
    on("session.start", async ($, e, next) => {
        await $.command.register({
            name: COMMAND,
            description: "Show or hide this session's skill-audit timeline pane",
            argumentHint: "[show|hide|toggle]",
        });
        // Opened unasked, so it seats from 144 columns and waits below that;
        // no `focus`, so it never takes a tab another plugin is showing.
        if ((await $.store.get(HIDDEN)) !== true) {
            void $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS });
        }
        $.clock.every(POLL_MS, () => void refresh($));
        await refresh($);

        return next(e);
    });

    on("command.run", { command: COMMAND }, async ($, e) => {
        const action: string = e.args.trim().toLowerCase() || "show";
        if (action !== "show" && action !== "hide" && action !== "toggle") {
            return {
                text: `Unknown argument "${e.args.trim()}". Use: /${COMMAND} [show|hide|toggle]`,
            };
        }
        const isOpen: boolean = (await $.ui.panes()).some((pane) => pane.id === PANE);
        const isHiding: boolean = action === "hide" || (action === "toggle" && isOpen);

        if (isHiding) {
            await $.store.set(HIDDEN, true);
            await $.ui.close({ id: PANE });
            return { text: `Skill audit pane hidden. /${COMMAND} brings it back.` };
        }

        await $.store.delete(HIDDEN);
        await refresh($);
        await $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS });

        return { text: "Skill audit pane opened." };
    });

    // The tools whose PostToolUse hooks in hooks.json append to the log, written
    // out literally so the matcher stays readable to `claude plugin validate`.
    // MultiEdit is left out: current builds have no such tool to match.
    // The shell hook may land after this refresh; the poll picks that up.
    on("tool.call", { tool: ["Skill", "Edit", "Write", "NotebookEdit"] }, async ($, e, next) => {
        const ran = await next(e);
        await refresh($);

        return ran;
    });

    on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
        const { Box, Button, Text } = $.ui.resolve(e);
        const current: AuditPaneView = await read($, view);
        const keys: string[] = await read($, collapsed);
        const failed: boolean = await read($, readError);
        const icons = iconsFor(await $.env.get("SKILL_AUDIT_ICONS"));

        // Inline sits above the prompt: header and the latest run only, and no
        // toggles, since the run keys there would not match the full list.
        const isDocked: boolean = e.props.placement === "dock";
        const shown: SessionView = isDocked
            ? current
            : { ...current, runs: current.runs.slice(-1) };
        const lines: Line[] = sidebarLines(shown, {
            sectionOpen: true,
            collapsed: new Set(keys),
            width: e.props.bodyColumns,
            icons,
        });
        // The pane has its own frame and close mark; the section marker is noise.
        const header: string = lines[0]!.text.replace(`${icons.open} `, "");

        return (
            <Box flexDirection="column">
                <Text bold>{header}</Text>
                {lines.slice(1).map((line, index) => {
                    const parts = line.key && isDocked ? splitMarker(line.text) : null;
                    const isToggle: boolean =
                        parts !== null &&
                        (parts.marker === icons.open || parts.marker === icons.closed);
                    if (!parts || !line.key || !isToggle) {
                        return (
                            <Text key={`line:${index}`} {...toneProps(line.tone)}>
                                {line.text}
                            </Text>
                        );
                    }
                    const key: string = line.key;
                    return (
                        <Box key={`row:${key}`} flexDirection="row" marginLeft={parts.indent}>
                            <Button
                                key={key}
                                plain
                                label={parts.marker}
                                onPress={() =>
                                    update($, collapsed, (list) => toggle(list ?? [], key))
                                }
                            />
                            <Text {...toneProps(line.tone)}> {parts.rest}</Text>
                        </Box>
                    );
                })}
                {failed && <Text dimColor>log unreadable, showing last read</Text>}
            </Box>
        );
    });
};
