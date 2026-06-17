# Plan 1630 — Narrate-then-publish SHA-existence invariant

Spec: [`spec.md`](spec.md) · Design: [`design-a.md`](design-a.md).

## Approach

Write the standing invariant once in `coordination-protocol.md`, add a
one-line pointer to it at the publish point of every in-scope authoring path
(skills + agent profiles + kata-dispatch propagation), define the durable
block-record surface, and stage the window-open record the PM lane uses to
adjudicate the trial. Normative text lives only in the reference; the bindings
are pointers. All text generic (no run-198 incident, no monorepo repo URLs).

Libraries used: none.

## Step 1 — The invariant (coordination-protocol.md)

Files modified: `.claude/agents/references/coordination-protocol.md`.

Add a "§ Citation integrity" section stating the three outcome properties:
(1) every existence-asserting SHA-shaped token resolves on the repository its
citation references (per-citation context; no-context ⇒ body's host repo;
**negative citations exempt**); (2) **no publish on failure, loud to the
author** (wiki surface binds authored landings only — session-sync is out of
scope); (3) an **audit-readable block record** with the minimum fields
(offending token, repo checked, authoring path, blocked-surface identifier,
block time, surrounding context).

State the **resolution procedure** (the design delegated the invocation to
the plan): for each existence-asserting SHA-shaped token, the authoring agent
infers the referenced repository from context, then resolves the token via
the host's commit-lookup capability — for the host repo and other hosted
repos, `gh api repos/{owner}/{repo}/commits/{sha}` (a non-2xx is
non-resolution); for the wiki repo content surface, `git -C wiki cat-file -e
{sha}^{commit}`. A token that fails to resolve blocks the publish and emits
the property-3 record. Phrase the section as capability (the resolution
*commands* are illustrative, repo-shaped detail that the published-URL
canonical text states once); name no monorepo repo in the abstract property
statements.

Verify: the three properties + the resolution procedure are present; the
abstract properties name no monorepo repo.

## Step 2 — Authoring-path bindings

Files modified — the in-scope authoring paths:

- **Skills** (one pointer at the publish/output step of each):
  `.claude/skills/` `kata-spec`, `kata-design`, `kata-plan`,
  `kata-implement`, `kata-product-issue`, `kata-release-merge`,
  `kata-release-cut`, `kata-security-update`, `kata-security-audit`,
  `kata-wiki-curate`, `kata-documentation`, **`kata-backlog-synthesis`**
  (the spec's stale `kata-pattern-synthesis` name does not exist on disk —
  bind the real skill; flag the spec drift), `kata-interview`,
  `kata-session/SKILL.md` Participant-Protocol step only.
- **Agent profiles** — the five `.claude/agents/*.md` (`product-manager`,
  `release-engineer`, `security-engineer`, `technical-writer`,
  `improvement-coach`) at their Assess/memory-write guidance.
- **`kata-dispatch` propagation** — the propagation is documented in
  `coordination-protocol.md` § Approval signal / dispatch; add the pointer at
  the STATUS-row/PR-comment landing description there (no standalone skill
  file exists).

At each path's publish step add **one** line pointing to § Citation
integrity. Genericity: a **skill** pointer uses the fully-qualified public
URL form (the reference is not in the pack); a **profile / reference**
pointer uses the in-repo path. Do **not** copy the normative text. Exclude
`kata-review`, `kata-session` facilitation, `kata-setup`.

Verify: each in-scope path carries exactly one pointer at its publish step;
the three excluded paths carry none; `bun run check` (which runs
`invariants`) passes — including the skill-genericity rule on the new
pointers.

## Step 3 — Block-record surface

Files created: `wiki/citation-blocks.md` (seeded with its H2 header + a
documented record template, so the surface exists for implementation review
to verify rather than springing into being at first block).

`wiki/citation-blocks.md` is the append-only, non-rotating home for block
records (H2 header + one block per record carrying the property-3 minimum
fields). It is **not** a weekly log (no `-YYYY-Www` filename), so the audit
leaves it unclassified and it survives the trial window and verdict without
rotation. § Citation integrity (Step 1) names this surface as where a blocked
path writes its record at block time.

Verify: the seeded file exists with the record-template fields matching
property 3; `bunx fit-wiki audit` does not mis-classify it as a summary
(its first line is not a `# … — Summary` H1).

## Step 4 — Window-open record (PM lane staging)

Deliverable (staged in this PR, opened by the PM lane): a **window-open
record template** committed under `specs/1630-narrate-publish-sha-invariant/`
(e.g. `window-open-record.md`) so this plan produces a concrete artifact. The
PM lane fills and publishes it on the trial record (Issue/PR per spec § Trial
audit) when the window opens.

The template enumerates: the in-scope authoring paths (incl. the two
non-skill paths — participant protocol + agent-profile routines), the
agent-identity roster (append-only), and the coverage signal (each path's
binding present at window open). The window does **not** open until Exp 47's
verdict comment lands (F3); this PR ships the template, not the open window.

Verify: the template lists every in-scope path incl. the two non-skill ones;
the coverage-signal field is concrete; the F3 gate is stated.

## Risks

- **Genericity / linking.** The bindings ship in published packs, but the
  canonical text lives in the non-shipped `coordination-protocol.md`.
  Mitigation: skill pointers use the fully-qualified public URL form the
  genericity rule prescribes for `agents/` references; `bun run check` (which
  runs `invariants`) gates the mechanical subset. If a pointer trips the
  skill-genericity rule, narrow the rule in
  `.coaligned/invariants/skill-genericity.rules.mjs` rather than leaving the
  flagged content (per CLAUDE.md). The run-198 incident stays in spec/design
  provenance.
- **Loud-failure verification.** A silent drop leaves no trial artifact, so
  it is verified at **implementation review**, not by the trial audit (spec
  property 2). Mitigation: the review panel confirms each binding surfaces
  the block to the author rather than dropping the body.
- **Coverage denominator drift.** Paths evolve. Mitigation: the binding
  criterion is the authoring path, not list membership; the window-open
  roster is append-only.

## Execution

The work is documentation-weighted (reference text + skill/profile prose +
templates), so route to **`technical-writer`** for Steps 1–4, sequential.
Step 4 ships only the template; the PM lane opens the window after Exp 47's
verdict (F3).

## Verification

`bun run check` (runs `invariants`, including skill-genericity on the new
pointers); the loud-failure property confirmed at implementation review (no
silent drop); SC1–SC3 / F1–F2 adjudicated by the PM lane at trial close
against the window-open record.

— Staff Engineer 🛠️
