# Spec 1350 — Wiki audit admits per-deliverable agent files

## Persona and job

Hired by **Teams Using Agents** so the coaching cadence's per-deliverable
artifacts (post-mortems, framing-drafts, retros, decision blocks) survive
in the wiki as first-class long-lived files without breaking the
`Context/wiki` check on `main`.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)).

## Problem

`bunx fit-wiki audit` runs the `wiki.stray-file` rule with severity
`fail`. The classifier in `libraries/libwiki/src/audit/scopes.js:72-85`
admits a wiki file as non-stray only if (a) its basename matches one of
`EXCLUDED_BASES` (`MEMORY.md`, `Home.md`, `STATUS.md`) or (b) it
matches one of five `NON_SUMMARY_PREFIXES` (`storyboard-`,
`downstream-`, `memory-protocol-`, `kata-interview-`, `fit-trace-`) or
(c) its name matches a weekly-log pattern or (d) its first non-empty
line matches `SUMMARY_H1_RE` (`/^# [A-Z].* — Summary$/`). Anything
else is classified `stray` and fails the audit.

### What the rule rejects today

Per-deliverable agent files produced by the team's coaching cadence:

- **Dimension post-mortems** — `<agent>-dim-N{α,β,γ,δ,ε}-postmortem.md`,
  filed when a Toyota Kata dimension is retired (commitment, queue
  depth, etc.).
- **Experiment framing-drafts** —
  `<agent>-expN-framing-draft.md`, filed when a passive-observation
  experiment is locked and needs a written framing for the verdict
  panel.
- **Coach 1-on-1 decision blocks and retros** — bespoke single-file
  artifacts referenced for cross-cycle continuity.

These files share three properties: a bespoke H1 (not the
`— Summary` form), single-deliverable scope (not a rolling summary,
not a weekly log), and long-lived utility (kept for cross-cycle
reference rather than embedded in a weekly log).

### Concrete impact today

`wiki/staff-engineer-dim-5beta-postmortem.md` (committed 2026-05-25
at wiki commit `67f78ea`) is currently failing the audit on `main`:

```
FAIL stray-file: wiki/staff-engineer-dim-5beta-postmortem.md
  does not match any known scope (summary, weekly log, or excluded prefix)
RESULT: fail (1 checks failed)
```

The release-engineer's Exp 45 framing-draft for 2026-05-25 would have
triggered an identical failure at `wiki/release-engineer-exp45-framing-draft.md`;
it was pre-empted only by embedding the content inside the weekly log
file (`wiki/release-engineer-2026-W22.md`) as a workaround.

### Why the workaround is not enough

Embedding per-deliverable content inside a weekly log keeps `main`
green but costs the team file-level pinning across cycles — the
post-mortem or framing-draft becomes one of many H2 sections inside a
log file that itself ages out of relevance each week. The artifacts
referenced by storyboard rows, coach 1-on-1 notes, or cross-cutting
priority records become harder to link to, and the long-lived utility
that motivated keeping them as files in the first place is lost.

### Why this is structural, not one-off

The team's coaching cadence produces these files on a predictable
schedule:

- A retired dimension produces a post-mortem (Kata five-question
  protocol close-out).
- A locked passive-observation experiment produces a framing-draft at
  the lock moment.
- 1-on-1 sessions with the coach periodically produce decision blocks
  worth keeping outside the weekly log.

Each new category will trigger the same `stray-file` failure unless
the audit recognizes the class. Today's five-prefix allowlist
(`storyboard-`, `downstream-`, `memory-protocol-`, `kata-interview-`,
`fit-trace-`) was extended one entry at a time as new file shapes
appeared; the team has accumulated enough per-deliverable categories
that a single admission rule for the *class* is now warranted.

### Reporter's recommended shape

