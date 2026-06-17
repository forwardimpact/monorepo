# Plan 1830 — Experiment-PR merge-gate approval path

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Land the `exp:NNN` row contract bottom-up: first make libwiki parse and audit
the four-cell experiment row (so STATUS never reddens), then document the
contract (`approval-signals.md`, STATUS header prose), then teach the two
published skills the lifecycle writes and the gate's experiment branch. Code
and its tests land together per step; skill/doc steps are text-only. No shims —
`parseStatusRowId` changes contract in place and every caller migrates in the
same step.

Libraries used: libwiki (`parseStatusRowId`, `STATUS_ID_REGEX`,
`parseStatusRows`, `status-row` rules), libutil (`runRules` — test only),
libmock (`createMockFs` — test only).

## Step 1 — `parseStatusRowId` returns a discriminated kind

Intent: one function classifies a row from its id and cell list.

Files modified: `libraries/libwiki/src/status.js`,
`libraries/libwiki/test/status.test.js`.

- Add `EXP_ID_REGEX = /^exp:\d+$/`; extend `STATUS_ID_REGEX` to
  `/^(\d{4}(\/[a-z0-9-]+)?|exp:\d+)$/`.
- Change `parseStatusRowId(id, cells)` to take the optional `cells` array and
  return a discriminated union:
  - `exp:` id **and** `cells.length === 4` →
    `{ kind: "experiment", issue, state: cells[1], pin: cells[2], planRef: cells[3] }`
    (`issue` = id after `exp:`).
  - else id matches `^\d{4}(\/[a-z0-9-]+)?$` →
    `{ kind: "spec", specId, unit }`.
  - else `null`.
- Update the leading comment to describe both kinds.

Verification: `bun test libraries/libwiki/test/status.test.js` — new cases
cover `exp:1351` with four cells (experiment) and with three cells (null,
since it neither matches `^\d{4}` nor has four cells); the existing
`parseStatusRowId` assertions (`status.test.js:8,12,16`) are rewritten from
`{ specId, unit }` to `{ kind: "spec", specId, unit }`; the existing
`STATUS_ID_REGEX` block (`status.test.js:39-50`) keeps its spec cases and
gains an `exp:1351`-accepts case.

## Step 2 — kind-aware audit: row parser + `status-row` rules

Intent: stop positional `phase`/`status` mapping from misreading a four-cell
row, and audit experiment rows in all three states clean while flagging
malformed ones.

Files modified: `libraries/libwiki/src/audit/scopes.js`,
`libraries/libwiki/src/audit/status-row.js`,
`libraries/libwiki/test/audit-status-row.test.js`.

- `scopes.js parseStatusRows`: keep `cells`; add `kind` via
  `parseStatusRowId(cells[0], cells)`. Retain `id/phase/status` for spec rows;
  experiment rules read `cells` and `kind`, never the positional fields.
- `status-row.js`: gate **every** existing rule (including
  `status-row.id-format`, which tests `STATUS_ID_REGEX.test(s.id)` — now also
  matching `exp:\d+`) on `s.kind === "spec"`, so a malformed `exp:` row never
  passes a spec-shaped rule. Add experiment rules
  (`when: (s) => s.kind === "experiment"`):
  - `status-row.exp-shape` — exactly four cells.
  - `status-row.exp-state` — `cells[1] ∈ {registered, approved, cancelled}`.
  - `status-row.exp-pin` — decidable per state, no "ever approved" inference:
    `registered` → pin is `-`; `approved` → pin is 40-hex `/^[0-9a-f]{40}$/`;
    `cancelled` → pin is 40-hex **or** `-` (a `cancelled` row may or may not
    have been approved; the writer retains the pin, the audit accepts both).
  - `status-row.exp-planref` — `cells[3]` matches `/^#\d+$/`.

Verification: `bun test libraries/libwiki/test/audit-status-row.test.js` — add
cases: `exp:1351\tregistered\t-\t#1351`, `exp:1351\tapproved\t<40hex>\t#1351`,
`exp:1351\tcancelled\t<40hex>\t#1351`, `exp:1351\tcancelled\t-\t#1351` all
clean; a three-cell `exp:1351\tregistered\t-` (shape), bad state, short
`approved` pin, and missing plan-ref each flag; existing spec-row cases still
pass.

## Step 3 — `approval-signals.md` documents the experiment row

Intent: the contract's documentation home gains the experiment row.

Files modified: `.claude/agents/references/approval-signals.md`.

- New section "Experiment rows": key `exp:{issue}`, four cells, states
  `registered → approved → cancelled`, retained head pin.
- Writers table: owning agent writes `registered`/`cancelled`; `kata-dispatch`
  or in-session agent writes `approved` on a human signal, requiring a
  pre-existing `registered` row. Signal types reuse the existing table.
- State the head pin: `approved` records the head SHA; any later commit
  (including a gate rebase) re-blocks until a fresh signal.

Verification: read back that the three states list their writers and
`approved` lists only human-origin signals (the `fit-selfedit` write path is
in Risks).

## Step 4 — STATUS header prose admits experiment rows

Intent: the schema prose describes the experiment key, states, and pin.

Files modified: `wiki/STATUS.md` (header prose only, above the fence).

