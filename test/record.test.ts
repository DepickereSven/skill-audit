import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "bun:test";

import { parse } from "../src/log";
import { record } from "../src/record";

const ORIGINAL_DIR = process.env.SKILL_AUDIT_DIR;

afterEach(() => {
    if (ORIGINAL_DIR === undefined) {
        delete process.env.SKILL_AUDIT_DIR;
    } else {
        process.env.SKILL_AUDIT_DIR = ORIGINAL_DIR;
    }
});

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "skill-audit-record-"));
    process.env.SKILL_AUDIT_DIR = dir;
    return dir;
}

const read = (dir: string) => parse(readFileSync(join(dir, "s1.ndjson"), "utf8"));

test("record logs the skill tool as a skill event", () => {
    const dir = tempDir();

    record(
        {
            tool: "skill",
            sessionID: "s1",
            args: { name: "superpowers:tdd" },
        },
        "/w",
    );

    expect(read(dir)).toMatchObject([
        {
            kind: "skill",
            name: "superpowers:tdd",
            source: "tool",
        },
    ]);
});

test("record logs edit and write as file events", () => {
    const dir = tempDir();

    record(
        {
            tool: "edit",
            sessionID: "s1",
            args: { filePath: "/w/a.ts" },
        },
        "/w",
    );
    record(
        {
            tool: "write",
            sessionID: "s1",
            args: { filePath: "/w/b.ts" },
        },
        "/w",
    );

    expect(read(dir)).toMatchObject([
        {
            kind: "file",
            tool: "edit",
            path: "/w/a.ts",
        },
        {
            kind: "file",
            tool: "write",
            path: "/w/b.ts",
        },
    ]);
});

test("record logs one file event per path in an apply_patch payload", () => {
    const dir = tempDir();
    const patchText = [
        "*** Begin Patch",
        "*** Add File: a.ts",
        "*** Delete File: b.ts",
        "*** End Patch",
    ].join("\n");

    record(
        {
            tool: "apply_patch",
            sessionID: "s1",
            args: { patchText },
        },
        "/w",
    );

    expect(read(dir)).toMatchObject([
        {
            kind: "file",
            tool: "apply_patch",
            path: "/w/a.ts",
        },
        {
            kind: "file",
            tool: "apply_patch",
            path: "/w/b.ts",
        },
    ]);
});

test("record ignores tools that neither invoke a skill nor change a file", () => {
    const dir = tempDir();

    record(
        {
            tool: "read",
            sessionID: "s1",
            args: { filePath: "/w/a.ts" },
        },
        "/w",
    );
    record(
        {
            tool: "bash",
            sessionID: "s1",
            args: { command: "rm -rf /w" },
        },
        "/w",
    );

    expect(existsSync(join(dir, "s1.ndjson"))).toBe(false);
});

test("record never throws on a malformed payload", () => {
    tempDir();

    expect(() =>
        record(
            {
                tool: "edit",
                sessionID: "s1",
                args: null,
            },
            "/w",
        ),
    ).not.toThrow();
    expect(() =>
        record(
            {
                tool: "skill",
                sessionID: "s1",
                args: undefined,
            },
            "/w",
        ),
    ).not.toThrow();
});
