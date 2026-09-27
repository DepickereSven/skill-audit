import { expect, test } from "bun:test";

import type { SkillRun, TimelineFile } from "../src/log";
import {
    bucketByHour,
    displayPath,
    headerLine,
    hhmm,
    hourKey,
    hourTitle,
    icons,
    runTitle,
    shortName,
} from "../src/view";

test("hhmm renders the local clock time of a UTC timestamp", () => {
    expect(hhmm("2026-09-03T14:02:07Z")).toBe("14:02");
});

test("hhmm falls back to the raw field when the timestamp will not parse", () => {
    expect(hhmm("t")).toBe("");
});

test("hourKey buckets a timestamp onto its local hour", () => {
    expect(hourKey("2026-09-03T14:02:07Z")).toBe("14:00");
    expect(hourKey("2026-09-03T14:59:59Z")).toBe("14:00");
    expect(hourKey("2026-09-03T15:00:00Z")).toBe("15:00");
});

test("shortName drops the plugin namespace so the name fits a narrow sidebar", () => {
    expect(shortName("superpowers:brainstorming")).toBe("brainstorming");
    expect(shortName("skill-audit")).toBe("skill-audit");
});

const edit = (ts: string, path: string): TimelineFile => ({
    ts,
    tool: "edit",
    path,
});

test("bucketByHour splits a run's files on the hour boundary, in order", () => {
    const buckets = bucketByHour([
        edit("2026-09-03T09:15:00Z", "/w/a.ts"),
        edit("2026-09-03T09:47:00Z", "/w/b.ts"),
        edit("2026-09-03T14:03:00Z", "/w/c.ts"),
    ]);

    expect(buckets.map((b) => [b.hour, b.files.map((f) => f.path)])).toEqual([
        ["09:00", ["/w/a.ts", "/w/b.ts"]],
        ["14:00", ["/w/c.ts"]],
    ]);
});

test("bucketByHour keeps a single-hour run in one bucket", () => {
    const buckets = bucketByHour([
        edit("2026-09-03T09:15:00Z", "/w/a.ts"),
        edit("2026-09-03T09:47:00Z", "/w/b.ts"),
    ]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.hour).toBe("09:00");
});

test("bucketByHour reopens an hour that recurs the next day", () => {
    const buckets = bucketByHour([
        edit("2026-09-03T09:15:00Z", "/w/a.ts"),
        edit("2026-09-03T14:03:00Z", "/w/b.ts"),
        edit("2026-09-04T09:05:00Z", "/w/c.ts"),
    ]);

    expect(buckets.map((b) => b.hour)).toEqual(["09:00", "14:00", "09:00"]);
});

test("bucketByHour returns nothing for a run that touched no files", () => {
    expect(bucketByHour([])).toEqual([]);
});

test("headerLine omits the warning count when nothing was edited outside a skill", () => {
    expect(
        headerLine({
            runs: 3,
            distinct: 2,
            files: 7,
            orphan: 0,
        }),
    ).toBe("Skill audit  ·3 ✎7");
});

test("headerLine shows the warning count when edits happened outside a skill", () => {
    expect(
        headerLine({
            runs: 3,
            distinct: 2,
            files: 7,
            orphan: 1,
        }),
    ).toBe("Skill audit  ·3 ✎7 !1");
});

const run = (skill: string, files: number): SkillRun => ({
    skill,
    ts: "2026-09-03T14:05:00Z",
    files: Array.from({ length: files }, (_, i) => edit("2026-09-03T14:05:00Z", `/w/${i}.ts`)),
});

test("runTitle leads with the skill name, not the time", () => {
    expect(runTitle(run("superpowers:tdd", 2), false)).toBe("▼ tdd");
});

test("runTitle marks a collapsed run and shows how many files it hides", () => {
    expect(runTitle(run("superpowers:tdd", 2), true)).toBe("▶ tdd (2)");
});

test("runTitle marks a run with no files as having nothing to expand", () => {
    expect(runTitle(run("superpowers:tdd", 0), true)).toBe("  tdd");
});

test("runTitle flags the synthetic run for edits made outside any skill", () => {
    expect(runTitle(run("(no skill active)", 1), false)).toBe("▼ ! no skill");
});

test("hourTitle shows the hour and how many files landed in it", () => {
    const bucket = {
        day: "2026-09-03",
        hour: "14:00",
        files: [edit("2026-09-03T14:05:00Z", "/w/a.ts")],
    };

    expect(hourTitle(bucket, false)).toBe("▼ 14:00 (1)");
    expect(hourTitle(bucket, true)).toBe("▶ 14:00 (1)");
});

test("icons defaults to glyphs that occupy one terminal cell", () => {
    delete process.env.SKILL_AUDIT_ICONS;

    expect(icons()).toEqual({
        run: "·",
        file: "✎",
        warn: "!",
        open: "▼",
        closed: "▶",
    });
});

test("icons restores the emoji set on request", () => {
    process.env.SKILL_AUDIT_ICONS = "emoji";

    expect(icons()).toEqual({
        run: "⚡",
        file: "✎",
        warn: "⚠",
        open: "▼",
        closed: "▶",
    });
    delete process.env.SKILL_AUDIT_ICONS;
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

test("bucketByHour keeps the same clock hour on two days in separate buckets", () => {
    const buckets = bucketByHour([
        edit("2026-09-03T09:15:00Z", "/w/a.ts"),
        edit("2026-09-04T09:05:00Z", "/w/b.ts"),
    ]);

    expect(buckets.map((b) => [b.day, b.hour])).toEqual([
        ["2026-09-03", "09:00"],
        ["2026-09-04", "09:00"],
    ]);
});
