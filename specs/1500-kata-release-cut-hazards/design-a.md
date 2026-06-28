# Design 1500 — Codify the kata-release-cut hazard set

Spec: [`spec.md`](spec.md). Codifies the eight hazards (a)–(h) from Issue

## 1381 into `kata-release-cut/SKILL.md` so each letter resolves to a

fires-when + recovery statement, with the existing *Edge Cases* section made
consistent.

### Components

| # | Component | Where | Role |
|---|---|---|---|
| C1 | Hazards section | SKILL.md, new `## Hazards` after *Edge Cases* | Eight lettered entries (a)–(h), each fires-when + recovery |
| C2 | Edge Cases reconciliation | SKILL.md § Edge Cases | Cross-references so `0.0.0`-skip↔(c), failed-publish↔(d), dependency-chain↔(b)/(h) do not contradict |
| C3 | Worked detail (conditional) | `.claude/skills/kata-release-cut/references/hazards.md` | Per-hazard mechanism detail displaced under the budget if SKILL.md cannot hold it |

### Hazard encoding (C1)

Each hazard is a labelled entry whose **letter is the stable identifier** so
existing `wiki/release-engineer.md` Run-Plan references ("rule (g)", "(h)")
resolve by reading the skill alone. Shape per entry: `**(x) <name>** —
Fires: <condition>. Recovery: <action>.` Recoveries (WHAT level, mechanism
fixed by the carry-forwards below):

| Letter | Fires-when | Recovery |
|---|---|---|
| (a) | `npm version` on a package whose `optionalDependencies` narrow platform support emits darwin stderr | Treat the stderr as expected noise; verify the in-tree version updated; proceed |
| (b) | A consumer's publish smoke-test E404s on a newly-added workspace dependency | Publish the dependency first, await propagation, then the consumer; do not parallelise (the symptom of (h)) |
| (c) | A package declares a non-zero version on first publish | Publish at the declared version; do not bump-then-publish; the `0.0.0`-skip rule does not apply |
| (d) | the publish credential has expired; publish fails after the tag is cut locally, surfacing only in the publish run | **Preflight** the credential's validity before any tag op (a publish-identity probe) and abort with an operator-visible error if invalid. If a tag preceded the failure: **request credential rotation via memo (human handoff — the agent lacks org-secret admin)** + re-run the publish against the same tag |
| (e) | Smoke-test runs before registry propagation and sees a stale view | Treat the first failure as propagation lag; re-run after a delay before classifying the publish failed |
| (f) | JSDoc-only failures persist after `check:fix` | Run the JSDoc auto-fix separately; do not assume `check:fix` covered JSDoc |
| (g) | A wiki audit budget overage (line/word cap) | **Route to the surface's owning agent** (MEMORY.md / frontmatter) — not a mechanical repair; RE's mechanical scope ends at content-judgement |
| (h) | A source merge introduces a new workspace library as a dependency of already-tagged consumers | Cut the new library's first-release tag at the same source commit **before** re-tagging consumers; tag in dependency order |

### Key decisions

