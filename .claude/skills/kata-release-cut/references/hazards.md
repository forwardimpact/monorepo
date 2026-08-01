# Release-cut hazards — worked detail

This file is the companion to the `## Hazards` section in
[`SKILL.md`](../SKILL.md). The letters (a)–(h) are stable identifiers.
Existing `wiki/release-engineer.md` Run-Plan references ("rule (g)", "(h)")
resolve when you read this file. Each entry gives the fires-when plus its
recovery. The longer mechanics for (d) and (h) follow below.

- **(a) Platform-narrowed bump noise** — optional-dep platform stderr on bump
  is expected. Verify the in-tree version updated. Then continue.
- **(b) First-release dependency race** — a consumer's smoke test cannot find
  a just-added workspace dep. Publish the dep first. Wait for propagation.
  Then publish the consumer. Never parallelise. (Symptom of (h).)
- **(c) First release at a non-zero version** — publish at the declared
  version. Do not bump and then publish. The `0.0.0`-skip rule does not apply.
- **(d) Publish-credential expiry** — the publish fails after the credential
  expires, and only in the run. Preflight it before any tag op (below).
- **(e) Smoke-test propagation lag** — the smoke test sees a stale registry
  view. Treat the first failure as lag. Run it again after a delay before you
  classify the publish as failed.
- **(f) JSDoc persists after the auto-fix** — JSDoc-only failures remain after
  `check:fix`. Run the existing JSDoc auto-fix separately.
- **(g) Wiki audit budget overage** — a wiki surface breaches a line/word
  budget. Route it to its owning agent (MEMORY.md / frontmatter). Do not apply
  a mechanical repair. The fix needs content judgment.
- **(h) New library dependency of tagged consumers** — cut the new library's
  first-release tag at the same source commit before you re-tag its consumers.
  Tag in dependency order (below). (b) is its symptom.

## (d) Publish-credential expiry

The publish step authenticates with a credential. The publish environment
holds that credential. The host that runs the bump does not hold it. A bump
and a local tag succeed even when the credential expired. The failure appears
only when the publish job runs.

- **Preflight.** Before you cut any tag, run a publish-identity probe (a
  `whoami`-class check against the registry) out of band. If it reports an
  invalid or unscoped identity, abort the cut with an operator-visible error.
  The abort creates no tag ahead of a publish that fails.
- **Recovery after you cut a tag.** Do not delete the tag. The credential
  rotation needs admin access to the org's secrets, and the agent does not
  hold that access. So the autonomous recovery is to request the rotation with
  a memo (a human handoff). After the rotation, run the publish workflow again
  against the same tag. You do not need to bump and re-tag. The publish
  workflow never published the artifact.

## (h) New library dependency of already-tagged consumers

When a source merge introduces a new workspace library that existing tagged
consumers now depend on, the new library has no first-release tag yet.

- Cut the new library's first-release tag **at the same source commit** as the
  consumer changes, **before** you re-tag any consumer that depends on it. Tag
  strictly in dependency order: the new library first, then its consumers.
- Hazard (b) is the observed symptom when you violate this order. The
  consumer's smoke test cannot resolve the dependency. The dependency
  published after the consumer, or at the same time as the consumer.
