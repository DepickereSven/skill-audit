import { expect, test } from "bun:test";

import type { SessionView } from "../src/log";
import { sidebarLines } from "../src/view";

const VIEW: SessionView = {
    cwd: "/w",
    summary: {
        runs: 2,
        distinct: 2,
        files: 2,
        orphan: 1,
    },
    runs: [
        {
            skill: "(no skill active)",
            ts: "2026-09-03T14:01:00Z",
            files: [
                {
                    ts: "t",
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
                    ts: "t",
                    tool: "edit",
                    path: "/w/src/auth/token.ts",
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
    collapsed: new Set<number>(),
    width: 30,
};

test("sidebarLines renders the header, every run and its files", () => {
    expect(sidebarLines(VIEW, opts).map((line) => line.text)).toEqual([
        "▼ Skill audit  ⚡2 ✎2 ⚠1",
        "⚠ 14:01 no skill",
        "     ✎ src/index.ts",
        "  14:02 brainstorming",
        "▼ 14:05 test-driven-development",
        "     ✎ src/auth/token.ts",
    ]);
});

test("sidebarLines hides the files of a collapsed run but keeps the run", () => {
    const lines = sidebarLines(VIEW, {
        ...opts,
        collapsed: new Set([2]),
    });

    expect(lines.map((line) => line.text)).toEqual([
        "▼ Skill audit  ⚡2 ✎2 ⚠1",
        "⚠ 14:01 no skill",
        "     ✎ src/index.ts",
        "  14:02 brainstorming",
        "▶ 14:05 test-driven-development (1)",
    ]);
});

test("sidebarLines collapses to the header alone when the section is closed", () => {
    expect(
        sidebarLines(VIEW, {
            ...opts,
            sectionOpen: false,
        }).map((line) => line.text),
    ).toEqual(["▶ Skill audit  ⚡2 ✎2 ⚠1"]);
});

test("sidebarLines says so when the session has recorded nothing yet", () => {
    expect(sidebarLines(EMPTY, opts).map((line) => line.text)).toEqual([
        "▼ Skill audit  ⚡0 ✎0",
        "  no events yet",
    ]);
});

test("sidebarLines tags the run a click should toggle", () => {
    const lines = sidebarLines(VIEW, opts);

    expect(
        lines.filter((line) => line.runIndex !== undefined).map((line) => line.runIndex),
    ).toEqual([0, 1, 2]);
});

test("sidebarLines tones warnings apart from skills and files", () => {
    const lines = sidebarLines(VIEW, opts);

    expect(lines.map((line) => line.tone)).toEqual([
        "text",
        "warning",
        "muted",
        "accent",
        "accent",
        "muted",
    ]);
});
