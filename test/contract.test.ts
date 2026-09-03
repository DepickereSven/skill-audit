import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { appendFile, appendSkill, group, parse, summarize } from "../src/log"

const FIXTURE = join(import.meta.dir, "fixtures", "session.ndjson")
const ORIGINAL_DIR = process.env.SKILL_AUDIT_DIR

afterEach(() => {
    if (ORIGINAL_DIR === undefined) {
        delete process.env.SKILL_AUDIT_DIR
    } else {
        process.env.SKILL_AUDIT_DIR = ORIGINAL_DIR
    }
})

test("the JavaScript writer reproduces the golden log byte for byte", () => {
    const dir = mkdtempSync(join(tmpdir(), "skill-audit-contract-"))
    process.env.SKILL_AUDIT_DIR = dir

    appendFile("golden", {ts: "2026-09-03T14:01:00Z", tool: "edit", path: "/w/src/index.ts", cwd: "/w"})
    appendSkill("golden", {ts: "2026-09-03T14:02:00Z", name: "superpowers:brainstorming", cwd: "/w"})
    appendSkill("golden", {ts: "2026-09-03T14:05:00Z", name: "superpowers:test-driven-development", cwd: "/w"})
    appendFile("golden", {ts: "2026-09-03T14:06:00Z", tool: "edit", path: "/w/src/auth/token.ts", cwd: "/w"})
    appendFile("golden", {ts: "2026-09-03T14:09:00Z", tool: "write", path: "/w/src/auth/token.test.ts", cwd: "/w"})
    appendFile("golden", {ts: "2026-09-03T14:20:00Z", tool: "apply_patch", path: "/w/README.md", cwd: "/w"})

    expect(readFileSync(join(dir, "golden.ndjson"), "utf8")).toBe(readFileSync(FIXTURE, "utf8"))
})

test("group produces the same runs the golden report displays", () => {
    const events = parse(readFileSync(FIXTURE, "utf8"))

    expect(group(events).map((run) => [run.skill, run.files.length])).toEqual([
        ["(no skill active)", 1],
        ["superpowers:brainstorming", 0],
        ["superpowers:test-driven-development", 3],
    ])
    expect(summarize(events)).toEqual({runs: 2, distinct: 2, files: 4, orphan: 1})
})
