import { expect, test } from "bun:test";

import type { SkillRun } from "../src/log";
import { displayPath, headerLine, hhmm, runTitle, shortName } from "../src/view";

test("hhmm takes the clock time out of an ISO timestamp", () => {
    expect(hhmm("2026-09-03T14:02:07Z")).toBe("14:02");
});

test("shortName drops the plugin namespace so the name fits a narrow sidebar", () => {
    expect(shortName("superpowers:brainstorming")).toBe("brainstorming");
    expect(shortName("skill-audit")).toBe("skill-audit");
});

test("headerLine omits the warning count when nothing was edited outside a skill", () => {
    expect(
        headerLine({
            runs: 3,
            distinct: 2,
            files: 7,
            orphan: 0,
        }),
    ).toBe("Skill audit  ⚡3 ✎7");
});

test("headerLine shows the warning count when edits happened outside a skill", () => {
    expect(
        headerLine({
            runs: 3,
            distinct: 2,
            files: 7,
            orphan: 1,
        }),
    ).toBe("Skill audit  ⚡3 ✎7 ⚠1");
});

const run = (skill: string, files: number): SkillRun => ({
    skill,
    ts: "2026-09-03T14:05:00Z",
    files: Array.from({ length: files }, (_, i) => ({
        ts: "t",
        tool: "edit",
        path: `/w/${i}.ts`,
    })),
});

test("runTitle marks an expanded run and hides the redundant file count", () => {
    expect(runTitle(run("superpowers:tdd", 2), false)).toBe("▼ 14:05 tdd");
});

test("runTitle marks a collapsed run and shows how many files it hides", () => {
    expect(runTitle(run("superpowers:tdd", 2), true)).toBe("▶ 14:05 tdd (2)");
});

test("runTitle marks a run with no files as having nothing to expand", () => {
    expect(runTitle(run("superpowers:tdd", 0), true)).toBe("  14:05 tdd");
});

test("runTitle flags the synthetic run for edits made outside any skill", () => {
    expect(runTitle(run("(no skill active)", 1), false)).toBe("⚠ 14:05 no skill");
});

test("displayPath strips the session working directory", () => {
    expect(displayPath("/w/src/a.ts", "/w", 30)).toBe("src/a.ts");
});

test("displayPath falls back to the basename when the relative path will not fit", () => {
    expect(displayPath("/w/very/deeply/nested/module/a.ts", "/w", 12)).toBe("a.ts");
});

test("displayPath truncates a basename that is still too long", () => {
    expect(displayPath("/w/a-very-long-file-name.ts", "/w", 10)).toBe("a-very-lo…");
});
