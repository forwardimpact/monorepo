# Plan 2010-a — path-scoped staging and facilitator serialization

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Ship the two levers as their controllable artifacts. **L1** is a deny-by-default
JS-AST lint (S1): a new `.coaligned/invariants` rule keyed on the one whole-tree
staging method the shared-checkout commit paths use — `GitClient.commitAll` (the
`commitPaths` path is the compliant one PR #1571 established) — flagging every
*caller* of it in commit-path source, with an explicit own-artifact allowlist.
**L2/S2/S3/S6** are protocol requirements in the `kata-session` skill: the
same-surface serialization rule, the edit-intent ask field (D5 two classes), the
single-owner classifier (D7), and facilitator-declared output surfaces (D8).

**Closed-set scoping (verified against the tree).** The only `commitAll` *caller*
in JS commit-path source is `wiki-sync.js:145` (the `fit-wiki push`/sync sweep) —
L1's sole un-scoped application site, whose code change is blocked on spec 1850
D3 (does not yet exist), so it is **allowlisted as a named exception pointing at
#1583 item 3**, not changed here. Its shell twin `scripts/wiki-sync.sh` runs the
same `fit-wiki push` sweep and is part of the *same* deferral — named here, not
linted (the JS-AST rule cannot parse shell, and it is the identical blocked
site). The `commitAll` *definition* (`libutil/src/git-client.js`) and its mock
(`libmock`) are the primitive, not commit paths — the caller-keyed rule never
flags them. `.github/workflows/publish-skills.yml`'s `git add -A` runs in a
**separate skills-repo checkout, not the shared session checkout**, so it is
outside S1's scope (S1 governs the shared checkout). This keeps the rule
deny-by-default, JS-only (matching the framework's AST capability), and passing
on the current tree with exactly one allowlist entry.

Libraries used: none. (Step 1 reuses the in-repo invariant helpers
`.coaligned/invariants/lib/ast.mjs` and `lib/walk.mjs`, not workspace packages.)

## Steps

### 1. L1 deny-by-default staging lint (S1)

Forbid whole-tree staging in commit-path source outside an own-artifact
allowlist; gate continuously.

- Created: `.coaligned/invariants/shared-workspace-staging.rules.mjs`
- Created: `.coaligned/invariants/shared-workspace-staging.allow.json`

Model on `subprocess-in-tests.rules.mjs`: `parseModule`/`walkAst` from
`lib/ast.mjs`, `collectFiles`/`readJsonOrNull` from `lib/walk.mjs`. `build()`
iterates each package under `libraries`/`products`/`services` and calls
`collectFiles(pkgRoot, { skip, match })` where `skip` is a name-set including
`"test"`, `"node_modules"`, `"dist"`, `"generated"` and `match` accepts a path
iff it ends `.js`/`.mjs` and **not** `.test.js`/`.test.mjs`. (`collectFiles`
filters by directory *name* in `skip` and by the `match` predicate — not by glob
path, so the exclusions are expressed as a skip-name + a predicate, not as
`*/test/*` strings.) Then drop two explicit paths from the collected set:
`libraries/libutil/src/git-client.js` (the `commitAll` definition) and any file
under `libraries/libmock`. The rule walks each remaining file's AST and flags any
`CallExpression` whose `calleeName` resolves to `commitAll` (covers
`this.#git.commitAll`, `git.commitAll`), unless the file is in the allow list.
Severity `fail` (deny-by-default).

Keying on the `commitAll` callee is the precise discipline: `commitPaths` is the
scoped path (PR #1571), `commitAll` is the one whole-tree method. The
git-client.js exclusion removes the primitive's own definition (whose `git add
-A` argv is not a `commitAll` *call* and so would not match anyway — the
exclusion is belt-and-suspenders). The libmock exclusion is likewise defensive:
its `"commitAll"` is a string in a method-name array, not a `CallExpression`, so
`calleeName` never flags it. The allow list keys on `file` only (one entry,
mirroring `subprocess-in-tests.allow.json`'s flat `[{...}]` shape), loaded via
`readJsonOrNull(join(import.meta.dirname, "shared-workspace-staging.allow.json"))
?? []` (resolved relative to the rule dir, empty-fallback so an absent file does
not crash the rule) into a `Set` of `file` values:

```json
// shared-workspace-staging.allow.json
[
  { "file": "libraries/libwiki/src/wiki-sync.js",
    "reason": "fit-wiki push sweep — L1 application site blocked on spec 1850 D3 (#1583 item 3); shell twin scripts/wiki-sync.sh shares this deferral" }
]
```

`claim`/`release` reach `commitPaths` (via `commitAndPush(msg, ["MEMORY.md"])`,
PR #1571), never `commitAll`, so they pass without an entry. The sole flagged
caller on the current tree is `wiki-sync.js:145`, covered by the one entry.

Verify: `bunx coaligned invariants` passes on the current tree with the
allowlist; removing the `wiki-sync.js` entry makes it fail (proves the rule
fires on the real sweep); adding a throwaway `this.#git.commitAll(...)` call in
any non-test commit-path `.js` file under the scoped dirs fails.

### 2. Edit-intent ask field — two surface classes (S3, D5)

Define the field the facilitator populates and the receiver consumes.

- Modified: `.claude/skills/kata-session/references/dispatch-discipline.md`

Add an **Edit-intent** section defining the field on a facilitated ask:

| Class | Declared by | L1 stages it? | L2 orders on it? |
| --- | --- | --- | --- |
| `staged_paths` | facilitator (receiver's own artifacts) | yes | yes |
| `output_surfaces` | facilitator (D8) | no | yes |

State the hard split (D5): a receiver stages **only** `staged_paths`, never an
`output_surface`. Both classes use the granular target (a specific file path or
a specific thread), never a coarse key like "the wiki" (D4).

Verify: the section states the field, its two classes, the per-class declarer,
and the stage-only-staged_paths rule as a requirement (S3 pass/fail).

### 3. L2 same-surface serialization rule (S2)

- Modified: `.claude/skills/kata-session/references/dispatch-discipline.md`

Add a **Same-surface serialization** rule to the facilitator protocol: route a
wiki-touching (or otherwise same-mutable-surface) ask only after the prior ask
whose edit-intent union (staged_paths ∪ output_surfaces, D4/D5) intersects this
ask's surface has returned its Answer or explicitly released. Keying is on the
specific surface, not the whole session (D4). State the liveness posture: the
hold is advisory facilitator discipline (no lock/lease, S5); if an Answer never
arrives the facilitator may release on its own judgment — there is no automated
lease (open question resolved toward advisory, per S5).

Verify: the protocol states the ordering rule as a requirement naming the
surface-intersection key and the Answer/release release-condition (S2 pass/fail).

### 4. Single-owner cardinality + classifier (S6, D6, D7)

- Modified: `.claude/skills/kata-session/references/dispatch-discipline.md`

Add a **Single-owner routing** rule: a single-owner directive routes to exactly
one acting lane; co-recipients get a no-staging FYI carrying no edit-intent and
requiring no action (D6). Define the **classifier** (D7): a directive is
multi-owner *iff* it explicitly names ≥2 distinct acting recipients each given a
work-producing instruction; everything else — one named owner, an unaddressed
"someone should…", a close-out/decision directive — is single-owner. State the
**conservative default**: ambiguous directives are single-owner (D7 rationale:
the fan-out ships committed loss; a starved FYI lane is recoverable by
re-dispatch). Note S5 holds — cardinality is routing only, no lock.

Verify: the protocol states the one-acting-lane rule, names the classifier
predicate, and declares the conservative default as requirements (S6 pass/fail).

### 5. Wire the protocol into the facilitator skill surface (S4)

- Modified: `.claude/skills/kata-session/SKILL.md`

In the Facilitator Process and the facilitator DO-CONFIRM checklist, reference
the dispatch-discipline rules so a session exercises them: checklist items that
same-surface asks were serialized, that each work-producing ask carried
edit-intent, and that single-owner directives routed to one lane. Include in
`dispatch-discipline.md` one worked example ask showing edit-intent
(`staged_paths` + `output_surfaces`) driving scoped staging — the concrete
artifact S4's "at least one ask shows edit-intent driving scoped staging" half
points at, present in the protocol independent of any live session. The example
must be generic (placeholder paths like `wiki/<file>`, no repo issue/PR numbers,
no dated snapshots) so it passes the `skill-genericity` gate.

Verify (S4, both halves, at implementation time per spec.md S4): (a) the
SKILL.md facilitator checklist names the serialization rule and the edit-intent
requirement — protocol active; (b) `dispatch-discipline.md` carries the worked
edit-intent example ask — the ask exercised. The post-deployment zero-collision
result is a separate meter, not this gate.

### 6. S5 review-gate note

- Modified: `.claude/skills/kata-session/references/dispatch-discipline.md`

One line stating the no-lock/lease/mutex boundary (S5) as a standing constraint
on this protocol, so a future edit that adds a lock is visibly out of bounds.

Verify: the no-lock constraint is stated; the diff contains no lock/lease/mutex
primitive (S5 review gate).

After Steps 2–6, `bun run invariants` (skill-genericity rule, which globs
`.claude/skills/kata-*/**`) must pass on the edited `dispatch-discipline.md` and
`SKILL.md`: the new protocol text uses generic field names (`staged_paths`,
`output_surfaces`) and must carry no repo package names, file paths, or
issue/PR links.

## Risks

- **A sweep via an un-modeled API.** The rule keys on the `commitAll` callee,
  the one whole-tree-staging method the GitClient exposes. A future commit path
  that sweeps via a raw `runtime.subprocess.run(["git","add","-A"])` built from
  fragments would not be a `commitAll` call and would escape the rule. The
  framework's AST keys on the callee, so the completeness boundary is "uses
  `commitAll`"; a raw-argv sweep is a separate shape. Document this inline so a
  future maintainer extends the callee set (or adds an argv-literal check scoped
  to JS only) if such a path appears; the corpus has none today (the only raw
  `add -A` argv lives in the GitClient definition the rule excludes). The
  deny-by-default posture means a newly-introduced sweep API surfaces as an
  un-allowlisted caller only if the rule recognizes it — so the rule's API set is
  the completeness boundary, documented inline for future extension.
- **`.claude/**` write gating.** Editing `dispatch-discipline.md` / `SKILL.md`
  may be blocked by the Edit() settings rules; use the `bunx fit-selfedit`
  path per CLAUDE.md when blocked on a non-`main` branch.
- **Skill genericity.** `dispatch-discipline.md` is a published `kata-*` skill
  reference; the new rules must not name this monorepo's packages/paths. Write
  the serialization/classifier rules generically (no `libwiki`, no repo issue
  numbers) per `.claude/skills/CLAUDE.md`; `bun run invariants`
  (skill-genericity rule) gates this.

## Execution

Single agent or split: **Step 1 (lint)** is code and independent — route to an
engineering agent. **Steps 2–6 (protocol docs)** are documentation in one skill
and share `dispatch-discipline.md` — route to `technical-writer`, executed as one
unit (they edit the same file). Steps 1 and 2–6 can run in parallel; no ordering
dependency between the lint and the protocol docs. Within 2–6, do 2 (field)
before 3/4 (rules that reference the field).

— Staff Engineer 🛠️
