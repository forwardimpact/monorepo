# Spec 1350 — Wiki audit admits per-deliverable agent files

## Persona and job

Hired by **Teams Using Agents** so the coaching cadence's per-deliverable
artifacts (post-mortems, framing-drafts, retros, decision blocks) survive
in the wiki as first-class long-lived files — without forcing agents to
choose between filing the artifact and keeping the `Context/wiki` check
on `main` green.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)). The wiki is the agent team's
cross-session memory; per-deliverable files are the cadence's natural
unit for artifacts that outlive a weekly log.

## Problem

The wiki audit's `wiki.stray-file` rule runs at severity `fail`. The
classifier admits a wiki file as non-stray only when its basename is on
an excluded list of three (`MEMORY.md`, `Home.md`, `STATUS.md`), when
its basename starts with one of five admitted prefixes (storyboards,
downstream notes, memory-protocol references, kata-interview reports,
fit-trace reflections), when it matches the weekly-log filename shape
(including the multi-part variant), or when its first heading is in the
`<Title> — Summary` form. Anything else fails the audit with the
message "Does not match any known scope" and the hint "rename to a
recognized scope (summary, weekly log, weekly-log part) or remove the
file."

### What the rule rejects today

Per-deliverable agent files produced by the team's coaching cadence:

- **Dimension post-mortems** — filed when a Toyota Kata dimension is
  retired. Bespoke H1 (the dimension name and the spec it retired),
  single-deliverable scope, kept long-lived for cross-cycle reference.
- **Experiment framing-drafts** — filed when a passive-observation
  experiment is locked and needs a written framing for the verdict
  panel. Bespoke H1, single-deliverable scope, long-lived.
- **Decision blocks and retros from coaching sessions** — anticipated
  by the cadence but not yet observed; the team's coaching protocol
  produces single-file artifacts of this shape when a decision needs
  to be referenced from outside a weekly log.

These files share three properties: a bespoke H1 (not the
`<Title> — Summary` form), single-deliverable scope (not a rolling
summary, not a weekly log), and long-lived utility (kept for
cross-cycle reference rather than embedded in a weekly log that ages
out each week).

### Concrete instances observed so far

| Date | Artifact | Outcome |
|---|---|---|
| 2026-05-25 | Staff Dim 5β post-mortem | Filed as a standalone wiki file; the audit failed `main`; the file was **removed the same day** and its content embedded inside the weekly log to clear CI red. |
| 2026-05-25 | RE Exp 45 framing-draft | Pre-empted before commit — content embedded inside the weekly log as a workaround, because the agent recognised the standalone form would trigger the same audit failure. |

`main`'s `Context/wiki` check is green today **because both
per-deliverable files were eliminated rather than admitted** — the
post-mortem was removed; the framing-draft was never filed as a
standalone file. The audit's behaviour, not the artifacts, drove the
outcome. Both artifacts now live as H2 sections inside their owning
weekly log, with the post-mortem's heading levels demoted one level
to fit a non-summary parent.

### Why the workaround is not enough

Embedding per-deliverable content inside a weekly log keeps `main`
green but costs the team file-level pinning across cycles. The
artifact becomes one of many H2 sections inside a log that itself
ages out each week. The artifacts referenced by storyboard rows,
coach 1-on-1 notes, or cross-cutting priority records become harder
to link to, and the long-lived utility that motivated keeping them
as files is lost. The "embedded per Issue #1185 workaround" pointer
left in the weekly log is itself evidence that the embed shape is
recognised as temporary.

### Why this is structural, not one-off

The coaching cadence produces these files on a predictable schedule:
a retired dimension produces a post-mortem (Kata five-question
protocol close-out); a locked passive-observation experiment
produces a framing-draft at the lock moment; 1-on-1 sessions with
the coach periodically produce decision blocks worth keeping outside
the weekly log. Each new category will trigger the same failure
unless the audit recognises the class. The team has accumulated
enough categories that a single admission rule for the *class* is
warranted rather than a sixth, seventh, eighth prefix entry.

### Reporter's recommended shape

Issue #1185 sketches mechanism options (suffix allowlist, generic
pattern, frontmatter opt-in). Choice deferred to design.

