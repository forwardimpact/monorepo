# Plan A: Product Manager Issue Progression

Spec: [spec.md](spec.md) | Design: [design-a.md](design-a.md)

## Approach

Three targeted instruction-layer edits — one per component in the design. Step 1
adds a `needs-spec` label signal to kata-product-issue's triage hand-off. Step 2
replaces the agent profile's sequential if/else assess with a two-phase
survey-then-act priority matrix. Step 3 registers an issue-progression invariant
in kata-trace. No code, no new files, no dependencies.

## Step 1: Add `needs-spec` label to triage hand-off

**Intent:** Product-aligned issues receive a `needs-spec` action signal during
triage so the agent can query for them on subsequent runs.

| Action   | File                                         |
| -------- | -------------------------------------------- |
| Modified | `.claude/skills/kata-product-issue/SKILL.md` |

In Step 4 (Hand Off), replace the product-aligned bullet:

**Before:**

```markdown
- **Product-aligned** → invoke the `kata-spec` skill to draft a spec,
  referencing the issue. Label the issue `triaged`.
```

**After:**

```markdown
- **Product-aligned** → invoke the `kata-spec` skill to draft a spec,
  referencing the issue. Label the issue `triaged` and `needs-spec`.
```

**Verification:** `grep 'needs-spec' .claude/skills/kata-product-issue/SKILL.md`
returns the modified line.

## Step 2: Replace assess with survey-then-act priority matrix

**Intent:** The agent surveys all open PRs and issues before choosing an action,
breaking the starvation cycle where re-examining blocked PRs consumed every run.

| Action   | File                                |
| -------- | ----------------------------------- |
| Modified | `.claude/agents/product-manager.md` |

Replace the Assess section (from `## Assess` through the line before
`## Constraints`) with:

**Before:**

```markdown
## Assess

Survey domain state, then choose the highest-priority action:

0. **Check the storyboard** (see
   [shared protocol](.claude/agents/references/memory-protocol.md)).
1. **Open PRs awaiting triage?** -- Classify and merge qualifying PRs
   (`kata-product-pr`; check: open PRs, contributor trust, CI status; for spec
   PRs also apply `kata-spec` review, for plan PRs also apply `kata-plan`
   review)
2. **Open issues awaiting triage?** -- Classify and act on issues
   (`kata-product-issue`; check: open issues; trivial fix -- `fix/` branch,
   product-aligned -- spec via `kata-spec`, out of scope -- comment and label)
3. **Nothing actionable?** -- Report clean state

Product evaluation (`kata-product-evaluation`) is supervisor-initiated via
manual workflows and is not part of scheduled assessment.
```

**After:**

```markdown
## Assess

Survey all open work items, then act on the highest-priority bucket:

0. **Check the storyboard** (see
   [shared protocol](.claude/agents/references/memory-protocol.md)).

### Phase 1: Survey

Run both queries and classify every item into a priority bucket:

- `gh pr list --state open` -- **Mergeable PRs (P1)** if fix/bug/spec type, CI
  green, trusted contributor. **Untriaged (P3)** if not yet classified.
  Classified-but-blocked PRs match no bucket.
- `gh issue list --state open` -- **needs-spec (P2)** if labeled `needs-spec`.
  **Untriaged (P3)** if no `triaged` label. Issues labeled `triaged` without
  `needs-spec` match no bucket.

### Phase 2: Act on highest-priority bucket

| Priority | Bucket              | Action                                                                                                               |
| -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| P1       | Mergeable PRs       | Merge via `kata-product-pr`; for spec PRs also apply `kata-spec` review, for plan PRs also apply `kata-plan` review |
| P2       | `needs-spec` issues | Write spec for the oldest issue (by `createdAt`) via `kata-spec`                                                    |
| P3       | Untriaged work      | Triage PRs first (`kata-product-pr`), then issues (`kata-product-issue`)                                            |
| ---      | All empty           | Report clean state                                                                                                   |

After writing a spec for any issue (P2 or P3 hand-off), remove `needs-spec`:
`gh issue edit <number> --remove-label needs-spec`.

Product evaluation (`kata-product-evaluation`) is supervisor-initiated via
manual workflows and is not part of scheduled assessment.
```

**Verification:** Read the file; confirm Phase 1, Phase 2, priority table with
P1/P2/P3, and standalone `needs-spec` label cleanup instruction are present.

## Step 3: Add issue-progression invariant

**Intent:** kata-trace flags runs where the agent had `needs-spec` issues to
progress but took no spec-writing action.

| Action   | File                                                 |
| -------- | ---------------------------------------------------- |
| Modified | `.claude/skills/kata-trace/references/invariants.md` |

Add a row to the `## product-manager traces` table, after the existing rows:

```markdown
| Spec written for needs-spec issue when no PRs mergeable | `kata-spec` invocation when survey finds `needs-spec` issues and zero mergeable PRs | **Medium** |
```

**Verification:**
`grep 'Spec written for needs-spec' .claude/skills/kata-trace/references/invariants.md`
returns the new row.

## Step 4: Update STATUS

| Action   | File           |
| -------- | -------------- |
| Modified | `specs/STATUS` |

Set spec 0670 to `plan draft`:

```text
0670	plan	draft
```

**Verification:** `grep '670' specs/STATUS` shows `plan    draft`.

## Blast Radius

| File                                                 | Action   |
| ---------------------------------------------------- | -------- |
| `.claude/skills/kata-product-issue/SKILL.md`         | Modified |
| `.claude/agents/product-manager.md`                  | Modified |
| `.claude/skills/kata-trace/references/invariants.md` | Modified |
| `specs/STATUS`                                       | Modified |

Libraries used: none.

## Risks

| Risk                                      | Mitigation                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `needs-spec` label does not exist on repo | Implementer creates it before first use: `gh label create needs-spec --description "Issue needs a spec" --color FBCA04` |

## Execution

Single agent (`staff-engineer`), sequential steps 1-4. All changes are
instruction-layer markdown edits with no build or test dependencies.
