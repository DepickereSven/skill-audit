#!/usr/bin/env bash
# Asserts the bash renderer still reads the golden log the way it always has.
# Paired with test/contract.test.ts, which asserts the JavaScript writer still
# produces that log. Together they catch either writer drifting from the format.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
golden="$here/fixtures/report.txt"

actual="$(SKILL_AUDIT_DIR="$here/fixtures" "$root/scripts/skill-audit" report session)"

if [ ! -f "$golden" ]; then
  printf 'format-contract: missing golden report at %s\n' "$golden" >&2
  exit 1
fi

if ! diff -u "$golden" <(printf '%s\n' "$actual"); then
  printf '\nformat-contract: skill-audit report drifted from the golden output\n' >&2
  exit 1
fi

printf 'format-contract: ok\n'
