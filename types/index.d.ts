// The Claude Code pane's `$.state` contract. Values live with the host, not the
// module, so a hot reload keeps the timeline and the person's collapsed rows.
// Self-contained by rule: these mirror `SessionView` in src/core.ts, and the
// hooks module assigns one to the other, so tsc catches any drift.

export type AuditPaneFile = { ts: string; tool: string; path: string };
export type AuditPaneRun = { skill: string; ts: string; files: AuditPaneFile[] };
export type AuditPaneView = {
    runs: AuditPaneRun[];
    summary: { runs: number; distinct: number; files: number; orphan: number };
    cwd: string;
};

declare module "claude-code" {
    interface PluginState {
        "skill-audit": {
            /** The last view built from the session log. */
            view: AuditPaneView;
            /** The log text `view` was built from; an unchanged read redraws nothing. */
            source: string;
            /** Keys of runs and hour buckets the person collapsed. */
            collapsed: string[];
            /** The last read failed for a reason other than a missing log. */
            readError: boolean;
        };
    }
}
