import { afterEach, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { appendSkill } from "../src/log"
import { watchSession } from "../src/watch"

const ORIGINAL_DIR = process.env.SKILL_AUDIT_DIR

afterEach(() => {
    if (ORIGINAL_DIR === undefined) {
        delete process.env.SKILL_AUDIT_DIR
    } else {
        process.env.SKILL_AUDIT_DIR = ORIGINAL_DIR
    }
})

test("watchSession reports a session that gains its first event", async () => {
    process.env.SKILL_AUDIT_DIR = mkdtempSync(join(tmpdir(), "skill-audit-watch-"))
    let seen = 0
    const stop = watchSession("s1", () => seen++, {debounceMs: 10, pollMs: 20})

    appendSkill("s1", {ts: "t", name: "tdd", cwd: "/w"})
    await Bun.sleep(120)
    stop()

    expect(seen).toBeGreaterThan(0)
})

test("watchSession stops reporting once disposed", async () => {
    process.env.SKILL_AUDIT_DIR = mkdtempSync(join(tmpdir(), "skill-audit-watch-"))
    let seen = 0
    const stop = watchSession("s1", () => seen++, {debounceMs: 10, pollMs: 20})
    appendSkill("s1", {ts: "t", name: "tdd", cwd: "/w"})
    await Bun.sleep(120)

    stop()
    const afterDispose = seen
    appendSkill("s1", {ts: "t", name: "brainstorming", cwd: "/w"})
    await Bun.sleep(120)

    expect(seen).toBe(afterDispose)
})
