# Plan 2260-a Part 2: Actions + CI axis — the published action and the eval lane

Depends on Part 1 (the `jidoka` bin the action invokes and the renamed
config directory the eval hooks grep for).

## Step 2.1 — Move, rename, and document the action

`git mv .github/actions/coaligned-check products/jidoka/actions/jidoka`,
then edit `action.yml`:

- `name: Jidoka`; description reframed — run the jidoka checks (built-in
  quality: stop the line at the first drifted layer), referencing
  `JIDOKA.md`; the bootstrap prerequisite sentence names `jidoka` as the
  pinned gear binary.
- The run step and comments invoke bare `jidoka` from PATH; inputs
  (`command`, `fix`, `working-directory`) and dispatch logic unchanged.

**Created:** `products/jidoka/actions/jidoka/README.md` — sibling-repo
usage doc in the `harness`/`kata-agent` shape: what the action does, the
bootstrap prerequisite (`forwardimpact/bootstrap@v1` installs `jidoka` as a
default tool), a `uses: forwardimpact/jidoka@v1` YAML example with the three
inputs, and the migration pointer for `coaligned-check` adopters.

**Verify:** `test ! -d .github/actions/coaligned-check`;
`products/jidoka/actions/jidoka/action.yml` parses (`bunx js-yaml` or CI).

## Step 2.2 — Repoint internal consumers

**Modified:** `.github/workflows/check-context.yml` — the three
`uses: ./.github/actions/coaligned-check` steps (`instructions`, `jtbd`,
`invariants` jobs) → `./products/jidoka/actions/jidoka`; `command:` inputs
unchanged.

**Verify:** `rg -n 'coaligned-check' .github/` returns nothing.

## Step 2.3 — Publish the action

**Modified:** `.github/workflows/publish-actions.yml`:

- `on.push.paths` gains `"products/jidoka/actions/jidoka/**"`.
- Matrix gains `- prefix: products/jidoka/actions/jidoka` / `repo: jidoka`.
- Header comment: "six co-located composite actions … four agent-run … two
  Kata" → seven, adding the Jidoka product's one.

The addition is additive — no existing `prefix:`/`repo:` pair changes
(design § Interfaces). The `forwardimpact/jidoka` sibling must exist before
this merges: Step 4.0.

**Verify:** matrix parses; the diff touches no existing leg.

## Step 2.4 — `.github/CLAUDE.md` and the sibling enum

**Modified:** `.github/CLAUDE.md`, `CLAUDE.md`, `KATA.md`.

- `.github/CLAUDE.md` § Third-party actions table gains the row
  `[jidoka](https://github.com/forwardimpact/jidoka) | Jidoka checks
  (instructions, jtbd, invariants) — stop the line on instruction drift`;
  the intro sentence's count and homes update ("under
  `products/{gemba,jidoka,kata}/actions/`"). § Local composite actions
  table drops the `coaligned-check` row.
- `KATA.md` L44 local-actions sentence drops `coaligned-check/` (only
  `audit/` remains).
- Refresh the three `sibling-composite-actions` enum fences (source of
  truth is the table just edited): `bunx jidoka invariants --seed
  enumeration-drift` prints the canonical bodies; update the `CLAUDE.md`
  list fence, the `KATA.md` count+list fences, and the `.github/CLAUDE.md`
  count fence to match.

**Verify:** `bun run invariants` green (enumeration-drift agrees across the
four consumers).

## Step 2.5 — Rename the eval lane

`git mv .github/workflows/eval-coaligned.yml .github/workflows/eval-jidoka.yml`
and `git mv benchmarks/coaligned-skills benchmarks/jidoka-skills`, then:

| File | Change |
| --- | --- |
| `eval-jidoka.yml` | `name: "Eval: Jidoka"`; concurrency group `eval-jidoka-…`; comment "coaligned-skills family" → jidoka; `family: ./benchmarks/jidoka-skills`. The SHA-pinned `forwardimpact/benchmark` reusable-workflow `uses:` is untouched. |
| `apm.yml` | `name: jidoka-skills-benchmark`; dependency `forwardimpact/jidoka-skills` (spec SC14). |
| `README.md` | Title, pack name, skill names (`jidoka-setup`, `jidoka-jtbd`), workflow name, `--family=benchmarks/jidoka-skills`, `.jidoka/invariants/` table cell, "`jidoka-*` skill" prose. |
| `judge.md` | Family name in frontmatter description and body. |
| `tasks/author-job/{agent.task.md,hooks/preflight.sh}` | Skill name `jidoka-jtbd`; `test -d "$AGENT_CWD/.claude/skills/jidoka-jtbd"`. |
| `tasks/bootstrap-repo/{agent.task.md,hooks/preflight.sh}` | Skill name `jidoka-setup`; `test -d …/jidoka-setup`. |
| `tasks/bootstrap-repo/hooks/invariants.sh` | `STARTER` path → `.jidoka/invariants/no-conflict-markers.rules.mjs`; the CONTRIBUTING grep → `'jidoka invariants\|\.jidoka/invariants'`; comment tokens. |
| `tasks/bootstrap-repo/workdir/package.json` | `repository.directory` → `benchmarks/jidoka-skills/tasks/bootstrap-repo/workdir` (workdir fixtures then carry no `coaligned` token — SC14). |
| `benchmarks/README.md` | Families row → `[jidoka-skills/](jidoka-skills/) | forwardimpact/jidoka-skills | eval-jidoka.yml`. |

The pass@k series restarts under the new family name (design § Key
Decisions); no ledger migration.

**Verify:**
`rg -n -i --hidden --no-ignore coaligned benchmarks/ .github/workflows/eval-jidoka.yml`
returns nothing; `test ! -e .github/workflows/eval-coaligned.yml`.

## Step 2.6 — Part gate

`bun run context:fix`, `bun run check`, `bun run test` green. Then the
part-scoped sweep:

```sh
rg -n -i --hidden --no-ignore coaligned .github/ benchmarks/ products/jidoka/
```

Expected: only `publish-skills.yml` lines (Part 3 owns the pack leg) and
`website-coaligned.yaml`/`website.yml` (Part 3 owns the site).
