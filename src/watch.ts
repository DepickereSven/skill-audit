import { type FSWatcher, statSync, watch } from "node:fs"

import { logDir, logPath } from "./log"
import type { Timeout } from "@opentui/core";

export type WatchOptions = { debounceMs?: number; pollMs?: number }

function mtime(path: string): number {
    try {
        return statSync(path).mtimeMs
    } catch {
        return 0
    }
}

/**
 * Call `onChange` when a session's log changes.
 *
 * Watches the log directory rather than the file, because the file does not
 * exist until the session's first event. The interval is a fallback: fs.watch
 * misses changes on some network and container filesystems.
 */
export function watchSession(sessionID: string, onChange: () => void, options: WatchOptions = {}): () => void {
    const debounceMs: number = options.debounceMs ?? 100
    const pollMs: number = options.pollMs ?? 2000
    const path: string = logPath(sessionID)
    let last: number = mtime(path)
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped: boolean = false

    const fire: () => void = () => {
        if (stopped) {
            return
        }
        const current: number = mtime(path)
        if (current === last) {
            return
        }
        last = current
        onChange()
    }

    const schedule: () => void = () => {
        if (stopped) {
            return
        }
        clearTimeout(timer)
        timer = setTimeout(fire, debounceMs)
    }

    let watcher: FSWatcher | undefined
    try {
        watcher = watch(logDir(), schedule)
    } catch {
        watcher = undefined
    }
    const poll: Timeout = setInterval(fire, pollMs)

    return () => {
        stopped = true
        clearTimeout(timer)
        clearInterval(poll)
        watcher?.close()
    }
}
