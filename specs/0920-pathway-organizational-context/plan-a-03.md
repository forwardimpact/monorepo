# Plan 0920-a · Part 03 — Starter content + baseline fixture

Overview: [plan-a.md](plan-a.md) · Spec: [spec.md](spec.md) · Design: [design-a.md](design-a.md)

Depends on: Part 02 merged. After this part merges, a fresh
`npx fit-pathway agent` against the starter renders the design's reference
section verbatim, and a regression test pins both the populated output and
the byte-identical-absent behavior against a pre-change baseline.

## Step 5 — Starter populated slot

**Created:** `products/map/starter/organizational-context.yaml`

```yaml
# Installation-scoped per-team facts surfaced into the rendered
# .claude/CLAUDE.md by `npx fit-pathway agent`. Edit these values to
# match your team; delete this file entirely if the section should not
# render. See:
# https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md

repositories:
  - molecularforge
  - data-lake-infra
  - api-gateway
team: pharma-platform
manager: athena
adjacentLeads:
  - handle: iris
    role: DX
  - handle: prometheus
    role: DS/AI
projects:
  - drug-discovery-pipeline
  - lab-data-portal
escalationPaths:
  - trigger: production page after hours
    destination: pagerduty://pharma-platform-oncall
  - trigger: security incident
    destination: security@pharma.example.com
```

**Verify:** `bunx fit-map validate --data=products/map/starter` exits 0 with
no warnings citing the new file.

## Step 6 — Pre-change baseline fixture + regression tests

The byte-identical-absent claim needs an empirical anchor: a snapshot of
today's `.claude/CLAUDE.md` for `software_engineering --track=platform`
against the starter **without the slot file**.

**Capture procedure** — run once before Part 03's test file lands. Output
committed verbatim, no edits. Invokes the worktree's local pathway binary
(`node products/pathway/bin/fit-pathway.js`) directly so the captured bytes
are unambiguously from `origin/main`'s code, not whatever `bunx fit-pathway`
resolves to in the operator's bun cache:

```sh
# From repo root on a clean checkout. Captures against origin/main
# before any 920 code changes are in scope.
REPO=$(git rev-parse --show-toplevel)
WORK=$(mktemp -d /tmp/orgctx-baseline.XXXXX)
trap 'cd "$REPO" && git worktree remove --force "$WORK/repo" 2>/dev/null; rm -rf "$WORK"' EXIT

git worktree add "$WORK/repo" origin/main
cp -r "$WORK/repo/products/map/starter" "$WORK/data"
test ! -f "$WORK/data/organizational-context.yaml"  # sanity: pre-0920 main

cd "$WORK/repo"
node "$WORK/repo/products/pathway/bin/fit-pathway.js" agent \
  software_engineering --track=platform \
  --output="$WORK/out" --data="$WORK/data"

mkdir -p "$REPO/products/pathway/test/fixtures"
cp "$WORK/out/.claude/CLAUDE.md" \
  "$REPO/products/pathway/test/fixtures/claude-md-baseline-se-platform.md"
```

**Created:** `products/pathway/test/fixtures/claude-md-baseline-se-platform.md`
— the captured bytes, committed verbatim.

**Line-ending policy:** the fixture is asserted byte-identical by Step 6 case
1, so Git's CRLF normalization on Windows checkouts (or `.gitattributes` rules
elsewhere in the repo) would silently rewrite it and break the test on CI
vs local. Add to `.gitattributes` (create the file if it does not exist):

```
products/pathway/test/fixtures/* text eol=lf
```

This pins LF line endings for every fixture under `fixtures/`. Verify with
`git check-attr text eol products/pathway/test/fixtures/claude-md-baseline-se-platform.md`
— both attributes must report set values.

**Created:** `products/pathway/test/agent-baseline.test.js` — two cases:

1. **Byte-identical absent-slot.** Copy `products/map/starter/` into a temp
   dir, remove `organizational-context.yaml`, run
   `bunx fit-pathway agent software_engineering --track=platform --output=. --data=./data`,
   read `.claude/CLAUDE.md`, assert bytes match the fixture.
2. **Populated starter renders reference section.** Copy
   `products/map/starter/` into a temp dir without removing the slot file,
   run the same command, assert the rendered file:
   - Contains the design's reference section block verbatim.
   - Contains `manager: athena` (placeholder verbatim).
   - Contains both escalation triggers and both destinations verbatim.
   - Contains all three placeholder repos verbatim.
   - Section start offset is past the file's halfway point (sanity check
     on "appended last").

## DO-CONFIRM for Part 03

- `bun run format:fix` clean (no unrelated ripple).
- `bun run check` exits 0.
- `bun run test products/pathway/test/agent-baseline.test.js` exits 0.
- `wc -c products/pathway/test/fixtures/claude-md-baseline-se-platform.md`
  returns a non-zero byte count.
- The fixture is committed as a regular file under
  `products/pathway/test/fixtures/` (no `.gitignore` exclusion).
- `git diff origin/main...HEAD --stat` lists only files in this part's slice
  of the overview File map.

— Staff Engineer 🛠️
