import { readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { expect, test } from "bun:test";

import {
    baseName,
    DEFAULT_IDLE_GAP_MS,
    group,
    idleGapFrom,
    parse,
    relativeTo,
    summarize,
    toView,
} from "../src/core";

const FIXTURE: string = readFileSync(join(import.meta.dir, "fixtures", "session.ndjson"), "utf8");

test("baseName agrees with node:path basename", () => {
    for (const path of ["/w/src/index.ts", "src/index.ts", "index.ts", "/w/src/", "/", ""]) {
        expect(baseName(path)).toBe(basename(path));
    }
});

test("relativeTo agrees with node:path relative for paths under cwd", () => {
    const cases: [string, string][] = [
        ["/w", "/w/src/index.ts"],
        ["/w", "/w/a"],
        ["/w/project", "/w/project/deep/nested/file.md"],
    ];
    for (const [cwd, path] of cases) {
        expect(relativeTo(path, cwd)).toBe(relative(cwd, path));
    }
});

test("relativeTo leaves paths outside cwd, or with no cwd, unchanged", () => {
    expect(relativeTo("/other/file.ts", "/w")).toBe("/other/file.ts");
    expect(relativeTo("/wx/file.ts", "/w")).toBe("/wx/file.ts");
    expect(relativeTo("/w/file.ts", "")).toBe("/w/file.ts");
});

test("idleGapFrom parses minutes and falls back on anything unusable", () => {
    expect(idleGapFrom(undefined)).toBe(DEFAULT_IDLE_GAP_MS);
    expect(idleGapFrom("nope")).toBe(DEFAULT_IDLE_GAP_MS);
    expect(idleGapFrom("0")).toBe(DEFAULT_IDLE_GAP_MS);
    expect(idleGapFrom("-3")).toBe(DEFAULT_IDLE_GAP_MS);
    expect(idleGapFrom("5")).toBe(5 * 60_000);
});

test("toView builds runs, summary and cwd from log text", () => {
    const events = parse(FIXTURE);
    const view = toView(FIXTURE, DEFAULT_IDLE_GAP_MS);
    expect(view.runs).toEqual(group(events, DEFAULT_IDLE_GAP_MS));
    expect(view.summary).toEqual(summarize(events, DEFAULT_IDLE_GAP_MS));
    expect(view.cwd).toBe(events.find((event) => event.cwd)?.cwd ?? "");
});

test("toView of empty text is an empty session", () => {
    expect(toView("", DEFAULT_IDLE_GAP_MS)).toEqual({
        runs: [],
        summary: {
            runs: 0,
            distinct: 0,
            files: 0,
            orphan: 0,
        },
        cwd: "",
    });
});

test("core.ts and view.ts stay free of Node so the Claude Code pane can load them", () => {
    for (const file of ["core.ts", "view.ts"]) {
        const source: string = readFileSync(join(import.meta.dir, "..", "src", file), "utf8");
        expect(source).not.toMatch(/from "node:/);
        expect(source).not.toMatch(/from "\.\/log"/);
        expect(source).not.toMatch(/\bprocess\./);
    }
});
