import type { JSX } from "@opentui/solid"
import { createElement, insert, setProp } from "@opentui/solid"
import { createSignal, onCleanup } from "solid-js"

import type { TuiPlugin, TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"

import { readSession } from "./log"
import { sidebarLines, type Tone } from "./view"
import { watchSession } from "./watch"

/** Registered below opencode's own sidebar content. */
const ORDER = 800
const DEFAULT_WIDTH = 30

type Child = JSX.Element | (() => JSX.Element | JSX.Element[]) | string | null | undefined | false

function element(tag: string, props: Record<string, unknown>, children: Child[] = []): JSX.Element {
    const node = createElement(tag)
    for (const [key, value] of Object.entries(props)) {
        if (value !== undefined) {
            setProp(node, key, value)
        }
    }
    for (const child of children) {
        if (child !== null && child !== undefined && child !== false) {
            insert(node, child)
        }
    }
    return node as JSX.Element
}

function toneColor(theme: TuiThemeCurrent, tone: Tone) {
    if (tone === "accent") {
        return theme.accent
    }
    if (tone === "warning") {
        return theme.warning
    }
    if (tone === "muted") {
        return theme.textMuted
    }
    return theme.text
}

function toggle(set: ReadonlySet<number>, index: number): Set<number> {
    const next = new Set(set)
    if (!next.delete(index)) {
        next.add(index)
    }
    return next
}

function Section(api: TuiPluginApi, sessionID: string, width: number): JSX.Element {
    const [view, setView] = createSignal(readSession(sessionID))
    const [sectionOpen, setSectionOpen] = createSignal(true)
    const [collapsed, setCollapsed] = createSignal<ReadonlySet<number>>(new Set())

    const redraw = () => api.renderer.requestRender()
    onCleanup(
        watchSession(sessionID, () => {
            setView(readSession(sessionID))
            redraw()
        }),
    )

    const rows = () =>
        sidebarLines(view(), {
            sectionOpen: sectionOpen(),
            collapsed: new Set(collapsed()),
            width
        }).map((line, index) => {
            const onMouseDown =
                index === 0
                    ? () => {
                        setSectionOpen((open) => !open)
                        redraw()
                    }
                    : line.runIndex !== undefined
                        ? () => {
                            setCollapsed((current) => toggle(current, line.runIndex!))
                            redraw()
                        }
                        : undefined
            return element("text", {
                fg: toneColor(api.theme.current, line.tone),
                onMouseDown
            }, [line.text])
        })

    return element("box", {
        width: "100%",
        flexDirection: "column"
    }, [rows])
}

export const tui: TuiPlugin = async (api, options) => {
    const width = typeof options?.["width"] === "number" ? (options["width"] as number) : DEFAULT_WIDTH
    api.slots.register({
        order: ORDER,
        slots: {
            sidebar_content: (_ctx, props) => Section(api, props.session_id, width),
        },
    })
}

export default {id: "skill-audit", tui}
