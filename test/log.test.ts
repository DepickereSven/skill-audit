import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import type { AuditEvent } from "../src/log"
import { appendFile, appendSkill, group, logPath, nowTs, parse, parsePatch, readSession, summarize } from "../src/log"

const ORIGINAL_DIR = process.env.SKILL_AUDIT_DIR

afterEach(() => {
    if (ORIGINAL_DIR === undefined) {
        delete process.env.SKILL_AUDIT_DIR
    } else {
        process.env.SKILL_AUDIT_DIR = ORIGINAL_DIR
    }
})

test("logPath defaults to ~/.claude/skill-audit", () => {
    delete process.env.SKILL_AUDIT_DIR

    expect(logPath("abc123")).toBe(join(homedir(), ".claude", "skill-audit", "abc123.ndjson"))
})

test("logPath honours SKILL_AUDIT_DIR", () => {
    process.env.SKILL_AUDIT_DIR = "/tmp/audit"

    expect(logPath("abc123")).toBe("/tmp/audit/abc123.ndjson")
})

test("parse reads skill and file events in order", () => {
    const text = [
        '{"ts":"2026-09-03T14:02:00Z","kind":"skill","name":"brainstorming","args":"","cwd":"/w","source":"tool"}',
        '{"ts":"2026-09-03T14:05:00Z","kind":"file","tool":"edit","path":"/w/a.ts","cwd":"/w"}',
    ].join("\n")

    const events = parse(text)

    expect(events).toEqual([
        {ts: "2026-09-03T14:02:00Z", kind: "skill", name: "brainstorming", args: "", cwd: "/w", source: "tool"},
        {ts: "2026-09-03T14:05:00Z", kind: "file", tool: "edit", path: "/w/a.ts", cwd: "/w"},
    ])
})

test("parse skips blank lines and a truncated trailing write", () => {
    const text = '{"ts":"t","kind":"skill","name":"a"}\n\n{"ts":"t","kind":"fi'

    expect(parse(text).map((e) => e.kind)).toEqual(["skill"])
})

const skill = (ts: string, name: string): AuditEvent => ({ts, kind: "skill", name})
const file = (ts: string, path: string): AuditEvent => ({ts, kind: "file", tool: "edit", path})

test("group attaches files to the skill run that preceded them", () => {
    const runs = group([skill("t1", "tdd"), file("t2", "/w/a.ts"), file("t3", "/w/b.ts")])

    expect(runs).toEqual([
        {
            skill: "tdd",
            ts: "t1",
            files: [{ts: "t2", tool: "edit", path: "/w/a.ts"}, {ts: "t3", tool: "edit", path: "/w/b.ts"}]
        },
    ])
})

test("group opens a synthetic run for files edited before any skill", () => {
    const runs = group([file("t1", "/w/a.ts"), skill("t2", "tdd")])

    expect(runs).toEqual([
        {skill: "(no skill active)", ts: "t1", files: [{ts: "t1", tool: "edit", path: "/w/a.ts"}]},
        {skill: "tdd", ts: "t2", files: []},
    ])
})

test("group returns nothing for an empty log", () => {
    expect(group([])).toEqual([])
})

test("summarize counts runs, distinct skills and unique file paths", () => {
    const events = [
        skill("t1", "tdd"),
        file("t2", "/w/a.ts"),
        file("t3", "/w/a.ts"),
        skill("t4", "tdd"),
        skill("t5", "brainstorming"),
        file("t6", "/w/b.ts"),
    ]

    expect(summarize(events)).toEqual({runs: 3, distinct: 2, files: 2, orphan: 0})
})

test("summarize counts edits made before any skill as orphaned", () => {
    const events = [file("t1", "/w/a.ts"), file("t2", "/w/b.ts"), skill("t3", "tdd"), file("t4", "/w/c.ts")]

    expect(summarize(events).orphan).toBe(2)
})

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "skill-audit-"))
    process.env.SKILL_AUDIT_DIR = dir
    return dir
}