[Issue #1185](https://github.com/forwardimpact/monorepo/issues/1185)
sketches three options: (a) a suffix-based admit pattern matching
`-(postmortem|framing-draft|decision-block|retro)\.md$`, (b) a
generic `<agent>-<deliverable>-...` admit pattern, or (c) a per-file
opt-in via frontmatter (`audit: stray-ok: true`). Selecting between
them — and naming the exact suffix or pattern set — is a design-time
choice this spec leaves open.

## Scope

### In scope

- The `wiki.stray-file` classifier (or an equivalent admission step
  before it) admits per-deliverable agent files for the categories
  named above (post-mortem, framing-draft, decision-block, retro) so
  they no longer fail the audit with severity `fail`.
- Admitted per-deliverable files remain subject to whatever other
  wiki-audit rules apply to non-summary, non-weekly-log files (e.g.
  agent-prefix consistency, ownership), if the design or plan chooses
  to apply any. The class is admitted; it does not become a
  rule-free zone.
- The design and plan choose the admission mechanism (suffix-set,
  general pattern, frontmatter opt-in, or a combination) and the
  exact list of admitted categories. The spec requires that at least
  the four categories named by the reporter (`postmortem`,
  `framing-draft`, `decision-block`, `retro`) are admitted, and that
  the mechanism is documented somewhere a future agent filing a new
  category can find it.
- `wiki/staff-engineer-dim-5beta-postmortem.md` is no longer reported
  as `stray` by `bunx fit-wiki audit` after the change lands. (The
  file itself is not modified by this spec; the audit's
  classification of it is what changes.)
- The release-engineer's framing-draft workaround (embedded H2
  section in the weekly log) is no longer required for the audit's
  sake. Whether the existing embedded section is migrated back to a
  standalone file is a contributor choice outside this spec.

### Excluded

- **The five existing `NON_SUMMARY_PREFIXES`** stay where they are
  (`storyboard-`, `downstream-`, `memory-protocol-`,
  `kata-interview-`, `fit-trace-`). This spec adds an admission path
  for per-deliverable files; it does not refactor the existing
  prefix list.
- **Naming conventions for the per-deliverable files themselves**
  beyond ensuring the chosen admission mechanism matches the names
  used today. The spec does not require renaming
  `staff-engineer-dim-5beta-postmortem.md` or any existing file.
- **Other wiki audit rules** (summary H1 form, weekly-log H1 form,
  cross-cutting priority schema, claims schema, storyboard structure,
  agent-prefix consistency). The change is purely to the
  `stray-file` classification path.
- **Frontmatter parsing as a wiki-wide capability.** If the
  design selects a frontmatter-opt-in mechanism, it implements
  exactly as much frontmatter handling as the admission rule needs;
  the spec does not require a general frontmatter system for the
  wiki.
- **`MEMORY.md`, `STATUS.md`, `Home.md` and weekly logs.** Already
  classified outside the stray-file path; no change.
- **External-consumer behavior of `fit-wiki`.** No change to the CLI
  surface, exit codes, or JSON shape beyond what the new admission
  rule needs to report (if anything beyond a "non-stray"
  classification).
- **The wiki audit's severity model.** The `stray-file` rule keeps
  its `fail` severity for genuinely stray files. The change is
  *which files count as stray*, not how `stray` is reported.

## Success criteria

| Claim | Verifies via |
|---|---|
| `bunx fit-wiki audit` no longer reports `wiki/staff-engineer-dim-5beta-postmortem.md` as `stray`. | Running the audit against the wiki at the implementation PR's head reports `0` failures attributable to that file (and to any of the four named per-deliverable categories); the rule the file matches under is non-stray. |
| The admission rule recognizes all four named per-deliverable categories. | A fixture-driven test (one per category) asserts that a representative filename for each of `postmortem`, `framing-draft`, `decision-block`, `retro` is classified as non-stray by the audit. |
| Genuinely stray files still fail. | A fixture asserting that a file like `wiki/random-notes.md` (no agent prefix, no admitted suffix, no summary H1, no weekly-log shape) continues to fail `wiki.stray-file` with severity `fail`. |
| The admission mechanism is documented for future agents. | A documentation reference — wiki-protocol section, README block, or libwiki guide — names the admission mechanism and the per-deliverable categories it admits, in one place an agent filing a new category can find via the existing wiki audit error message or the libwiki entry point. |
| The change is scoped to libwiki. | The implementation PR's diff touches `libraries/libwiki/` and its test tree, the spec/design/plan tree under `specs/1350-wiki-audit-per-deliverable-files/`, and at most one documentation file naming the admission mechanism. Other paths (the per-deliverable wiki files themselves, weekly logs, CONTRIBUTING.md, unrelated services) are not modified by this spec. |
| Main goes green on the `Context/wiki` check. | After the implementation PR merges, the next `Context/wiki` check on `main` reports `success`. |

— Product Manager 🌱
