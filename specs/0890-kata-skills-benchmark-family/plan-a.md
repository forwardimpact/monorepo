# Plan 0890-a — Kata-Skills Benchmark Family (v1, no ablation)

## Approach

Add a new top-level `benchmarks/` directory with a catalog README and a
sentinel fixture marker, then build one family at `benchmarks/kata-skills/`
that consists of three checked-in artefacts (family README, judge profile,
single v1 task) plus a regime-aware staging script that produces a valid
`fit-benchmark` family tree at build time (per spec [#870](../870-fit-benchmark-coding-tasks/design-a.md)).
The task `kata-spec/write-feature-spec/` ships an `instructions.md`, a
brief + JTBD excerpt under `specs/`, a no-op `workdir/scripts/preflight.sh`,
a templated `judge.task.md`, and a structural `scoring/run.sh` that emits
NDJSON to `$RESULTS_FD`. A new GitHub Actions workflow drives three triggers
(manual dispatch and weekly schedule stage the published pack; path-filtered
PRs stage from in-repo `.claude/`), invokes `bunx fit-benchmark run` then
`report`, writes the pass@k table to `$GITHUB_STEP_SUMMARY`, asserts the
cost envelope by summing `costUsd` across the JSONL, and uploads the JSONL
artefact. Concurrency is keyed on `github.ref` with `cancel-in-progress`.

Libraries used: `@forwardimpact/libeval` (`fit-benchmark` CLI — `run`, `report`).

## Step 1 — Catalog scaffolding

Intent: establish the top-level `benchmarks/` directory with the catalog
README and the fixture-safety sentinel; wire the path-predicate exclusion
into the monorepo's existing fixture-discovery commands.

**Created:**
- `benchmarks/README.md`
- `benchmarks/.benchmark-fixture` (empty)

**Modified:**
- `CLAUDE.md` — the three `rg` discovery commands listed under § Jobs and
  Checklists must each gain `--glob '!benchmarks/**'`. Without this, the
  fixture `<job>` block inside the task's `jtbd-excerpt.md` would be picked
  up by the canonical discovery commands and the spec's machine-skippability
  success criterion would not hold.

Change:

```
benchmarks/
  .benchmark-fixture                       # sentinel; empty file
  README.md                                # catalog
```

`benchmarks/README.md` carries: a one-line catalog statement, a one-paragraph
"how to add a family" guide naming the required substrate elements
(`apm.lock.yaml`, `.claude/skills/`, `.claude/agents/`, `tasks/<family>/<task>/`),
the fixture-safety mechanism (both path predicate `benchmarks/**` and
ancestor-sentinel `.benchmark-fixture`, with the exact `rg --glob`
exclusion idiom), and a link to spec [#870](../specs/0870-fit-benchmark-coding-tasks/design-a.md)
for substrate-level operational notes. Lists the existing family: `kata-skills`.

Verify: `test -f benchmarks/.benchmark-fixture && test -f benchmarks/README.md`;
`rg '<job ' --glob '!benchmarks/**' JTBD.md` matches existing rows, and
`rg '<job ' benchmarks/` finds no rows.

## Step 2 — Family root + checked-in artefacts

Intent: create the family root with the family README and the family-local
judge agent profile.

**Created:**
- `benchmarks/kata-skills/README.md`
- `benchmarks/kata-skills/.claude/agents/judge.md`
- `benchmarks/kata-skills/.gitignore`

`benchmarks/kata-skills/README.md` documents: the v1 task list (one row),
the regime-aware staging contract (build-time only, never checked in apart
from `judge.md` and the task tree), the marker mechanism from Step 1
(referenced, not re-enumerated), and links to spec #870 for substrate
operational guidance (skill-pack staging, sandbox flags, agent-cwd
discipline, judge-profile-only-for-v1). Does not repeat #870's content.

`benchmarks/kata-skills/.claude/agents/judge.md` is the family-local judge
profile, verbatim:

```markdown
---
name: judge
description: Judge for the kata-skills benchmark family.
---

You are a judge grading agent-emitted specs in the kata-skills benchmark.
Read the scoring result and the agent trace passed in the task prompt;
read the spec the agent wrote at `$WORKDIR/spec.md`. Decide whether the
spec **addresses the brief** — does it propose a solution to the
stated problem? Structural rubric compliance is graded separately;
your job is the judgement structural checks cannot make.

Call `Conclude` with `verdict="success"` if the spec addresses the
brief, `verdict="failure"` otherwise. Include a one-sentence summary
naming the deciding evidence.
```

`benchmarks/kata-skills/.gitignore` excludes everything the staging script
produces. The only checked-in entry under `.claude/` is `judge.md`; the
lockfile is regenerated on every staging run.

```
.claude/skills/
.claude/agents/*
!.claude/agents/judge.md
apm.lock.yaml
```

Verify: `test -f benchmarks/kata-skills/.claude/agents/judge.md`; the
gitignore allows `judge.md` while excluding everything else under
`.claude/`.

## Step 3 — Staging script

Intent: produce a valid `fit-benchmark` family tree at the family root,
selecting source by regime, and write a deterministic `apm.lock.yaml`.

**Created:** `benchmarks/kata-skills/scripts/stage-family.sh` (executable).

```sh
#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAMILY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MONOREPO_ROOT="$(cd "$FAMILY_ROOT/../.." && pwd)"

REGIME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --regime) REGIME="$2"; shift 2 ;;
    *) echo "stage-family.sh: unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ "$REGIME" = "in-repo" ] || [ "$REGIME" = "published" ] || {
  echo "stage-family.sh: --regime in-repo|published required" >&2; exit 2; }

CLAUDE="$FAMILY_ROOT/.claude"
LOCK="$FAMILY_ROOT/apm.lock.yaml"

# Safety: refuse to rm -rf paths outside the family root.
case "$CLAUDE" in
  "$FAMILY_ROOT"/.claude) ;;
  *) echo "stage-family.sh: refusing to clean $CLAUDE outside family root" >&2; exit 1 ;;
esac

# Portable sha256. Linux has sha256sum; macOS ships shasum.
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum
  else shasum -a 256
  fi
}

# Preserve the checked-in judge profile across the rebuild.
JUDGE_TMP=""
if [ -f "$CLAUDE/agents/judge.md" ]; then
  JUDGE_TMP="$(mktemp -d)/judge.md"
  cp "$CLAUDE/agents/judge.md" "$JUDGE_TMP"
fi
rm -rf "$CLAUDE" "$LOCK"
mkdir -p "$CLAUDE/skills" "$CLAUDE/agents"
[ -n "$JUDGE_TMP" ] && cp "$JUDGE_TMP" "$CLAUDE/agents/judge.md"

if [ "$REGIME" = "in-repo" ]; then
  # Strip trailing slash so BSD and GNU cp -R agree on directory semantics.
  for d in "$MONOREPO_ROOT"/.claude/skills/kata-*/; do
    [ -d "$d" ] || continue
    cp -R "${d%/}" "$CLAUDE/skills/"
  done
  for f in "$MONOREPO_ROOT"/.claude/agents/*.md; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    [ "$name" = "judge.md" ] && continue
    cp "$f" "$CLAUDE/agents/$name"
  done
  ID="sha256:$(
    cd "$CLAUDE" && find . -type f | LC_ALL=C sort \
      | while IFS= read -r p; do sha256 < "$p" | awk -v p="$p" '{print $1, p}'; done \
      | sha256 | cut -d' ' -f1
  )"
else
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  # kata-skills is public; thread GITHUB_TOKEN when present to avoid anonymous
  # rate-limiting on shared CI IPs.
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    CLONE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/forwardimpact/kata-skills"
  else
    CLONE_URL="https://github.com/forwardimpact/kata-skills"
  fi
  git clone --depth=1 "$CLONE_URL" "$TMP/pack"
  SHA="$(cd "$TMP/pack" && git rev-parse HEAD)"
  VERSION="$(awk -F': ' '/^version:/{print $2; exit}' "$TMP/pack/apm.yml")"
  # Strip optional quoting around the value (`version: "1.2.3"` form).
  VERSION="${VERSION#\"}"; VERSION="${VERSION%\"}"
  [ -n "$VERSION" ] || { echo "stage-family.sh: could not parse version from apm.yml" >&2; exit 1; }
  for d in "$TMP/pack"/skills/kata-*/; do
    [ -d "$d" ] || continue
    cp -R "${d%/}" "$CLAUDE/skills/"
  done
  for f in "$TMP/pack"/agents/*.agent.md; do
    [ -f "$f" ] || continue
    name="$(basename "$f" .agent.md).md"
    [ "$name" = "judge.md" ] && continue
    cp "$f" "$CLAUDE/agents/$name"
  done
  ID="${VERSION}@${SHA}"
fi

cat > "$LOCK" <<EOF
apm_lock_version: 1
dependencies: []
benchmark:
  regime: ${REGIME}
  source_identity: ${ID}
EOF
```

Verify: run `./benchmarks/kata-skills/scripts/stage-family.sh --regime in-repo`
locally; assert `.claude/skills/kata-spec/SKILL.md` exists, `.claude/agents/judge.md`
is unchanged, `apm.lock.yaml` parses as YAML and carries `regime: in-repo`,
and running the script twice in succession produces byte-identical
`apm.lock.yaml` (in-repo determinism — `find … | sort | sha256sum` is stable
for identical inputs).

## Step 4 — v1 task scaffolding

Intent: ship the single v1 task with all checked-in inputs the agent needs
plus the no-op preflight. The agent's output path is the fixed
`$WORKDIR/spec.md`; inputs land at `$WORKDIR/specs/brief.md` and
`$WORKDIR/specs/jtbd-excerpt.md` via the substrate's `specs/ → cwd/specs/`
copy. The brief targets a specific named feature — a `--filter-tools` flag
for `fit-trace overview` — so the structural rubric has a concrete subject
to grade.

**Created:**
- `benchmarks/kata-skills/tasks/kata-spec/write-feature-spec/instructions.md`
- `benchmarks/kata-skills/tasks/kata-spec/write-feature-spec/supervisor.task.md`
- `benchmarks/kata-skills/tasks/kata-spec/write-feature-spec/judge.task.md`
- `benchmarks/kata-skills/tasks/kata-spec/write-feature-spec/specs/brief.md`
- `benchmarks/kata-skills/tasks/kata-spec/write-feature-spec/specs/jtbd-excerpt.md`
- `benchmarks/kata-skills/tasks/kata-spec/write-feature-spec/workdir/scripts/preflight.sh` (mode `0755`)

File contents:

| File | Contents (summary) |
| --- | --- |
| `instructions.md` | One paragraph: "Read `specs/brief.md` and `specs/jtbd-excerpt.md`. Following the `kata-spec` skill (staged under `.claude/skills/kata-spec/`), write a specification at `spec.md` (at the working-directory root) that addresses the brief. Quote the JTBD persona+job verbatim using the exact `<persona>: <job>` string from the second-level heading of `specs/jtbd-excerpt.md`. Do not write a plan or design — spec only." |
| `supervisor.task.md` | Verbatim body (single line): `<!-- Reserved per spec #0870 design Decision 14; unread in v1. -->`. The file's existence is forward-compat metadata — `TaskFamily` records the path but the harness does not read it in v1. |
| `judge.task.md` | Templated prompt with `{{SCORING}}` and `{{AGENT_TRACE_PATH}}` per #0870 plan Step 6's contract. Verbatim body shown below the table. |
| `specs/brief.md` | The brief itself: "Spec a new `--filter-tools` flag for `fit-trace overview` that restricts the output to events involving a comma-separated list of tool names. The hire is the persona+job at the level-2 heading of `specs/jtbd-excerpt.md`; quote that heading verbatim in your spec's persona section." |
| `specs/jtbd-excerpt.md` | The full `<job user="Platform Builders" goal="Evaluate and Improve Agents"> … </job>` block from `JTBD.md` (copied verbatim including the opening and closing `<job>` tags — locate the block by tag delimiter, not by line number, so it survives upstream edits to `JTBD.md`). |
| `workdir/scripts/preflight.sh` | Executable. Two lines: `#!/bin/sh` and `exit 0` — the script ignores `$WORKDIR`/`$PORT` because v1 ships no scaffold. Substrate gates `install` on `fs.access(path, X_OK)` per #0870 plan Step 8.3. |

Verbatim `judge.task.md` body:

````markdown
Scoring result:

```json
{{SCORING}}
```

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the trace and the
agent-emitted spec at `$WORKDIR/spec.md`. Decide whether the spec
**addresses the brief** in `specs/brief.md` — not just whether it
clears the structural rubric.

Call `Conclude` with `verdict="success"` if the spec addresses the
brief, or `verdict="failure"` if it does not. Include a one-sentence
`summary` naming the deciding evidence.
````

Verify: from the family root, `test -x tasks/kata-spec/write-feature-spec/workdir/scripts/preflight.sh`;
`grep -q '{{SCORING}}' tasks/kata-spec/write-feature-spec/judge.task.md`
and `grep -q '{{AGENT_TRACE_PATH}}' …/judge.task.md`;
`grep -q '<job user="Platform Builders"' tasks/kata-spec/write-feature-spec/specs/jtbd-excerpt.md`.

## Step 5 — Scoring rubric

Intent: grade the agent's emitted `$WORKDIR/spec.md` against the kata-spec
DO-CONFIRM bar. The rubric runs as POSIX `/bin/sh` with `awk`/`grep`/`sed`
only — no language runtime dependency, matching the existing fixture-family
scoring scripts under `libraries/libeval/test/fixtures/benchmark-family/`.

**Created:** `benchmarks/kata-skills/tasks/kata-spec/write-feature-spec/scoring/run.sh` (executable).

```sh
#!/bin/sh
set -u
SPEC="$WORKDIR/spec.md"
JTBD="$WORKDIR/specs/jtbd-excerpt.md"
FAIL=0

emit() { printf '%s\n' "$1" >&"$RESULTS_FD"; }

# 1. File present
if [ ! -f "$SPEC" ]; then
  emit '{"test":"file-present","pass":false,"message":"spec.md missing at WORKDIR/spec.md"}'
  exit 1
fi
emit '{"test":"file-present","pass":true}'

# 2. Problem first: first level-2 heading is "Problem" (case-insensitive)
first_h2="$(awk '/^## / { sub(/^## /,""); sub(/[[:space:]]*$/,""); print; exit }' "$SPEC")"
lc_first="$(printf '%s' "$first_h2" | tr '[:upper:]' '[:lower:]')"
case "$lc_first" in
  problem*) emit '{"test":"problem-first","pass":true}' ;;
  *) emit "{\"test\":\"problem-first\",\"pass\":false,\"message\":\"first level-2 heading is '$first_h2'\"}"
     FAIL=1 ;;
esac

# 3. Specific scope: has Scope section AND an exclusion heading
HAS_SCOPE=0; HAS_EXCL=0
grep -qiE '^## (In )?Scope( |$)' "$SPEC" && HAS_SCOPE=1
grep -qiE '^## Out of scope|^### Out of scope' "$SPEC" && HAS_EXCL=1
if [ "$HAS_SCOPE" = 1 ] && [ "$HAS_EXCL" = 1 ]; then
  emit '{"test":"specific-scope","pass":true}'
else
  emit "{\"test\":\"specific-scope\",\"pass\":false,\"message\":\"scope=$HAS_SCOPE exclusion=$HAS_EXCL\"}"
  FAIL=1
fi

# 4. Verifiable success: "## Success Criteria" (or "## Success") heading
if grep -qiE '^## Success' "$SPEC"; then
  emit '{"test":"verifiable-success","pass":true}'
else
  emit '{"test":"verifiable-success","pass":false,"message":"missing ## Success Criteria"}'
  FAIL=1
fi

# 5. No HOW leak: design § Grading rubric — absence of file:line or function-signature patterns
if grep -qE '[A-Za-z0-9_/.-]+\.(js|ts|sh|py|yml|yaml):[0-9]+|function +[A-Za-z_]+ *\(|async +function' "$SPEC"; then
  emit '{"test":"no-how-leak","pass":false,"message":"file:line or function signature detected"}'
  FAIL=1
else
  emit '{"test":"no-how-leak","pass":true}'
fi

# 6. Cites JTBD: spec contains the canonical "<persona>: <job>" string from the staged <job> tag.
# The string matches the h2 heading inside the excerpt (e.g. "## Platform Builders: Evaluate and Improve Agents")
# and is what the brief tells the agent to quote.
persona_job="$(awk '
  match($0, /<job user="[^"]*" goal="[^"]*">/) {
    s = substr($0, RSTART, RLENGTH)
    match(s, /user="[^"]*"/); u = substr(s, RSTART+6, RLENGTH-7)
    match(s, /goal="[^"]*"/); g = substr(s, RSTART+6, RLENGTH-7)
    print u": "g
    exit
  }' "$JTBD")"
if [ -n "$persona_job" ] && grep -qF "$persona_job" "$SPEC"; then
  emit '{"test":"cites-jtbd","pass":true}'
else
  emit "{\"test\":\"cites-jtbd\",\"pass\":false,\"message\":\"missing '$persona_job'\"}"
  FAIL=1
fi

[ "$FAIL" = 0 ] && exit 0 || exit 1
```

Verify: from the family root, write a passing fixture `spec.md` into a
scratch `$WORKDIR` and call `WORKDIR=…  RESULTS_FD=1 sh tasks/kata-spec/write-feature-spec/scoring/run.sh`;
all six rows emit `pass:true` and the exit code is `0`. Mutate one rule
(drop the `## Problem` heading) and assert the exit code flips to `1` with
`problem-first` reporting `pass:false`.

## Step 6 — Workflow

Intent: drive the family on the three trigger signals, stage with the
correct regime, run + report + assert the cost envelope, upload the
artefact.

**Created:** `.github/workflows/benchmark-kata-skills.yml`.

```yaml
name: Benchmark — kata-skills

on:
  workflow_dispatch:
  schedule:
    - cron: "0 6 * * 1"
  pull_request:
    paths:
      - ".claude/skills/kata-*/**"
      - ".claude/agents/*.md"
      - "benchmarks/kata-skills/**"
      - ".github/workflows/benchmark-kata-skills.yml"

concurrency:
  group: benchmark-kata-skills-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  bench:
    runs-on: ubuntu-latest
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: ./.github/actions/bootstrap
      - name: Stage family
        run: |
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            ./benchmarks/kata-skills/scripts/stage-family.sh --regime in-repo
          else
            ./benchmarks/kata-skills/scripts/stage-family.sh --regime published
          fi
      - name: Run benchmark
        run: |
          bunx fit-benchmark run \
            --family ./benchmarks/kata-skills \
            --output ./bench-output \
            --runs 5 \
            --model claude-haiku-4-5-20251001 \
            --max-turns 25 \
            --judge-profile judge
      - name: Report
        run: |
          bunx fit-benchmark report \
            --input ./bench-output --format text \
            >> "$GITHUB_STEP_SUMMARY"
      - name: Assert cost envelope (≤ $5)
        run: |
          [ -s ./bench-output/results.jsonl ] || { echo "results.jsonl missing or empty" >&2; exit 1; }
          TOTAL=$(jq -s '[.[].costUsd // 0] | add' ./bench-output/results.jsonl)
          echo "Total cost: $TOTAL USD"
          awk -v t="$TOTAL" 'BEGIN { if (t+0 > 5) exit 1 }'
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        if: always()
        with:
          name: results-jsonl
          path: ./bench-output/results.jsonl
          if-no-files-found: warn
```

Verify: `actionlint .github/workflows/benchmark-kata-skills.yml` (or
`bun run check`) returns zero. The three trigger blocks are present
(`workflow_dispatch`, `schedule`, `pull_request` with paths filter).
`concurrency.group` resolves per `github.ref` and `cancel-in-progress`
is `true`. The `Stage family` step branches on `github.event_name`. The
`Assert cost envelope` step fails when the sum exceeds 5.

## Step 7 — Local verification + quality gates

Intent: prove the family loads and grades end-to-end on the developer's
machine before opening the PR; run formatting and check gates.

**Preconditions:** `ANTHROPIC_API_KEY` must be set in the shell — the
benchmark invokes a live model and will error otherwise. Run on Linux
or macOS; the staging script and rubric are POSIX shell.

**Modified by `bun run context:fix`:** the codegen step may regenerate
catalog rows in `libraries/README.md` and other auto-managed files (the
canonical list of touched paths is whatever `context:fix` reports). Stage
and commit only the rows that reference the new `benchmarks/` tree;
revert unrelated diffs.

Run, from the repo root:

```sh
./benchmarks/kata-skills/scripts/stage-family.sh --regime in-repo
bunx fit-benchmark run --family ./benchmarks/kata-skills \
  --output /tmp/bench-890 --runs 1 \
  --model claude-haiku-4-5-20251001 --max-turns 25 \
  --judge-profile judge
bunx fit-benchmark report --input /tmp/bench-890 --format text
bun run check
bun run format:fix
bun run context:fix
```

Verify: the run completes; `/tmp/bench-890/results.jsonl` exists with one
JSON line whose `taskId` is `kata-spec/write-feature-spec` and whose
`skillSetHash` starts with `sha256:`; the report renders a markdown table
with `pass@1`. Quality gates exit `0`.

## Risks

1. **Haiku may not pass the strict rubric.** v1 pins
   `claude-haiku-4-5-20251001` for cost. The structural rubric is six
   checks all of which must pass; the design's literal `no-how-leak`
   regex fires on any `*.{js,ts,sh,py,yml,yaml}:NN` substring and any
   `function NAME(` sequence. If Haiku regularly emits substrate file
   citations or function-named prose when explaining its spec, pass@5 is
   0. The model-behaviour-vs-rubric calibration is not observable from
   reading the rubric alone — v1 surfaces it empirically, and adjusting
   the rubric or the model is a follow-up per spec § Out of scope.

## Execution recommendation

Single engineering executor, sequential. Steps 1 → 2 → 3 → 4 → 5 → 6 → 7
have a strict dependency chain: the catalog scaffolds the family root,
the family root provides the script's target, the script's regime contract
is consumed by the workflow, and verification touches every preceding
artefact. Route the prose in Steps 1 and 2 (catalog README, family
README) to `technical-writer` after Step 6 lands if pacing allows;
otherwise the same engineering agent owns the full plan in one session.
The plan is small enough that decomposition into `plan-a-NN.md` parts
would add structural overhead without parallelism benefit (no two steps
can run concurrently).

— Staff Engineer 🛠️