test("appendSkill writes the same field order as logger.sh", () => {
    const dir = tempDir()

    appendSkill("s1", {ts: "2026-09-03T14:02:00Z", name: "superpowers:brainstorming", cwd: "/w"})

    expect(readFileSync(join(dir, "s1.ndjson"), "utf8")).toBe(
        '{"ts":"2026-09-03T14:02:00Z","kind":"skill","name":"superpowers:brainstorming","args":"","cwd":"/w","source":"tool"}\n',
    )
})

test("appendFile writes the same field order as logger.sh", () => {
    const dir = tempDir()

    appendFile("s1", {ts: "2026-09-03T14:05:00Z", tool: "edit", path: "/w/a.ts", cwd: "/w"})

    expect(readFileSync(join(dir, "s1.ndjson"), "utf8")).toBe(
        '{"ts":"2026-09-03T14:05:00Z","kind":"file","tool":"edit","path":"/w/a.ts","cwd":"/w"}\n',
    )
})

test("appendFile resolves a relative path against cwd", () => {
    const dir = tempDir()

    appendFile("s1", {ts: "t", tool: "write", path: "src/a.ts", cwd: "/w"})

    expect(parse(readFileSync(join(dir, "s1.ndjson"), "utf8"))[0]).toMatchObject({path: "/w/src/a.ts"})
})

test("appendFile ignores /dev/null and empty paths", () => {
    const dir = tempDir()

    appendFile("s1", {ts: "t", tool: "write", path: "/dev/null", cwd: "/w"})
    appendFile("s1", {ts: "t", tool: "write", path: "", cwd: "/w"})

    expect(existsSync(join(dir, "s1.ndjson"))).toBe(false)
})

test("appendSkill never throws when the log directory cannot be written", () => {
    process.env.SKILL_AUDIT_DIR = "/dev/null/nope"

    expect(() => appendSkill("s1", {ts: "t", name: "tdd", cwd: "/w"})).not.toThrow()
})

test("parsePatch extracts every touched path from a patchText payload", () => {
    const patchText = [
        "*** Begin Patch",
        "*** Add File: src/new.ts",
        "+export const a = 1",
        "*** Update File: src/old.ts",
        "@@",
        "-const a = 1",
        "+const a = 2",
        "*** Delete File: src/gone.ts",
        "*** End Patch",
    ].join("\n")

    expect(parsePatch({patchText})).toEqual(["src/new.ts", "src/old.ts", "src/gone.ts"])
})

test("parsePatch follows a rename to the destination path", () => {
    const patchText = ["*** Begin Patch", "*** Update File: a.ts", "*** Move to: b.ts", "*** End Patch"].join("\n")

    expect(parsePatch({patchText})).toEqual(["a.ts", "b.ts"])
})

test("parsePatch returns nothing for a payload it cannot read", () => {
    expect(parsePatch({})).toEqual([])
    expect(parsePatch({patchText: "not a patch"})).toEqual([])
})

test("nowTs matches the second-precision UTC format logger.sh writes", () => {
    expect(nowTs(new Date("2026-09-03T14:02:07.913Z"))).toBe("2026-09-03T14:02:07Z")
})

test("readSession returns an empty view when the session has no log yet", () => {
    tempDir()

    expect(readSession("nothing-here")).toEqual({
        runs: [],
        summary: {runs: 0, distinct: 0, files: 0, orphan: 0},
        cwd: ""
    })
})

test("readSession reports the working directory recorded in the log", () => {
    const dir = tempDir()
    appendSkill("s1", {ts: "2026-09-03T14:02:00Z", name: "tdd", cwd: "/w"})
    appendFile("s1", {ts: "2026-09-03T14:05:00Z", tool: "edit", path: "/w/a.ts", cwd: "/w"})

    const view = readSession("s1")

    expect(view.cwd).toBe("/w")
    expect(view.summary).toEqual({runs: 1, distinct: 1, files: 1, orphan: 0})
    expect(view.runs).toHaveLength(1)
})
