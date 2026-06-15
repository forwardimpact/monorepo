# Spec 1720 — Skill-content action references resolve against reality

## Persona and job

Hired by **Teams Using Agents** so the front door of the Kata hire — the
workflows `kata-setup` generates into a consuming repository — cannot silently
ship references that fail in the consumer's repo with no signal back to the
monorepo.

Related JTBD: _Teams Using Agents — Run a Continuously Improving Agent Team_,
Little Hire "Help me onboard a Kata installation that runs the Plan-Do-Study-Act
loop without per-team prompt engineering" ([JTBD.md](../../JTBD.md)). Secondary
beneficiary: **Platform Builders**, whose skill docs carry action references as
user-facing examples.

## Problem

On 2026-06-10 a security audit
([Issue #1551](https://github.com/forwardimpact/monorepo/issues/1551)) found
that the `kata-setup` workflow templates referenced
`forwardimpact/kata-action-agent` and `forwardimpact/kata-action-eval` —
repositories that do not exist. Every external installation generated from those
templates failed at job start with "repository not found."

What makes this spec-worthy is not the typo but the system shape around it:

- **The break was silent for six weeks** — the entire published life of the
  skill. The failure fires at job start in the _consumer's_ repository, a
  surface with zero feedback channel to the monorepo. We could not distinguish
  "nobody arrived" from "everybody bounced" at the Teams Using Agents front
  door.
- **No existing control could have caught it.** Action references in monorepo
  workflows are protected three ways: they execute in our own CI (loud failure),
  they are SHA-pinned (spec 1310), and Dependabot bumps them. Action references
  embedded in skill content — fenced workflow templates and prose examples —
  never execute in monorepo CI and are validated by nothing. The repository has
  no workflow-ref validation tooling of any kind today.
- **Detection was an accident.** An adjacent supply-chain audit found the break,
  not a check. The coach disposition on #1551
  ([issuecomment-4671942115](https://github.com/forwardimpact/monorepo/issues/1551#issuecomment-4671942115))
  routed the guard here: move the failure from the consumer's repo (silent) into
  monorepo CI (loud).
- **Manual sweeps undercount.** Per the same disposition record, the #1551
  triage's sweep first counted 6 references and reached 11 only once prose
  mentions were included. A guard limited to fenced YAML, or to fully-qualified
  `owner/repo@ref` tokens, inherits the blind spot that produced the issue. The
  full corpus is pinned in § Acceptance corpus below so the bar is reproducible.

### The unvalidated surface

Skill content under `.claude/skills/` carries GitHub Action references in forms
that never execute in monorepo CI:

| Form                                                 | Example                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fenced workflow YAML `uses:` lines                   | `uses: forwardimpact/kata-action-agent@v1` (a #1551 defect site)                                       |
| Fully-qualified prose tokens, with or without `@ref` | `forwardimpact/kata-action-agent@v1` (a #1551 defect site); "the `forwardimpact/fit-benchmark` action" |
| Owner-less prose tokens                              | "the `kata-action-agent@v1` step" (a #1551 defect site)                                                |
| Bare action-name mentions                            | "Uses `kata-action-eval` (not `kata-action-agent`)" (a #1551 defect site)                              |

The `fit-*` and `kata-*` skill trees sync to the published skill packs
(`forwardimpact/fit-skills`, `forwardimpact/kata-skills`) on every push to
`main`, so an unresolved reference in skill content publishes externally on the
same day it lands.

### What the #1551 fix changed about the surface

Issue #1551 parts 1–2 (the staff-engineer's mechanical fix) merged to `main` on
2026-06-11, when the issue closed. It corrected the repo names and changed how
the templates express refs: the fenced template lines now carry generation-time
placeholders (`uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}` in
`workflow-agent.md` and `workflow-facilitate.md`,
`uses: forwardimpact/fit-eval@{{FIT_EVAL_REF}}` in `workflow-react.md`), and the
skill instructs the generator to resolve each placeholder to the SHA-pinned form
`@<40-hex-sha> # vX.Y.Z` in the _consumer's_ generated workflow. Literal pins
are present in skill content today both as documentation examples and as
placeholder-resolution table values — e.g. `{{KATA_AGENT_REF}}` maps to
`b4a5b262f3d7acaee2da63f8b2a09bcf4730d804 # v1.0.0` in `workflow-agent.md` and
`workflow-facilitate.md`.

This reshapes, rather than removes, the unvalidated surface:

- **Placeholder refs** carry a real `owner/repo` half that can be wrong in
  exactly the #1551 way, with a post-`@` token that is intentionally not a tag,
  branch, or SHA.
- **Literal pins in examples and resolution tables** carry a machine-checkable
  internal claim: the `# vX.Y.Z` part names the tag the SHA is supposed to
  correspond to.
  [Issue #1549](https://github.com/forwardimpact/monorepo/issues/1549) documents
  the mismatch class — tags and pinned SHAs drifting apart — and a stale doc pin
  teaches every external reader a wrong value.

## Scope

### What this spec adds

A repository check — the **skill ref lint** — that validates GitHub Action
references in skill content under `.claude/skills/` against the reality they
name. Three assertions:

1. **Repository resolves.** The repository a reference names exists. References
   in published skills (`fit-*`, `kata-*`) must resolve publicly — external
   consumers fetch them anonymously; references in internal skills must resolve
   under the credentials the check runs with. This is the #1551 defect class,
   assertable today with no dependency on any other work.
2. **Ref resolves within the repository.** For references whose post-`@` token
   is a literal — tag, branch, or 40-hex SHA — that token exists in the
   repository.
3. **Pinned-form agreement.** For literal pins — `@<sha> # vX.Y.Z` references,
   and `<sha> # <tag>` placeholder-resolution values — the named tag exists and
   points at that SHA (the #1549 mismatch class). The current tree carries
   literal pins in both sub-forms — the placeholder-resolution table values in
   `workflow-agent.md` and `workflow-facilitate.md`, and the inline
   `@<sha> # vX.Y.Z` example reference
   (`forwardimpact/kata-agent@b4a5b262… # v1.0.0`) in `workflow-agent.md
   § Resolving action refs` — so this assertion has live subjects of both kinds
   to check; on a tree with zero literal pins it has nothing to check.

### Reference classes and how each is validated

The #1551 corpus shows the defect travels in several lexical forms. Each class
gets an explicit stance, so the design inherits decisions rather than inventing
them:

| Class                                                                                                                                                                                                                                               | Stance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fully-qualified `owner/repo@ref` and `owner/repo/path@ref` (fenced or prose)                                                                                                                                                                        | Assertions 1–2 apply directly; assertion 3 applies to its literal-pin sub-form.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Placeholder and schematic refs with a real repo half — post-`@` token is a generation-time placeholder or an illustrative token like `@<full-sha>` | Assertion 1 applies to the repo half; assertions 2–3 are inapplicable by design — resolution happens at install time or the ref is illustrative. A valid placeholder is a `@{{NAME}}` token whose `NAME` appears as the post-`@` token of a `uses:` reference in the `kata-setup` templates — equivalently, a row in the resolution tables under `workflow-agent.md § Resolving action refs`, which is the authoritative allowlist the design reads (on the current tree: `{{KATA_AGENT_REF}}` → `forwardimpact/kata-agent` and `{{FIT_EVAL_REF}}` → `forwardimpact/fit-eval`). Names the templates define only for body substitution — `{{MODEL}}`, `{{WIKI}}`, `{{AGENT_LIST}}`, `{{CRON_ENTRIES}}`, `{{AGENT_TITLE}}`, `{{AGENT_NAME}}`, `{{STORYBOARD_CRON}}` — are defined placeholders but never ref tokens, so they are deliberately off the allowlist; scoping validity to post-`@` appearance (not mere definition) keeps them from ever validating as ref tokens and admits a future ref placeholder only when it actually appears post-`@`. A `@{{…}}` token whose name is not on that allowlist is **malformed** and fails the lint — it names neither a resolvable ref nor a known generation-time ref substitution.                                                                                                                                                                                                                                                                                                                                                            |
| Placeholder-resolution table values (`<sha> # <tag>`)                                                                                                                                                                                               | Assertion 3, with the repository association taken from the `uses:` reference that resolves the **same placeholder name**, not from directory proximity: the `kata-setup` directory carries more than one placeholder (`{{KATA_AGENT_REF}}` → `forwardimpact/kata-agent`, `{{FIT_EVAL_REF}}` → `forwardimpact/fit-eval`), so a `<sha> # <tag>` value binds to the repository its named placeholder resolves to.                                                                                                                                                                                                                                                                                                                                                                                  |
| Contextual tokens — fully-qualified `owner/repo` without `@ref`, owner-less `name@ref`, and bare action-name mentions                                                                                                                               | Validated by **in-skill anchoring**: a contextual token whose repo name matches a fully-qualified action reference — literal or placeholder form — in the same skill directory is covered by that anchor's assertions and reported as its own finding site when those assertions fail; where the token carries its own literal post-`@` ref, that ref is additionally checked against the anchored repository. The match is on the full `repo` segment of an `owner/repo` anchor, compared exactly and case-sensitively — not a suffix or substring match (`kata-agent` matches the `repo` of `forwardimpact/kata-agent`; a bare `agent` matches nothing). A contextual token matching no anchor is **out of scope** — see the recorded residual below. |
| Tokens without a real repository half (`./.github/actions/<name>` local paths, `<name>/action.yml` path strings, npm package specifiers like `@forwardimpact/<pkg>`, fully schematic tokens like `<owner>/<repo>@<ref>`)                            | **Out of scope** — they name repo-local, package-registry, or illustrative entities with no action-repository reality to check. Local-path inventories such as the `./.github/actions/<name>` references in `kata-security-update`'s `sha-inventory.md` fall out of scope through this row.                                                                                                                                                                                                                 |

**Recorded residual — unanchored contextual tokens.** Tokens like
`libfoo@v0.1.5`, `pathway@v0.25.0`, `pass@k`, or a bare `fit-codegen` pervade
skill prose as package tags, metric names, CLI and product names; they are
lexically indistinguishable from action references. A contextual token with no
in-skill anchor is therefore not validated — which means a stale prose mention
in a skill whose qualified references have moved on is undetectable without
false-positive exposure across every such token. This residual is accepted,
along with its mirror image: a non-action token whose name collides with a
same-skill action anchor would be checked against the wrong repository's refs
(no such collision exists on the current tree). At the #1551 corpus every
contextual defect site anchors to a broken qualified reference in the same
skill, so anchoring detects all of them; the residual case did not occur there.

Surface decisions, taking the coach's scope guidance:

- **All skills, not just `kata-setup`.** The lint covers every skill directory
  under `.claude/skills/`, published or internal.
- **All owners, not just `forwardimpact/*`.** A fenced template referencing a
  third-party action breaks a consumer install just as hard if it stops
  resolving. (Contextual tokens reach other owners through their in-skill
  anchors, which are always fully-qualified.)

### Failure-mode constraints

The lint is the repository's first reality-checking reference validator, so its
failure modes are part of the WHAT:

- **Loud before publish.** The check fails in monorepo CI on changes that
  introduce an unresolvable reference, and the path that publishes skill content
  externally runs the check before syncing — a broken skill-content reference
  must not reach the published skill packs. (The publish path also ships
  `.claude/agents/*.md`; agent profiles carry no action references today and are
  outside this lint's surface — the boundary is revisited if that changes.)
- **Drift surfaces without an edit, to a triaged surface.** The reference
  classes above can be invalidated by upstream reality alone — a repository
  renamed or removed, a tag moved off a pinned SHA (#1549) — with no content
  change to trigger CI. Reference reality is therefore re-validated on a
  recurring basis, and a drift failure lands on a surface the team already
  triages (the default branch's checks or an issue), in the same finding format
  as a change-triggered failure. The recurring path is also invocable on demand
  against fixture content, so its behavior is testable without breaking the
  default branch. The trigger mechanism is a design choice.
- **No false pass on network faults.** If reality cannot be reached (API outage,
  rate limiting), whichever component resolves references against reality
  reports a distinguishable error state; unavailability never reads as success.
  How resolution happens — live API call, maintenance-time check, a committed
  inventory, or a hybrid — is a design choice; the spec constrains only the
  observable behavior.
- **Mechanical repair.** A failure names the file and the offending reference,
  so fixing a finding requires no rediscovery.

Sequencing: the #1551 mechanical fix is already merged to `main` (issue closed
2026-06-11), so the lint lands against a tree whose references already resolve.

### Acceptance corpus

The pre-fix tree (`main` at `9e7852d7`) is the regression fixture: it carries
the real defect in all its forms. The 11 reference sites — a site is a
reference-carrying line; the `workflow-react.md` bare-name site carries two
tokens — all naming the nonexistent `kata-action-agent` / `kata-action-eval`
repos. The org controls the `forwardimpact` namespace and the names remain
absent; if any fixture name is ever created (these or the `does-not-exist` probe
below), the fixture expectation is re-pointed, not invalidated.

| File (under `.claude/skills/kata-setup/`) | Form                        | Sites |
| ----------------------------------------- | --------------------------- | ----: |
| `references/workflow-agent.md`            | fenced `uses:`              |     1 |
| `references/workflow-agent.md`            | owner-less `name@ref` prose |     2 |
| `references/workflow-facilitate.md`       | fenced `uses:`              |     2 |
| `references/workflow-facilitate.md`       | owner-less `name@ref` prose |     2 |
| `references/workflow-react.md`            | fenced `uses:`              |     1 |
| `references/workflow-react.md`            | bare-name prose             |     1 |
| `SKILL.md`                                | fully-qualified prose       |     2 |

### Excluded

- **Fixing the broken references themselves.** Issue #1551's mechanical fix —
  name corrections, placeholder emission, and the consumer-repo Dependabot
  config — is the staff-engineer's work, merged to `main` on 2026-06-11 (#1551
  closed). This spec is the guard against the class recurring.
- **Reference-form policy.** Whether skill content _must_ use the SHA-pinned
  form is a per-skill editorial decision (the `fit-benchmark` doc example
  legitimately shows `@v1` as the published identifier, consistent with spec
  1310's narrative-mention exclusion). The lint asserts that references resolve,
  not which form they take.
- **Validating what the generator emits at install time.** The resolved pin
  written into a consumer's repository is produced by the `kata-setup` flow at
  install time, outside monorepo CI; the lint validates the skill content that
  instructs that flow, not its output.
- **Unanchored contextual tokens.** Recorded residual per the class table.
- **`.github/workflows/` references.** Already protected by execution, spec 1310
  pinning, and Dependabot.
- **Sibling-side Dependabot configs** (#1550), **sibling tag policy and internal
  pinning** (#1548), and **sibling `v1`-tag lag remediation** (#1549) — adjacent
  items from the same audit family, each with its own owner.
- **General link rot.** URLs, doc cross-references, and non-action identifiers
  in skill content are a different problem with a different source of truth.

## Success criteria

| Claim                                                                                | Verifies via                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A skill file referencing a nonexistent action repository fails the lint.             | On a branch, add `uses: forwardimpact/does-not-exist@v1` inside a fenced block in any skill file; the check fails, naming the file and the reference.                                                                                                                                               |
| The full #1551 defect, in every form it took, is detected.                           | Run the lint (invoked out-of-tree) against the content at `main` commit `9e7852d7`; it fails, naming both nonexistent repositories, and its findings cover all 11 sites in the § Acceptance corpus table — contextual-token sites reported as their own findings via their in-skill anchors. A site is a reference-carrying line; the `workflow-react.md` bare-name site carries two tokens (`kata-action-eval` and `kata-action-agent`), so that one site yields a finding per token.    |
| A published-skill reference to an existing but non-public repository fails the lint. | An executable test exercises a non-public repository (real or simulated) referenced from a `fit-*`/`kata-*` skill and asserts a finding — anonymous resolvability, not mere existence, is what published-skill references are held to.                                                              |
| A real repository with a nonexistent literal ref fails the lint.                     | On a branch, change a known-good reference's post-`@` token to a tag that does not exist in that repository; the check fails, naming the file and the reference.                                                                                                                                    |
| Placeholder refs are repo-checked, and their tokens produce no finding.              | On a branch, change a placeholder reference's repo half to a nonexistent repository; the check fails, naming the file and the reference — while the unmodified placeholder references in the merged `kata-setup` templates yield zero findings.                                                     |
| An anchored contextual token's own stale ref fails the lint.                         | On a branch, add an owner-less prose token whose name matches an in-skill qualified action reference but whose `@ref` does not exist in that repository (e.g. `kata-agent@v99.0.0` in `kata-setup`); the check fails, naming the file and the token.                                                |
| A literal pin whose tag disagrees with its SHA fails the lint.                       | On a branch, add or alter a literal pin (an `@<sha> # vX.Y.Z` reference or a placeholder-resolution `<sha> # <tag>` value) so the named tag does not point at that SHA; the check fails, naming the file and the reference.                                                                         |
| The lint passes on a skill tree containing only resolvable references.               | The check reports zero findings against a tree whose references all resolve under the class table — including literal pins whose tags agree with their SHAs, the non-vacuous case (expected first instance: `main` today, the #1551 mechanical fix having merged); unanchored contextual tokens (`libfoo@v0.1.5`, `pass@k`), path-form rows, and schematic tokens produce no findings.       |
| Source-of-truth unavailability is not a pass.                                        | An executable test exercises the unreachable-reality state of whichever component resolves references against reality and asserts it exits in a distinct error state — not success, and distinguishable from a reference finding.                                                                   |
| The check gates skill-content changes.                                               | A PR touching `.claude/skills/**` runs the check among its CI checks.                                                                                                                                                                                                                               |
| The publish path runs the check before shipping skill content.                       | The workflow that syncs `.claude/skills/` content to the external skill packs contains the check as a blocking step ordered before the sync (config-verifiable on the implementing PR; the first post-merge publish run confirms execution).                                                        |
| A recurring trigger re-validates references without a content edit.                  | A recurring trigger for the check exists (a scheduled run or equivalent) that re-runs the full assertion set against `main` with no content change, so a reference invalidated by upstream reality alone is re-checked.                                                                              |
| A drift failure lands on a surface the team already triages.                         | When a recurring run finds a reference that has gone stale through upstream change alone, the failure surfaces where the team already looks (a failing run on the repository's Actions surface, or an issue), in the same finding format as a change-triggered failure.                              |
| The recurring path is invocable on demand and exercises the drift class.            | Invoking the recurring path on demand against fixture content that has drifted with no content edit — the named repository renamed or removed, or a tag moved off the SHA a still-unedited pin names (reality varied while content is held fixed, not a stale pin freshly injected into content) — produces the standard finding format. |

— Product Manager 🌱
