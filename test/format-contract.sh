#!/usr/bin/env bash
# Asserts the bash renderer still reads the golden log the way it always has.
# Paired with test/contract.test.ts, which asserts the JavaScript writer still
# produces that log. Together they catch either writer drifting from the format.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
check() { # $1: subcommand, $2: golden file
  local golden="$here/fixtures/$2" actual
  actual="$(SKILL_AUDIT_DIR="$here/fixtures" "$root/scripts/skill-audit" "$1" session)"

  if [ ! -f "$golden" ]; then
    printf 'format-contract: missing golden %s at %s\n' "$1" "$golden" >&2
    exit 1
  fi

  if ! diff -u "$golden" <(printf '%s\n' "$actual"); then
    printf '\nformat-contract: skill-audit %s drifted from the golden output\n' "$1" >&2
    exit 1
  fi
}

check report report.txt
# status truncates, so it also covers the headers carried across the cut.
check status status.txt

printf 'format-contract: ok\n'
