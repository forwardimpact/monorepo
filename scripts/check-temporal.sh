#!/usr/bin/env bash
# Flag temporal references embedded in code, docs, and tests. A "temporal"
# reference points to a transient artefact — a spec number, design number,
# plan number, GitHub issue, GitHub PR. Once the artefact is closed or
# superseded, the reference rots: readers chase a number that no longer
# explains anything. Every comment, log message, or test label should
# stand on its own and explain WHY the code exists, not WHEN it landed.
#
# Out of scope: specs/ (specs reference each other by number on purpose),
# wiki/ (agent memory archive), benchmarks/ (fixture safety), generated/,
# node_modules/, .git/. The lock file and other vendored artefacts are also
# excluded via the glob list below.
#
# Usage: scripts/check-temporal.sh
# Wired into: bun run invariants (root package.json).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v rg >/dev/null 2>&1; then
    echo "error: ripgrep (rg) is required for check-temporal.sh" >&2
    exit 2
fi

# Each pattern targets one shape of temporal reference. Patterns are anchored
# with word boundaries (`\b`) and case-insensitive (`-i`) so we catch
# variations like "Spec 1070", "spec-1060", "SPEC 640".
PATTERNS=(
    # "spec NNN" or "spec-NNN" — a directory under specs/ called out by number.
    '\bspec[- ][0-9]{2,5}\b'
    # "design NNN" / "design-NNN" — internal design doc reference.
    '\bdesign[- ][0-9]{2,5}\b'
    # "plan NNN" / "plan-NNN" — internal plan doc reference.
    '\bplan[- ][0-9]{2,5}\b'
    # "issue #NNN" / "issue NNN" — GitHub issue reference.
    '\bissue[- ]?#?[0-9]{2,5}\b'
    # "PR #NNN" / "PR NNN" / "pull #NNN" — GitHub pull request reference.
    '\b(pr|pull)[- ]?#[0-9]{2,5}\b'
    # "GH-NNN" — short-form GitHub reference.
    '\bGH-[0-9]{2,5}\b'
    # "(#NNN)" — bare GitHub-style issue/PR reference in parentheses.
    '\(#[0-9]{2,5}\)'
    # " #NNN" preceded by whitespace and followed by word boundary — bare
    # issue/PR refs in prose. Tight enough to skip CSS hex (`#fff`,
    # `#1a73e8`), HTML entities (`&#039;`), and shebangs.
    '[[:space:]]#[0-9]{2,5}\b'
    # Temporal phrasings that name a number indirectly.
    '\b(introduced|added|landed|shipped|removed) in (spec|design|plan|PR|issue)\b'
    '\bas of (spec|design|plan|PR|issue) [0-9]+\b'
    '\bpre-migration\b'
    '\bduring spec [0-9]+ migration\b'
)

# Globs we must search, and globs we must skip. ripgrep respects .gitignore
# by default; the extra `--glob '!...'` rules below cover directories that
# are intentionally checked in (specs/, wiki/) but excluded from this
# invariant.
RG_FLAGS=(
    --hidden
    --no-messages
    --line-number
    --color never
    -i
    --glob '!.git/**'
    --glob '!node_modules/**'
    --glob '!generated/**'
    --glob '!specs/**'
    --glob '!wiki/**'
    --glob '!benchmarks/**'
    --glob '!bun.lock'
    --glob '!package-lock.json'
    --glob '!*.lock'
    --glob '!scripts/check-temporal.sh'
)

status=0
matches=""
for pat in "${PATTERNS[@]}"; do
    if hits=$(rg "${RG_FLAGS[@]}" -e "$pat" . 2>/dev/null); then
        matches+="$hits"$'\n'
        status=1
    fi
done

if [ "$status" -ne 0 ]; then
    echo "error: temporal references found — replace each with a short, non-temporal description that explains WHY the code is there." >&2
    echo "" >&2
    printf '%s' "$matches" | sort -u >&2
    echo "" >&2
    echo "If a match is a false positive (CSS hex, HTML entity, runtime ID, opaque fixture ID), narrow the pattern in scripts/check-temporal.sh rather than leaving the temporal reference in place." >&2
    exit 1
fi

echo "check-temporal: no temporal references found"