## Scope

### In scope

- The wiki audit admits per-deliverable agent files for at least the
  two categories currently observed (post-mortem, framing-draft) so
  they no longer fail the audit at severity `fail`. The same
  admission mechanism is designed to extend to additional categories
  the cadence is known to produce (decision-block, retro) without
  another spec round.
- Admitted per-deliverable files remain subject to whatever other
  wiki-audit rules the design chooses to apply to the new class.
  The class is admitted; the file does not become a rule-free zone.
- The design chooses the admission mechanism (suffix allowlist,
  generic pattern, frontmatter opt-in, or a combination) and the
  exact list of admitted categories at landing time. The spec
  requires only that the two observed categories pass and that the
  mechanism is reachable from the audit's failure path so a future
  agent filing a new category learns about it without reading source.
- After the change lands, the staff Dim 5β post-mortem and the RE
  Exp 45 framing-draft are re-filable as standalone wiki files
  without breaking the audit. Whether the team chooses to migrate
  the embedded sections back to standalone files is a contributor
  decision outside the spec.

### Excluded

- **The existing five admitted prefixes** stay where they are
  (storyboards, downstream notes, memory-protocol references,
  kata-interview reports, fit-trace reflections). This spec adds an
  admission path for per-deliverable files; it does not refactor
  the existing prefix list.
- **Naming conventions for the per-deliverable files themselves**
  beyond ensuring the chosen admission mechanism matches the names
  the cadence produces today. The spec does not require renaming
  any existing file.
- **Other wiki audit rules** (summary H1 form, weekly-log H1 form,
  cross-cutting priority schema, claims schema, storyboard
  structure, agent-prefix consistency). The change is purely to the
  stray-file classification path.
- **Frontmatter parsing as a wiki-wide capability.** If the design
  selects frontmatter-opt-in, it implements exactly as much
  frontmatter handling as the admission rule needs; the spec does
  not require a general frontmatter system for the wiki.
- **`MEMORY.md`, `STATUS.md`, `Home.md` and weekly logs.** Already
  classified outside the stray-file path.
- **External-consumer behaviour of `fit-wiki`**. CLI flags, exit
  codes, and the JSON output schema stay backward-compatible; the
  only intentional behaviour change lives inside the classifier.
- **The audit's severity model.** `wiki.stray-file` keeps its
  `fail` severity for genuinely stray files. The change is *which
  files count as stray*, not how `stray` is reported.

## Success criteria

| Claim | Verifies via |
|---|---|
| The two observed per-deliverable categories pass the audit. | A fixture (shape chosen by the design to match the admission mechanism) asserts that a representative post-mortem instance and a representative framing-draft instance are classified as non-stray. |
| Genuinely stray files still fail. | A fixture asserts that a wiki file with no agent prefix, no admitted suffix or pattern, no summary H1, and no weekly-log shape (e.g. a file named `random-notes.md` with an arbitrary first line) continues to fail `wiki.stray-file` at severity `fail`. |
| The stray-file failure path points future agents at the admission mechanism. | Running the audit against a fixture containing an unrecognised per-deliverable-shaped filename emits a hint that either names the admission mechanism or links to the page documenting it. |
| Real previously-embedded content round-trips back to a standalone file without information loss. | A fixture asserts that the actual content of the Dim 5β post-mortem (currently embedded as an H2 inside the staff weekly log — bespoke H1, original heading structure, code blocks) is classified as non-stray when re-filed as a standalone per-deliverable file with its original heading levels restored. |
| The change is confined to libwiki. | The implementation PR's diff touches only paths under `libraries/libwiki/` and the spec/design/plan tree under `specs/1350-wiki-audit-per-deliverable-files/`. No other library, service, top-level documentation (`CONTRIBUTING.md`, `CLAUDE.md`, `JTBD.md`), per-deliverable wiki file, or weekly log is modified. |
| The `Context/wiki` check on `main` stays green when a per-deliverable file is filed. | After the implementation merges, a follow-up commit re-filing the staff Dim 5β post-mortem as a standalone wiki file (or any new per-deliverable file matching the admitted shape) leaves the next `Context/wiki` check on `main` at `success`. |

— Product Manager 🌱
