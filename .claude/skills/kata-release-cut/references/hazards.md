# Release-cut hazards — worked detail

Companion to the `## Hazards` section in [`SKILL.md`](../SKILL.md). The letters
(a)–(h) are stable identifiers — existing `wiki/release-engineer.md` Run-Plan
references ("rule (g)", "(h)") resolve by reading this file. Each entry is the
fires-when plus its recovery; the longer mechanics for (d) and (h) follow below.

- **(a) Platform-narrowed bump noise** — optional-dep platform stderr on bump is
  expected; verify the in-tree version updated and proceed.
- **(b) First-release dependency race** — a consumer's smoke test can't find a
  just-added workspace dep; publish the dep first, await propagation, then the
  consumer — never parallelise. (Symptom of (h).)
- **(c) First release at a non-zero version** — publish at the declared version,
  not bump-then-publish; the `0.0.0`-skip rule does not apply.
- **(d) Publish-credential expiry** — publish fails after the credential
  expired, only in the run; preflight it before any tag op (below).
- **(e) Smoke-test propagation lag** — the smoke test sees a stale registry
  view; treat the first failure as lag and re-run after a delay before
  classifying the publish failed.
- **(f) JSDoc persists after the auto-fix** — JSDoc-only failures remain after
  `check:fix`; run the existing JSDoc auto-fix separately.
- **(g) Wiki audit budget overage** — a wiki surface breaches a line/word
  budget; route to its owning agent (MEMORY.md / frontmatter), not a mechanical
  repair — the fix needs content judgment.
- **(h) New library dependency of tagged consumers** — cut the new library's
  first-release tag at the same source commit before re-tagging its consumers,
  in dependency order (below). (b) is its symptom.

## (d) Publish-credential expiry

The publish step authenticates with a credential held in the publish
environment, not on the bumping host. A bump and a local tag succeed even when
the credential has expired; the failure appears only when the publish job runs.

- **Preflight.** Before cutting any tag, run a publish-identity probe (a
  `whoami`-class check against the registry) out of band. If it reports an
  invalid or unscoped identity, abort the cut with an operator-visible error so
  no tag is created ahead of a failing publish.
- **Recovery after a tag was cut.** Do not delete the tag. The credential
  rotation needs admin access to the org's secrets that the agent does not hold,
  so the autonomous recovery is: request rotation via memo (a human handoff)
  and, once rotated, re-run the publish workflow against the same tag.
  Bump-and-re-tag is not required — the artifact was never published.

## (h) New library dependency of already-tagged consumers

When a source merge introduces a new workspace library that existing tagged
consumers now depend on, the new library has no first-release tag yet.

- Cut the new library's first-release tag **at the same source commit** as the
  consumer changes, **before** re-tagging any consumer that depends on it. Tag
  strictly in dependency order: the new library first, then its consumers.
- Hazard (b) is the observed symptom when this order is violated — the
  consumer's smoke test cannot resolve the dependency because it was published
  after, or concurrently with, the consumer.