| Decision | Choice | Rejected alternative |
|---|---|---|
| Stable identifier | **Letters (a)–(h)** verbatim | Slugs/numbers — break existing Run-Plan references the spec requires to resolve |
| (b)/(h) overlap | **(h) is the cause (sequencing rule), (b) is the symptom-when-violated** — two entries, (b) cross-references (h); Edge Cases' dependency-chain rule points to (h) | Merging into one entry — loses the symptom-first lookup an agent reaches for at recovery time |
| Section placement | A new `## Hazards` section **after** Edge Cases; Edge Cases keeps its three named cases, each gaining a one-clause cross-reference | Rewriting Edge Cases into Hazards — larger diff, more budget, and reopens the dependency-chain wording 1800 does not touch |
| (d) human handoff | (d) states rotation as **request-via-memo + re-run**, not a self-fix — the agent lacks org-secret admin access | Encoding a self-rotation step — non-executable, false affordance |
| (f) mechanism | (f) names running the **existing** JSDoc auto-fix as a separate step when JSDoc-only failures persist after check:fix — recovery text, not a new tool | Bundling into `check:fix` — that is the toolchain change the spec excludes |
| (d) preflight mechanism | (d) **codifies the recovery text only**: preflight the publish credential via a publish-identity probe (`npm whoami`-class) run **out of band before any tag op**; the design does **not** author a validation workflow (spec excludes publish-workflow/tool changes), it names the principle the agent applies | Codifying an early-fail step inside the publish workflow — couples the recovery to a workflow file the spec excludes; the in-skill text names *when/what*, not *which workflow* |
| Budget placement | Hold (C1) in SKILL.md; **displace to references/hazards.md only if** the combined file (after 1800) exceeds budget | Always splitting — unnecessary indirection; letters must resolve in SKILL.md |

### Genericity

`kata-release-cut` is a **published** skill. Hazard entries state the
*principle* — not this monorepo's incident specifics, package names, or
workflow filenames. Per-hazard run/bisect evidence the spec asks the plan to
source stays in the spec/design provenance, not in the published skill text.
The repo-shaped tokens the hazard rows surface are each genericised in the
shipped text: `NPM_TOKEN`→"the publish credential"; `check:fix`→"the
repository's check:fix command"; `workflow_dispatch`/workflow filenames →
"out of band before any tag op" (no GitHub-Actions keyword in skill text);
`optionalDependencies`/darwin/E404 → the platform/registry *symptom*
described generically ("a platform-narrowed optional dependency emits
expected stderr"; "the consumer's smoke test fails to find the
just-published dependency"); `MEMORY.md`/frontmatter (g)-routing stays —
those are guaranteed installation surfaces the genericity rules permit.

### Evidence sourcing (CF-4)

The plan sources each hazard's fires-when + recovery from these authoritative
surfaces, in this precedence: (1) `wiki/release-engineer.md § Run Plan` for
the letter↔carry mapping; (2) `wiki/release-engineer-2026-W*.md` weekly logs
for the precedent run and applied recovery; (3) GitHub workflow run history
(`gh run list`/`view`) for the failure signature of (b)/(d)/(e). Issue #1381
is the index. Provenance lives in spec/design only, never in the published
skill text (§ Genericity).

### SC verifiability anchors (CF-2)

| SC | Inspect | Passes when |
|---|---|---|
| (a)–(h) treated | `## Hazards` section | one resolvable entry per letter |
| letters resolve | search SKILL.md for "(g)", "(h)" | each lands on its fires-when+recovery, no further lookup |
| fires-when + recovery present | each entry | both clauses present |
| consistent w/ Edge Cases | Edge Cases + (b)/(c)/(d)/(h) | no contradiction (cross-refs resolve) |
| line-budget | `bun run check` output | green |
| diff scope | `git diff --stat origin/main...HEAD` | only skill dir + `references/` + `specs/1500-*/` |

### Coexistence with spec 1800

Disjoint sections (1800: classification step + recording; 1500: `## Hazards`

+ Edge Cases cross-refs), no contradiction. The ≤95% L5 headroom target is
**1800's** criterion; 1500's own budget gate is `bun run check`. The plan
inherits the ≤95% target only as the second-landing constraint per Issue

## 1613 — the sequencing belongs to the plan, not this design

### Out of scope (per spec)

Hazards beyond (a)–(h), kata-release-merge, tool authoring ((f)/(g)),
publish-workflow file changes, weekly-log backfill, the first-release
authoring convention (Discussion #1385). Diff touches only the skill dir +
`references/` + `specs/1500-*/`.

### Verification

`bun run check`; a reader-test per SC — look up each letter in SKILL.md and
confirm it resolves to a fires-when + recovery; consistency read of Edge
Cases vs (b)/(c)/(d)/(h).

— Staff Engineer 🛠️
