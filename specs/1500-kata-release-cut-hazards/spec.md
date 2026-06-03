# Spec 1500 — Codify the kata-release-cut hazard set into the skill

## Persona and job

Hired by **Teams Using Agents** so the next release-cut run inherits
the hazards earlier runs have already paid to learn, rather than
re-discovering them at publish time.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)).

## Problem

[`.claude/skills/kata-release-cut/SKILL.md`](../../.claude/skills/kata-release-cut/SKILL.md)
documents the procedural shape of a release cut (pre-flight, tag
prefix mapping, version rules, bump-sync-verify, commit-tag,
push-verify, summary) and a short *Edge Cases* section listing three
cases: skipping packages at `0.0.0` or marked `"private"`, recovery
from a failed publish, and respecting cross-workspace dependency
order.

The release-engineer's
[Issue #1381](https://github.com/forwardimpact/monorepo/issues/1381)
memo enumerates eight hazards the agent has paid to learn across
runs 44–148 that are not codified anywhere the agent re-reads:

- **(a) `npm version` produces darwin-platform error-channel noise**
  for packages whose `optionalDependencies` declare narrower platform
  support than the bumping host; the bump succeeds but the noise can
  scramble the read for a subsequent step.
- **(b) First-release dependency-race**: a consumer's publish
  smoke-test E404s when its newly-added workspace dependency is
  published after the consumer.
- **(c) First-release-at-non-`0.0.0`**: a package whose `package.json`
  already declares a non-zero version on first publish is not the
  `0.0.0`-skip case the existing *Edge Cases* rule names; the agent
  must publish at the declared version rather than bump-then-publish.
- **(d) NPM_TOKEN expiry**: the publish workflow's `npm publish`
  fails after token expiry; the tag is cut locally and the failure
  appears only in the workflow.
- **(e) Smoke-test publish race**: the publish workflow's smoke-test
  step runs immediately after publish, before registry propagation
  completes, and the smoke-test sees a stale view of the registry.
- **(f) `check:fix` does not run the JSDoc auto-fix**: JSDoc-only
  failures persist after `bun run check:fix`; the agent needs a
  separate auto-fix invocation.
- **(g) `wiki` audit budget failures are not in release-engineer's
  mechanical-repair scope**: budget overages (line-count or
  word-count caps on a wiki surface) cannot be repaired by
  release-engineer's mechanical path because the fix requires content
  judgement that belongs to the surface's owning agent, not to a
  formatter. Whether the toolchain currently exposes a `wiki:fix`
  invocation is orthogonal to whether the *fix* is mechanical; the
  hazard is that release-engineer cannot land the repair under its
  own scope.
- **(h) New library as a dependency of existing-tagged consumers**:
  when a source merge introduces a new workspace library as a
  dependency of already-tagged consumers, the new library's
  first-release tag must be cut at the same source commit before the
  consumers are re-tagged (the procedural rule that (b) is the
  observed symptom of).

Each hazard has a known recovery the release-engineer has applied
across the runs that surfaced it. The recoveries live in weekly logs
under `wiki/release-engineer-2026-W*.md` and as letter-labelled
references ("carry rule (g)", "rule (h)") in
`wiki/release-engineer.md` § Run Plan. The eight letters are RE's
stable identifiers; the wiki carries the labels but not their
expansions.

### Per-hazard recoveries

For each hazard, the recovery action the release-engineer applies
when the hazard fires (sourced from § Problem evidence + weekly
logs). Recoveries are stated at the WHAT level — the exact command,
flag, or surface is the design's call:

| Letter | Recovery action |
|---|---|
| (a) | Treat the darwin-platform stderr as expected noise on the bumping host; verify the in-tree `package.json` version updated correctly and proceed. |
| (b) | Publish the new workspace dependency first, await registry propagation, then publish the consumer; do not parallelise the two publishes. |
| (c) | Publish at the declared non-zero version on first release; do not bump-then-publish. The `0.0.0`-skip rule does not apply when the declared version is non-zero. |
| (d) | Preflight NPM_TOKEN validity (e.g. a token-scope or `whoami` probe) **before** cutting any tag; abort the cut with an operator-visible error if the token is expired or unscoped, so the tag is not created locally ahead of a failing publish. If a tag was already cut before the failure was observed, the recovery is to rotate the token and re-run the publish workflow against the same tag. |
| (e) | On smoke-test failure immediately after publish, treat the first failure as registry-propagation lag; re-run the smoke-test after a propagation delay before classifying the publish as failed. |
| (f) | After `bun run check:fix`, run the JSDoc auto-fix separately when JSDoc-only failures persist; do not assume `check:fix` has covered the JSDoc surface. The exact invocation is design-time. |
| (g) | Route to the surface's owning agent (the agent listed under `wiki/MEMORY.md` for that surface, or named in the file's frontmatter) — do **not** attempt a mechanical repair. Release-engineer's mechanical-repair scope ends at content-judgement boundaries. The codified entry must name routing-to-owner as the recovery, not a mechanical fix. |
| (h) | Cut the new library's first-release tag at the same source commit before re-tagging any consumer that depends on it; the new library and its consumers tag at one source commit, in dependency order. |

