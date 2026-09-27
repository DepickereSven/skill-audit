import { expect, test } from "bun:test";

import type { SessionView } from "../src/log";
import { sidebarLines } from "../src/view";

const VIEW: SessionView = {
    cwd: "/w",
    summary: {
        runs: 2,
        distinct: 2,
        files: 3,
        orphan: 1,
    },
    runs: [
        {
            skill: "(no skill active)",
            ts: "2026-09-03T14:01:00Z",
            files: [
                {
                    ts: "2026-09-03T14:01:00Z",
                    tool: "edit",
                    path: "/w/src/index.ts",
                },
            ],
        },
        {
            skill: "superpowers:brainstorming",
            ts: "2026-09-03T14:02:00Z",
            files: [],
        },
        {
            skill: "superpowers:test-driven-development",
            ts: "2026-09-03T14:05:00Z",
            files: [
                {
                    ts: "2026-09-03T14:06:00Z",
                    tool: "edit",
                    path: "/w/src/auth/token.ts",
                },
                {
                    ts: "2026-09-03T15:20:00Z",
                    tool: "write",
                    path: "/w/README.md",
                },
            ],
        },
    ],
};

const EMPTY: SessionView = {
    cwd: "",
    summary: {
        runs: 0,
        distinct: 0,
        files: 0,
        orphan: 0,
    },
    runs: [],
};

const opts = {
    sectionOpen: true,
    collapsed: new Set<string>(),
    width: 30,
};

test("sidebarLines nests hour buckets under each skill run", () => {
    expect(sidebarLines(VIEW, opts).map((line) => line.text)).toEqual([
        "▼ Skill audit  ·2 ✎3 !1",
        "▼ ! no skill",
        "  ▼ 14:00 (1)",
        "    14:01 ✎ src/index.ts",
        "  brainstorming",
        "▼ test-driven-development",
        "  ▼ 14:00 (1)",
        "    14:06 ✎ src/auth/token.ts",
        "  ▼ 15:00 (1)",
        "    15:20 ✎ README.md",
    ]);
});

test("sidebarLines hides every hour of a collapsed run but keeps the run", () => {
    const lines = sidebarLines(VIEW, {
        ...opts,
        collapsed: new Set(["run:2"]),
    });

    expect(lines.map((line) => line.text)).toEqual([
        "▼ Skill audit  ·2 ✎3 !1",
        "▼ ! no skill",
        "  ▼ 14:00 (1)",
        "    14:01 ✎ src/index.ts",
        "  brainstorming",
        "▶ test-driven-development (2)",
    ]);
});

test("sidebarLines hides the files of a collapsed hour but keeps its sibling hours", () => {
    const lines = sidebarLines(VIEW, {
        ...opts,
        collapsed: new Set(["run:2/hour:2026-09-03 14:00"]),
    });

    expect(lines.map((line) => line.text)).toEqual([
        "▼ Skill audit  ·2 ✎3 !1",
        "▼ ! no skill",
        "  ▼ 14:00 (1)",
        "    14:01 ✎ src/index.ts",
        "  brainstorming",
        "▼ test-driven-development",
        "  ▶ 14:00 (1)",
        "  ▼ 15:00 (1)",
        "    15:20 ✎ README.md",
    ]);
});

test("sidebarLines collapses to the header alone when the section is closed", () => {
    expect(
        sidebarLines(VIEW, {
            ...opts,
            sectionOpen: false,
        }).map((line) => line.text),
    ).toEqual(["▶ Skill audit  ·2 ✎3 !1"]);
});

test("sidebarLines says so when the session has recorded nothing yet", () => {
    expect(sidebarLines(EMPTY, opts).map((line) => line.text)).toEqual([
        "▼ Skill audit  ·0 ✎0",
        "  no events yet",
    ]);
});

test("sidebarLines tags the node a click should toggle", () => {
    const keys = sidebarLines(VIEW, opts)
        .filter((line) => line.key !== undefined)
        .map((line) => line.key);

    expect(keys).toEqual([
        "run:0",
        "run:0/hour:2026-09-03 14:00",
        "run:1",
        "run:2",
        "run:2/hour:2026-09-03 14:00",
        "run:2/hour:2026-09-03 15:00",
    ]);
});

test("sidebarLines tones warnings, skills, hours and files apart", () => {
    expect(sidebarLines(VIEW, opts).map((line) => line.tone)).toEqual([
        "text",
        "warning",
        "text",
        "muted",
        "accent",
        "accent",
        "text",
        "muted",
        "text",
        "muted",
    ]);
});

/**
 * The sidebar is laid out in fixed columns, so a glyph the terminal draws two
 * cells wide shifts every row that carries it. Emoji-presentation characters
 * are the ones that do that, so none may reach the default icon set.
 */
test("sidebarLines emits no glyph that a terminal may draw two cells wide", () => {
    delete process.env.SKILL_AUDIT_ICONS;
    const wide = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;

    for (const line of sidebarLines(VIEW, opts)) {
        expect(wide.test(line.text)).toBe(false);
    }
});