- Extend the `## Format` section: id may be `exp:\d+`; experiment rows are four
  cells `exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}`; states
  `registered`/`approved`/`cancelled`; pin retained once approved.

Verification: the prose is above the fence, so the `status-row` scope (which
parses only fenced rows) is unaffected; read back that the format section names
`exp:\d+`, the four cells, the three states, and the pin.

## Step 5 — `kata-session` lifecycle: registration, conclusion, PR-open

Intent: the owning agent records the plan + `registered`, writes `cancelled`
on FAIL/VOID, and requests the signal at PR-open.

Files modified:
`.claude/skills/kata-session/references/issue-lifecycle.md`.

- New experiment registration adds an `**Execution plan:**` field — a list of
  repo-root-anchored path globs naming the intended change surface — and, for
  code-shipping experiments, the owning agent writes the `exp:{issue}` row at
  `registered` with `-` pin.
- Conclusion defines PASS / FAIL / VOID; on FAIL or VOID the owning agent
  writes the `exp:{issue}` row to `cancelled` (pin retained if previously
  approved).
- PR-open step: the owning agent requests the human signal naming the
  experiment issue and flagging time-sensitive evidence.
- All writes belong to the coached agent; the facilitator writes no files.

Verification: read back — registration shows the glob-list plan field + the
`registered` write; conclusion defines the verdict vocabulary + `cancelled`
write; PR-open names the owner as the requester.

## Step 6 — `kata-release-merge` experiment branch

Intent: the gate classifies, reads the row, checks pin + diff-scope, and
re-surfaces the ask at the block threshold.

Files modified: `.claude/skills/kata-release-merge/SKILL.md`,
new `.claude/skills/kata-release-merge/references/experiment-path.md`.

- SKILL Step 6 (Approval Gate): add an experiment branch. A spec-less
  implementation-typed PR resolves each `#NNN`; resolution-based discriminator
  (spec row → spec ref; experiment-labeled issue **with named owner** → exp
  ref; owner-less, both-match, zero, or multiple → blocked fail-closed with the
  ambiguity named). On the experiment path, read the `exp:{issue}` STATUS row:
  absent/`registered`/`cancelled` → blocked (`awaiting approval signal`);
  `approved` with pin == head SHA → pass; pin != head → blocked (`head moved
  since signal`). No rebase while approved-and-pinned; if a rebase is
  unavoidable the PR re-blocks.
- SKILL Step 9 (Impl PR Spec Check): add the experiment branch, reached **only**
  by a PR that Step 6 routed to the experiment path **and** passed there (a PR
  blocked at Step 6 never reaches Step 9). No re-classification — the diff-scope
  check is the experiment counterpart of the spec-stack `plan-a.md`-on-`main`
  check and runs in its place: changed files ⊆ registered globs; out-of-surface
  → blocked; self-edit paths pass only when a glob names them and the pin
  covers the head. Merge does **not** advance the row.
- Block-count re-surface: at consecutive-block threshold **3**, the gate
  re-posts the signal request rather than silently re-blocking.
- Memory section: record PR-open, human-signal, merge, and verdict timestamps
  per experiment PR merged.
- The detailed discriminator/diff-scope/pin algorithm lives in
  `references/experiment-path.md`; SKILL.md links it (mirrors `comment-gate.md`).
- Genericity: all text names no monorepo-specific issue, PR, package, or path.

Verification: read the gate step — discriminator, three-state row read,
pin re-block with no-rebase rule, threshold-3 re-surface, diff-scope replacing
the plan check, self-edit posture, instrumentation timestamps all present and
generic.

## Step 7 — repository checks

Intent: confirm the whole change is green.

- Run the targeted commands, not full `bun run check` (its chained `wiki`
  target fails environmentally this stage and is lifted separately per the
  task brief — do not gate on it): `bun run lint`, `bun run jsdoc`, and
  `bun test libraries/libwiki` for the libwiki edits, plus
  `bun run invariants` for skill genericity.

## Risks

- **`parseStatusRowId` arity change.** A grep confirms the only current caller
  is `status.test.js`; `status-row.js` uses `STATUS_ID_REGEX` (not
  `parseStatusRowId`), Step 2 newly introduces the `scopes.js` caller, and
  neither symbol is re-exported from `libraries/libwiki/src/index.js` or used
  in `services/` — so blast radius is contained to Steps 1–2. The implementer
  should re-grep before editing in case a caller landed since; the old
  single-arg `{ specId, unit }` shape (asserted at `status.test.js:8,12,16`)
  must be rewritten to the `kind: "spec"` branch, not left to fail.
- **`.claude/**` write protection.** Steps 3, 5, 6 write under `.claude/`. If
  Edit is blocked, route through `echo … | bunx fit-selfedit <path>` per
  CLAUDE.md; the branch is non-`main`, so the gate allows it.
- **Pin self-block on gate rebase.** The no-rebase-while-pinned rule is
  counter to the gate's habitual Step 5 rebase; Step 6 text must make the
  exception explicit so a gate run does not auto-rebase and silently
  invalidate the signal.

## Execution

Single engineering agent, sequential — Steps 1→2 are a tight code unit (the
parser contract threads through both), Steps 3→6 are text that depends on the
landed contract. No parallel split warranted at this size.

— Staff Engineer 🛠️