### What is missing from the skill today

`kata-release-cut/SKILL.md` does not name (a)–(h). The existing *Edge
Cases* section covers a strict subset of the territory (it names
`0.0.0`-skip, failed publish, dependency chain). The labels (b)/(h)
in particular overlap *Edge Cases*' "dependency chain" entry — both
describe the same underlying constraint from different angles
(symptom-first vs sequencing-rule-first) — but the agent's working
labels and the skill's labels do not match, so a Run-Plan reference
to "(h)" does not resolve to anything in the skill.

### Why this matters now

The release-engineer's Assess loop reads
[`kata-release-cut/SKILL.md`](../../.claude/skills/kata-release-cut/SKILL.md)
on every cut. Each hazard's recovery costs seconds when known and
minutes-to-hours when re-discovered. Codifying them in the skill
turns substrate-only knowledge into substrate-encoded knowledge —
addressing the blocking dimension named in
[Issue #1381](https://github.com/forwardimpact/monorepo/issues/1381):
*"Cannot turn substrate-only knowledge into substrate-encoded
improvements."*

This spec is the **content half** of carry #2 in Issue #1381;
[Spec 1490](../1490-re-assess-carry-clearance/spec.md) is the
structural half (an Assess-loop step that prevents the *next*
hazards i, j, … from accumulating as Run-Plan counter bumps before
ever reaching codification).

## Scope

### In scope

- The skill at
  [`.claude/skills/kata-release-cut/SKILL.md`](../../.claude/skills/kata-release-cut/SKILL.md)
  gains codified treatment of each of the eight hazards (a)–(h)
  named in § Problem. For every hazard, the codification answers two
  questions the agent asks at recovery time: *when does this hazard
  fire?* and *what action clears it?* The design and plan source
  per-hazard run-time evidence (precedent run, exact recovery, bisect
  link) from the release-engineer's own surfaces at codification
  time; the spec does not pre-commit those numbers and does not
  prescribe which surfaces the design reads.
- The eight letters (a)–(h) survive into the codified treatment as
  stable identifiers so existing Run-Plan references in
  `wiki/release-engineer.md` resolve to the codified entries without
  rewrite. The spec does not pre-commit the exact text of the labels
  or the encoding format; the design picks the encoding subject to
  the constraint that an agent looking up "rule (g)" can find the
  corresponding codified entry.
- The codification accounts for the (b)/(h) overlap: design and plan
  decide whether to merge them into one entry, split them into two
  with cross-references, or expand the existing *Edge Cases*
  "dependency chain" entry. The spec requires that the resulting
  skill has no inconsistency between (b), (h), and the existing
  *Edge Cases* dependency-chain rule — whatever shape the design
  picks, the three do not contradict each other.
- The existing *Edge Cases* section is updated as needed for internal
  consistency with the codified hazards. The existing section names
  three cases — packages at `0.0.0` / `"private"` are skipped, failed
  publishes follow a retry-bump shape, dependency chains are
  released in order. Each existing case has a known relationship to
  one of the codified hazards: the `0.0.0`-skip rule is the case (c)
  is *defined against* (the agent must publish at the declared
  version when the package is **not** at `0.0.0`); the failed-publish
  rule is a generic shape that (d) specialises to the NPM_TOKEN
  expiry case; the dependency-chain rule is the same constraint that
  (b)/(h) name from different angles. The plan may merge,
  cross-reference, or restructure the section — the spec requires
  consistency, not a specific shape.
- The skill respects whatever line-budget assertion the toolchain
  enforces at implementation time. The skill currently fits inside
  that budget; the new content must not move it outside.

### Excluded

- **Hazards beyond (a)–(h).** Future hazards arrive via Spec 1490's
  carry-clearance step; this spec captures the eight already known.
- **`kata-release-merge` SKILL.md changes.** That skill carries its
  own concerns. The `docs` type-allowlist work (carry #3 in Issue
  #1381) landed via PR #866 on 2026-05-22 and is not reopened.
- **Tool changes.** Hazard (f) names a `check:fix` gap and hazard
  (g) names the absence of a `wiki:fix` script; this spec does not
  author either tool. New tooling, if proposed, is its own spec.
- **Publish-workflow file changes.** Smoke-test cooldowns, retry
  logic, registry-propagation waits, or `npm publish` behaviour
  changes belong elsewhere.
- **Backfilling weekly logs.** Logs continue to reference (a)–(h)
  by letter; the canonical expansion now lives in the skill.
- **The first-release contributor-facing convention.** Whether
  package authors should declare `0.1.0` vs `0.0.0` on first commit
  is a convention question routed to a separate Discussion; this
  spec codifies the agent-side recovery for hazard (c), not the
  authoring convention. The two ship independently.

### Design-phase carry-forwards

Reviewer-surfaced items the design must resolve before plan opens.
Each is named at the constraint level; the design picks the shape.

1. **(b)/(h) overlap visibility.** The codified entries make the
   (h)-is-cause / (b)-is-symptom-when-violated relationship explicit
   so the codification does not double-count the same underlying
   constraint.
2. **Success-criteria verifiability anchors.** For each row in
   § Success criteria, the design names the concrete evidence
   (artefact, passage, command output) whose inspection proves the
   criterion was met.
3. **Stable-identifier anchoring.** The design picks how codified
   entries are stably identified across spec / design / implementation
   — letter (a)–(h), slug, numeric id, or another scheme — such that
   existing Run-Plan references resolve.
4. **Evidence-sourcing scope.** The design names which external
   surfaces (workflow logs, `wiki/release-engineer*.md`,
   `wiki/release-engineer.md` § Run Plan, GitHub run history) are
   authoritative when codifying per-hazard recoveries.
5. **(b)/(h) overlap resolution.** Paired with item 1, the design's
   structural choice on whether the codification merges (b) and (h)
   into one entry, splits them with cross-references, or restructures
   the existing *Edge Cases* dependency-chain rule.
6. **Hazard (f) JSDoc recovery mechanism.** The codified (f) entry
   names a specific mechanism — separate fix invocation, bundling
   into `check:fix`, a pre-commit hook, or another shape — rather
   than leaving the recovery at the WHAT level.
7. **Hazard (d) NPM_TOKEN preflight mechanism.** The design picks
   among (a) a `workflow_dispatch`-only validation workflow running
   `npm whoami`, (b) an early-fail step in `publish-npm.yml` before
   any tag operation, or (c) a lookback heuristic on recent
   `Publish: Package` runs; release-engineer prefers (a) as cleanest.
8. **Hazard (d) NPM_TOKEN rotation as human handoff.** The codified
   (d) entry states the human handoff explicitly — when a token has
   expired, the agent's autonomous recovery is
   *request-rotation-via-memo + re-run*, not a self-mechanical fix,
   because rotation requires repo-admin access to org secrets the
   agent does not hold.

## Success criteria

| Claim | Verifies via |
|---|---|
| The skill carries codified treatment for each of (a)–(h). | After implementation, `.claude/skills/kata-release-cut/SKILL.md` contains content addressing every one of the eight conditions (a)–(h) named in § Problem. Whether the eight appear as eight separate entries or fewer entries with explicit (a)–(h) cross-references is the design's call; the spec requires that each letter resolves. |
| The hazard letters resolve to codified content. | A reader who knows only the letter — "carry rule (g)", "(h)", etc. — can find the corresponding codified content by reading the skill file alone, with no further lookup. |
| Each codified entry contains a fires-when statement and a recovery statement. | For each of (a)–(h), the codified content names the condition under which the hazard fires and the action that clears it; both are present in the skill text and inspectable by reading the relevant section. |
| The codification is consistent with the existing *Edge Cases* section. | The skill's treatment of (b), (h), and the existing dependency-chain rule do not contradict each other; the (c) treatment does not contradict the existing `0.0.0`-skip rule (which (c) is the exception to); the (d) treatment does not contradict the existing failed-publish rule (which (d) specialises). The plan picks the structural shape (merge / cross-reference / restructure); the spec requires no contradictions in the resulting text. |
| The skill respects its line-budget. | `bun run check` passes on the implementation PR — including any wiki-audit or coaligned-instruction assertions the toolchain enforces against `.claude/skills/**/SKILL.md` at implementation time. |
| The implementation PR's diff stays within the file sets in scope. | The PR diff touches only `.claude/skills/kata-release-cut/SKILL.md` and the spec/design/plan tree under `specs/1500-kata-release-cut-hazards/`. |

— Product Manager 🌱
