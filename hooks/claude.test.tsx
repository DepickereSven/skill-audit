import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const SESSION = "sess-1";
const DIR = "/audit";
const LOG = `${DIR}/${SESSION}.ndjson`;

const TEXT: string = [
    { ts: "2026-09-03T14:00:00Z", kind: "skill", name: "superpowers:brainstorming", cwd: "/w" },
    { ts: "2026-09-03T14:06:00Z", kind: "file", tool: "Edit", path: "/w/src/a.ts", cwd: "/w" },
    { ts: "2026-09-03T14:09:00Z", kind: "file", tool: "Write", path: "/w/src/b.ts", cwd: "/w" },
]
    .map((event) => JSON.stringify(event))
    .join("\n");

const SURFACES = ["terminal", "desktop"] as const;

type World = {
    /** Log files by path; the pane's session log is `LOG`. */
    files: Record<string, string>;
    /** Makes every read fail while true. */
    failing?: () => boolean;
    /** Sees each pane the plugin opens: its id and the dock width it asks for. */
    opened?: { id: string; columns?: number }[];
    /** Ids of the panes open right now. */
    open?: Set<string>;
    /** What the plugin's `$.store` holds at the start. */
    store?: Record<string, unknown>;
};

/** The engine beneath the plugin: one session, a log directory, a surface that seats panes. */
function world(
    on: On,
    { files, failing = () => false, opened = [], open = new Set(), store = {} }: World,
): void {
    mock.env(on, { SKILL_AUDIT_DIR: DIR });
    mock.store(on, store);
    mock.clock(on);
    on("session.id", () => ({ value: SESSION }));
    on("fs.exists", (_$, e) => ({ value: e.path in files }));
    on("fs.read", (_$, e) => {
        const body: string | undefined = files[e.path];
        return failing() || body === undefined
            ? { deny: `cannot read ${e.path}` }
            : { value: body };
    });
    on("ui.open", (_$, e) => {
        opened.push({ id: e.id, columns: e.columns });
        open.add(e.id);
        return { value: { isPlaced: true } };
    });
    on("ui.close", (_$, e) => {
        open.delete(e.id);
        return { value: undefined };
    });
    on("ui.panes", () => ({
        value: [...open].map((id) => ({
            id,
            title: "Skill audit",
            isShown: true,
            isFocused: false,
            isPlaced: true,
        })),
    }));
    on("command.register", (_$, e) => ({ value: { command: e.name } }));
    on("session.start", (_$, e) => ({ cwd: e.cwd }));
}

function paneProps(placement: "dock" | "inline") {
    return {
        title: "Skill audit",
        isFocused: false,
        bodyColumns: 40,
        placement,
        scroll: { offset: 0, bodyRows: 30 },
        view: {},
    };
}

const RUN = {
    command: "skill-audit-pane",
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: true, columns: 160 },
} as const;

const START = { cwd: "/w", surface: "terminal", isInteractive: true } as const;

test("the command opens the pane and the pane shows the session's timeline", async ($, on) => {
    const opened: { id: string; columns?: number }[] = [];
    world(on, { files: { [LOG]: TEXT }, opened });

    const ran = await $.command.run(RUN);
    expect(ran.text).toBe("Skill audit pane opened.");
    expect(opened).toContainEqual({ id: "skill-audit", columns: 40 });

    for (const surface of SURFACES) {
        const ui = await $.ui.mount({
            plugin: "skill-audit",
            surface,
            component: "Pane",
            requestId: "skill-audit",
            props: paneProps("dock"),
        });
        expect(await ui.find({ type: "Text", text: /Skill audit/ })).toBeDefined();
        expect(await ui.find({ type: "Text", text: /brainstorming/ })).toBeDefined();
        expect(await ui.find({ type: "Text", text: /src\/a\.ts/ })).toBeDefined();
        await ui.unmount();
    }
});

