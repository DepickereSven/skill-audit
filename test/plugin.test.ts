import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import plugin from "../src/index"
import { parse } from "../src/log"

const ORIGINAL_DIR = process.env.SKILL_AUDIT_DIR

afterEach(() => {
    if (ORIGINAL_DIR === undefined) {
        delete process.env.SKILL_AUDIT_DIR
    } else {
        process.env.SKILL_AUDIT_DIR = ORIGINAL_DIR
    }
})

test("the server plugin logs a session driven through its tool.execute.after hook", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skill-audit-plugin-"))
    process.env.SKILL_AUDIT_DIR = dir

    const hooks = await plugin.server({directory: "/w", worktree: "/w"} as never)
    await hooks["tool.execute.after"]!(
        {tool: "skill", sessionID: "ses_1", callID: "c1", args: {name: "superpowers:tdd"}},
        {title: "", output: "", metadata: {}},
    )
    await hooks["tool.execute.after"]!(
        {tool: "edit", sessionID: "ses_1", callID: "c2", args: {filePath: "src/a.ts"}},
        {title: "", output: "", metadata: {}},
    )

    expect(parse(readFileSync(join(dir, "ses_1.ndjson"), "utf8"))).toMatchObject([
        {kind: "skill", name: "superpowers:tdd", cwd: "/w", source: "tool"},
        {kind: "file", tool: "edit", path: "/w/src/a.ts", cwd: "/w"},
    ])
})

test("the plugin exposes the id and server entry opencode loads", () => {
    expect(plugin.id).toBe("skill-audit")
    expect(typeof plugin.server).toBe("function")
})
