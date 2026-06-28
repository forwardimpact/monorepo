# Plan 1610 — Canonical Carry surface off the summary budget

Spec: [`spec.md`](spec.md) · Design: [`design-a.md`](design-a.md).

## Approach

Extend the libwiki audit with a `carry-surface` file kind: add the filename
and H1 patterns to `constants.js`, a classifier branch + `subjects` bucket +
Carry-specific `agentPrefix` and a scope resolver to `scopes.js`, and three
structural rules to `rules.js`. Then designate the surface in
`memory-protocol.md` (path + boot enumeration). The wiki migration is a
sibling-repo commit verified by inspection, not in this PR diff.

Libraries used: libwiki (audit/scopes, audit/rules, constants).

## Step 1 — Surface patterns (constants.js)

Files modified: `libraries/libwiki/src/constants.js`.

Add `CARRY_SURFACE_NAME_RE = /^(.+)-carries\.md$/`,
`CARRY_SURFACE_H1_RE = /^# (.+) — Carries$/`, and
`CARRY_CLEARANCE_MARKER_RE = /\*\*Carry-clearance:\*\*/` — the r3 marker,
matching the **existing live convention** in `wiki/release-engineer.md
§ Message Inbox` so the migration relocates without re-marking.

Verify: `grep` finds the three exports.

## Step 2 — Classifier, bucket, resolver (scopes.js)

Files modified: `libraries/libwiki/src/audit/scopes.js`.

- In `classifyFile`, before/after the summary branch (order-independent —
  H1 literals differ), add: if `CARRY_SURFACE_NAME_RE.test(base)` and
  `CARRY_SURFACE_H1_RE.test(subject.firstLine)` → `{ kind: "carry-surface",
  subject }`; name-match + H1-miss → `null`.
- In `loadFile`, when the base matches `CARRY_SURFACE_NAME_RE`, set
  `agentPrefix` from the name RE capture group (not `base.replace(/\.md$/,"")`),
  so the r2 agreement rule can match the H1 slug.
- In `buildContext`, seed `subjects["carry-surface"] = []`.
- Add
  `SCOPE_RESOLVERS["carry-surface"] = (ctx) => ctx.subjects["carry-surface"]`.

Verify: a fixture `release-engineer-carries.md` with H1 `# release-engineer
— Carries` classifies `carry-surface`; one without the H1 is unclassified.

## Step 3 — Carry-surface rules (rules.js)

Files modified: `libraries/libwiki/src/audit/rules.js`.

Add three rules with `scope: "carry-surface"`, `severity: "fail"`:

- `carry-surface.h1-shape` — `check: firstLineMatches(CARRY_SURFACE_H1_RE)`.
- `carry-surface.h1-agent-matches-filename` — reuse the
  `summaryAgentMismatch`/`weeklyAgentMismatch` slug-vs-`agentPrefix` pattern.
- `carry-surface.entry-has-clearance` — a per-H3 check: scan `fileLines` for
  `/^### /` blocks; each block must contain a line matching
  `CARRY_CLEARANCE_MARKER_RE`; emit a finding per offending block
  (returns finding[] like `nothingAfterH2`).

The r2 rule needs a dedicated `carryAgentMismatch` helper (the existing
`summaryAgentMismatch`/`weeklyAgentMismatch` hardcode their own H1 RE — reuse
the *pattern*, not the function), comparing `slugify(H1 capture)` to the
carry `agentPrefix`. The carry H1 carries the **slug** form (`# release-engineer
— Carries`), matching the filename capture.

Verify: a fixture entry missing the `**Carry-clearance:**` line yields a
finding against that block (`carry-surface.entry-has-clearance`); a fixture
H1 slug≠filename yields `carry-surface.h1-agent-matches-filename`; the
migrated-wiki fixture yields none.

## Step 4 — Memory-protocol designation (memory-protocol.md)

Files modified: `.claude/agents/references/memory-protocol.md`.

Add a "§ Carry Surface" subsection that: names the verbatim path pattern
`<agent>-carries.md`; states the per-entry shape (H3 + `**Clears**:` trigger

- a referenced-surface pointer); and adds the surface to the On-Boot Read Set
so boot enumerates open obligations. Carry-semantic field names, no RE-only
assumptions (§ generalisation hedge).

Verify: the path pattern appears verbatim; the On-Boot Read Set lists the
surface.

## Step 5 — Tests

Files modified: `libraries/libwiki/test/audit-rules.test.js`,
`libraries/libwiki/test/audit-engine.test.js`.

- **Update the locked rule-order snapshot** at `audit-rules.test.js`'s "rule
  order is locked (catalogue snapshot)" test (`RULES.map(r => r.id)` at line
  ~7): insert the three `carry-surface.*` ids at the position the new rules
  occupy in the `RULES` array. Adding rules without this update fails the
  snapshot test.
- Add `carry-surface` fixtures: admit a valid surface (no findings), fail on
  a missing `**Carry-clearance:**` line, fail on H1/filename slug mismatch,
  leave a name-match-H1-miss file unclassified.

Verify: `bun test libraries/libwiki` passes; tests exercise
`carry-surface.h1-shape`, `carry-surface.h1-agent-matches-filename`,
`carry-surface.entry-has-clearance`.

## Step 6 — Wiki migration (sibling-repo commit)

Files modified: `wiki/release-engineer-carries.md` (new),
`wiki/release-engineer.md § Message Inbox` — **not** in this PR diff.

The live `§ Message Inbox` entries are `-` bullets, not H3 blocks, and use
the `**Carry-clearance:**` marker. **Reshape** each per-Assess obligation
block into an H3 on the new surface, preserving its `**Carry-clearance:**`
line verbatim and adding a `**Referenced surface**:` pointer where 1490's
reconciliation needs one. Migrate **every** per-Assess obligation currently
under `§ Message Inbox` (the spec § Problem table's #1, #2, #4, #5, #6 + Exp

## 1468, plus any later-added obligation blocks present at migration time —

Exp #1625/#1672, #1548 watch, #1565 Carry #8); a RESOLVED carry (#3) clears
instead of relocating. Restore `§ Message Inbox` to memo-triage only.

Verify: `bunx fit-wiki audit` clean against the migrated wiki incl. the new
surface and `wiki/release-engineer.md`; every remaining `§ Message Inbox`
entry is either an unprocessed memo `fit-wiki inbox list --agent
release-engineer` would surface or a section heading — no per-Assess
obligation (SC #3).

### Risks

- **Skew window** between C5 (monorepo) and C6 (wiki). Mitigation: 1490's
  resolution rule handles the undesignated default, so either order is
  benign (design § Skew window).
- **Classifier precedence.** None required (distinct H1 literals); the test
  asserts a summary file is not captured as a carry surface and vice versa.

### Execution

Single engineering agent for Steps 1–5 (code + tests, one PR). Step 6 is a
wiki commit performed alongside, verified by inspection.

### Verification

`bun run check` + `bun test libraries/libwiki`; the SC walk (each of SC #1–#6
against the artifacts); `bunx fit-wiki audit` clean post-migration.

— Staff Engineer 🛠️
