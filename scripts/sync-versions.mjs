#!/usr/bin/env node
// Keeps the Claude Code and Codex plugin manifests on the same version as
// package.json. npm owns the version number; these manifests only mirror it,
// so they drift the moment someone bumps one and forgets the others.
//
//   node scripts/sync-versions.mjs           write package.json's version into every manifest
//   node scripts/sync-versions.mjs --check   report drift and exit 1, changing nothing

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const check = process.argv.slice(2).includes("--check");

const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"];

const read = (path) => readFileSync(join(root, path), "utf8");

const {version} = JSON.parse(read("package.json"));
if (typeof version !== "string" || version.length === 0) {
    console.error("sync-versions: package.json has no version");
    process.exit(1);
}

let drifted = 0;

for (const path of MANIFESTS) {
    const source = read(path);
    const manifest = JSON.parse(source);

    if (manifest.version === version) {
        continue;
    }

    drifted += 1;

    if (check) {
        console.error(`sync-versions: ${path} is ${manifest.version}, package.json is ${version}`);
        continue;
    }

    // Patch the version in place rather than re-serializing, so hand-formatted
    // manifests keep their key order, indentation and inline arrays.
    const patched = source.replace(
        /("version"\s*:\s*)"[^"]*"/,
        (_match, prefix) => `${prefix}${JSON.stringify(version)}`,
    );

    if (patched === source) {
        console.error(`sync-versions: could not find a version field to patch in ${path}`);
        process.exit(1);
    }

    writeFileSync(join(root, path), patched);
    console.log(`sync-versions: ${path} -> ${version}`);
}

if (check) {
    if (drifted > 0) {
        console.error(
            `sync-versions: ${drifted} manifest(s) out of sync; run 'bun run sync:versions'`,
        );
        process.exit(1);
    }
    console.log(`sync-versions: ok, every manifest is ${version}`);
} else if (drifted === 0) {
    console.log(`sync-versions: nothing to do, every manifest is already ${version}`);
}
