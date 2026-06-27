# Plan 1500 — Codify the kata-release-cut hazard set

Spec: [`spec.md`](spec.md) · Design: [`design-a.md`](design-a.md).

## Approach

Add a `## Hazards` section to `.claude/skills/kata-release-cut/SKILL.md`
after `## Edge Cases`, with eight lettered entries (a)–(h), each a fires-when

- recovery in generic published-skill phrasing; cross-reference Edge Cases so
the three existing cases agree with (b)/(c)/(d)/(h). Source per-hazard
evidence from the surfaces named in design § Evidence sourcing. Displace
worked detail to `references/hazards.md` only if `bun run check` flags the L5
budget after the addition.

Libraries used: none.

## Step 1 — Add the `## Hazards` section

Files modified: `.claude/skills/kata-release-cut/SKILL.md`.

Insert after `## Edge Cases`. Each entry, generic phrasing per design
§ Genericity:

```markdown
## Hazards

Recoveries the release procedure has paid to learn. Each is identified by a
stable letter so existing references resolve.

- **(a) Platform-narrowed bump noise** — Fires: `npm version` on a package
  whose `optionalDependencies` narrow platform support emits expected
  stderr on the bumping host. Recovery: treat the stderr as expected; verify
  the in-tree version updated; proceed.
- **(b) First-release dependency race** — Fires: a consumer's publish smoke
  test cannot find a just-added workspace dependency. Recovery: publish the
  dependency first, await propagation, then the consumer; do not parallelise.
  (Symptom of (h) when its sequencing is violated.)
- **(c) First release at a non-zero version** — Fires: a package declares a
  non-zero version on first publish. Recovery: publish at the declared
  version; do not bump-then-publish. The `0.0.0`-skip rule (Edge Cases) does
  not apply.
- **(d) Publish-credential expiry** — Fires: publish fails after the
  credential expired; the tag is cut locally, the failure shows only in the
  publish run. Recovery: preflight credential validity (a publish-identity
  probe, out of band before any tag op) and abort with an operator-visible
  error if invalid. If a tag preceded the failure: request credential
  rotation via memo (human handoff — the agent lacks org-secret admin) and
  re-run the publish against the same tag. Specialises the failed-publish
  rule (Edge Cases).
- **(e) Smoke-test propagation lag** — Fires: the smoke test runs before
  registry propagation and sees a stale view. Recovery: treat the first
  failure as lag; re-run after a delay before classifying the publish failed.
- **(f) JSDoc persists after check:fix** — Fires: JSDoc-only failures remain
  after the repository's check:fix command. Recovery: run the existing JSDoc
  auto-fix as a separate step; do not assume check:fix covered JSDoc.
- **(g) Wiki audit budget overage** — Fires: a wiki surface breaches a
  line/word budget. Recovery: route to the surface's owning agent (named in
  MEMORY.md or the file's frontmatter); do not attempt a mechanical repair —
  the fix needs content judgement.
- **(h) New library dependency of tagged consumers** — Fires: a source merge
  adds a new workspace library that already-tagged consumers depend on.
  Recovery: cut the new library's first-release tag at the same source commit
  **before** re-tagging any consumer; tag in dependency order. (The
  sequencing rule (b) is the symptom of.)
```

Verify: each letter (a)–(h) resolves to a fires-when + recovery by reading
SKILL.md alone; no GitHub-Actions keyword or workflow filename in the text.

## Step 2 — Reconcile Edge Cases

Files modified: `.claude/skills/kata-release-cut/SKILL.md` § Edge Cases.

**Append** a cross-reference clause to each existing case, preserving the
current operational text verbatim (do not replace it):

```markdown
- **First release**: Skip packages with version `0.0.0` or `"private": true`.
  For a declared non-zero first version, see Hazard (c).
- **Failed publish**: Don't delete the tag. Fix, bump patch, re-tag. For
  credential-expiry specifics, see Hazard (d).
- **Dependency chain**: Release foundational packages before consumers —
  check `package.json` dependencies before tagging. See Hazards (b)/(h) for
  the new-library first-release sequencing rule.
```

Verify: the three existing operational clauses survive verbatim; (b)/(c)/(d)/(h)
and the three Edge Cases entries do not contradict.

## Step 3 — Budget displacement (required)

Files created: `.claude/skills/kata-release-cut/references/hazards.md`.

The L5 cap is **192 lines**; SKILL.md is **175 today**, and the `## Hazards`
section adds ~40 lines — so the file would land ~215 lines, over the cap.
Displacement is **required, not conditional**. Move the longer recovery prose
((d) and (h)'s detail) to `references/hazards.md` (≤128 lines / ≤768 words),
leaving in SKILL.md each letter's fires-when + a one-line recovery + a link
to the reference, so every letter still resolves in SKILL.md. The genericity
rules apply to the reference file too.

Verify: `bun run check` green (SKILL.md ≤192 lines); reference under L6;
every letter (a)–(h) still resolves in SKILL.md alone.

## Risks

- **Shared file with spec 1800.** Whichever lands second rebases over the
  other's skill-file changes; per Issue #1613 the second-landing PR inherits
  the ≤95% target. Mitigation: keep the Hazards section compact; the rebase
  is mechanical (disjoint sections).

## Execution

Single engineering agent, sequential Steps 1→3.

## Verification

`bun run check`; the per-SC anchors in design § SC verifiability anchors;
`git diff --stat origin/main...HEAD` touches only the skill dir,
`references/`, and `specs/1500-*/`.

— Staff Engineer 🛠️