test("pressing a run's marker collapses it, pressing again expands it", async ($, on) => {
    world(on, { files: { [LOG]: TEXT } });
    await $.command.run(RUN);

    for (const surface of SURFACES) {
        const ui = await $.ui.mount({
            plugin: "skill-audit",
            surface,
            component: "Pane",
            requestId: "skill-audit",
            props: paneProps("dock"),
        });
        await ui.press({ key: "run:0" });
        expect(await ui.find({ type: "Text", text: /src\/a\.ts/ })).toBeUndefined();
        expect(await ui.find({ type: "Text", text: /brainstorming \(2\)/ })).toBeDefined();

        await ui.press({ key: "run:0" });
        expect(await ui.find({ type: "Text", text: /src\/a\.ts/ })).toBeDefined();
        await ui.unmount();
    }
});

test("a session with no log yet shows the empty state", async ($, on) => {
    world(on, { files: {} });
    await $.command.run(RUN);

    for (const surface of SURFACES) {
        const ui = await $.ui.mount({
            plugin: "skill-audit",
            surface,
            component: "Pane",
            requestId: "skill-audit",
            props: paneProps("dock"),
        });
        expect(await ui.find({ type: "Text", text: /no events yet/ })).toBeDefined();
        await ui.unmount();
    }
});

test("inline placement draws the latest run without toggles", async ($, on) => {
    const older = JSON.stringify({ ts: "2026-09-03T13:00:00Z", kind: "skill", name: "old:skill" });
    world(on, { files: { [LOG]: `${older}\n${TEXT}` } });
    await $.command.run(RUN);

    for (const surface of SURFACES) {
        const ui = await $.ui.mount({
            plugin: "skill-audit",
            surface,
            component: "Pane",
            requestId: "skill-audit",
            props: paneProps("inline"),
        });
        expect(await ui.find({ type: "Text", text: /brainstorming/ })).toBeDefined();
        expect(await ui.find({ type: "Text", text: /^\s*skill$/ })).toBeUndefined();
        expect(await ui.findAll({ type: "Button" })).toHaveLength(0);
        await ui.unmount();
    }
});

test("a failed read keeps the last view and says so", async ($, on) => {
    let failing = false;
    world(on, { files: { [LOG]: TEXT }, failing: () => failing });
    await $.command.run(RUN);
    failing = true;
    // Close, then open again: opening re-reads the log.
    await $.command.run(RUN);
    await $.command.run(RUN);

    const ui = await $.ui.mount({
        plugin: "skill-audit",
        surface: "terminal",
        component: "Pane",
        requestId: "skill-audit",
        props: paneProps("dock"),
    });
    expect(await ui.find({ type: "Text", text: /brainstorming/ })).toBeDefined();
    expect(await ui.find({ type: "Text", text: /log unreadable/ })).toBeDefined();
    await ui.unmount();
});

test("the command flips the pane between open and closed", async ($, on) => {
    const open = new Set<string>();
    world(on, { files: { [LOG]: TEXT }, open });

    const shown = await $.command.run(RUN);
    expect(shown.text).toBe("Skill audit pane opened.");
    expect(open.has("skill-audit")).toBe(true);

    const hidden = await $.command.run(RUN);
    expect(hidden.text).toMatch(/hidden/);
    expect(open.has("skill-audit")).toBe(false);

    await $.command.run(RUN);
    expect(open.has("skill-audit")).toBe(true);
});

test("a hidden pane stays closed in the next session until the command opens it", async ($, on) => {
    const opened: { id: string; columns?: number }[] = [];
    world(on, { files: { [LOG]: TEXT }, opened, store: { hidden: true } });

    await $.session.start(START);
    expect(opened).toHaveLength(0);

    await $.command.run(RUN);
    expect(opened).toContainEqual({ id: "skill-audit", columns: 40 });
});

test("a session starts with the pane open when it was never hidden", async ($, on) => {
    const opened: { id: string; columns?: number }[] = [];
    world(on, { files: { [LOG]: TEXT }, opened });

    await $.session.start(START);
    expect(opened).toContainEqual({ id: "skill-audit", columns: 40 });
});
