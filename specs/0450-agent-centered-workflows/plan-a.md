# Plan A — Spec 0450: Agent-Centered Workflows

## Approach

Replace ten task-specific workflow files with six agent-centered ones (one per
agent). Each workflow sends the same generic task prompt. The agent reads shared
memory, surveys domain state via a new **Assess** section in its profile, and
picks the highest-priority action from its full skill set.

Clean break: old workflow files are deleted, not deprecated. No aliases, no
shims, no fallback paths.

**Ordering rationale:** Agent profiles first (workflows reference them by name),
workflow files second, KATA.md third (describes the new structure), invariants
last (independent).

## Schedule Design

Each agent's previous workflows ran 4+ days/week or daily. Consolidating to
daily simplifies scheduling; the Assess framework handles idle days by reporting
clean state. The improvement coach stays at 2x/week because it needs traces from
other agents to accumulate between runs.

| New workflow            | Cron            | Frequency | UTC   | Agent             |
| ----------------------- | --------------- | --------- | ----- | ----------------- |
| `security-engineer.yml` | `7 4 * * *`     | Daily     | 04:07 | security-engineer |
| `technical-writer.yml`  | `37 5 * * *`    | Daily     | 05:37 | technical-writer  |
| `product-manager.yml`   | `23 6 * * *`    | Daily     | 06:23 | product-manager   |
| `staff-engineer.yml`    | `11 7 * * *`    | Daily     | 07:11 | staff-engineer    |
| `release-engineer.yml`  | `43 8 * * *`    | Daily     | 08:43 | release-engineer  |
| `improvement-coach.yml` | `47 10 * * 3,6` | Wed & Sat | 10:47 | improvement-coach |

**Ordering constraints preserved:**

1. Security (04:07) before product (06:23)
2. Product (06:23) before planning (07:11)
3. Planning (07:11) before release (08:43)
4. All producers before improvement coach (10:47)
5. Off-minute staggering: :07, :37, :23, :11, :43, :47 — all distinct

**Task prompt (all six workflows):**

```
Assess the current state of your domain and act on the highest-priority finding.
```

## Changes

### 1. Agent profiles — replace Workflows with Assess

For each of the six files in `.claude/agents/`, replace the `## Workflows` (or
`## Workflow`) section — from its heading through all content up to **but not
including** the next `##` heading — with a new `## Assess` section. Also add
Decision logging instructions to the Memory paragraph in the Constraints
section.

**Decision logging paragraph** (identical for all six agents — insert
immediately after the sentence "Use `###` subheadings for the fields skills
specify to record." and before the sentence starting "At the end, update"):

```markdown
Every run must open with a `### Decision` subheading recording:
**Surveyed** — what domain state was checked and the results,
**Alternatives** — what actions were available,
**Chosen** — what action was selected and which skill was invoked,
**Rationale** — why this action over the alternatives.
```

The six Assess sections follow.

---

#### `.claude/agents/security-engineer.md`

Replace `## Workflows` and everything up to `## Constraints` with:

```markdown
## Assess

Survey domain state, then choose the highest-priority action:

1. **Critical vulnerabilities?** -- Patch immediately
   (`kata-security-update`; check: `npm audit`, GitHub security advisories)
2. **Open Dependabot PRs?** -- Triage and merge or close
   (`kata-security-update`; check: list open Dependabot PRs)
3. **No urgent patches?** -- Audit the least-recently-covered topic
   (`kata-security-audit`; check: coverage map in `wiki/security-engineer.md`)
4. **Nothing actionable?** -- Report clean state

After choosing, follow the selected skill's full procedure. For audit findings:
- **Trivial fix** -- `fix/security-audit-YYYY-MM-DD` branch from `main`
- **Structural finding** -- spec via `kata-spec` on `spec/security-<name>`
  branch from `main`
- Every PR on an independent branch from `main`
```

---

#### `.claude/agents/technical-writer.md`

Replace `## Workflows` and everything up to `## Constraints` with:

```markdown
## Assess

Survey domain state, then choose the highest-priority action:

1. **Stale or inaccurate cross-agent observations?** -- Curate the wiki
   (`kata-wiki-curate`; check: agent summaries for unacknowledged observations,
   stale data, or log hygiene issues)
2. **Documentation topic due for review?** -- Review one topic in depth
   (`kata-documentation`; check: coverage map in `wiki/technical-writer.md`)
3. **Nothing actionable?** -- Report clean state

After choosing, follow the selected skill's full procedure. For documentation
findings:
- **Trivial fix** -- `fix/doc-review-YYYY-MM-DD` branch from `main`
- **Structural finding** -- spec via `kata-spec` on `spec/docs-<name>` branch
  from `main`
- Every PR on an independent branch from `main`
```

---

#### `.claude/agents/release-engineer.md`

Replace `## Workflows` and everything up to `## Constraints` with:

```markdown
## Assess

Survey domain state, then choose the highest-priority action:

1. **Main branch CI failing from trivial issues?** -- Repair CI directly
   (push `bun run check:fix` to `main`; you are the **only** agent allowed to
   push to `main`, and only for mechanical fixes -- if failures persist after
   `check:fix`, stop and report)
2. **Open PRs needing rebase or CI fixes?** -- Make branches merge-ready
   (`kata-release-readiness`; check: open PRs with failing checks or behind
   `main`)
3. **Unreleased changes on main?** -- Cut releases
   (`kata-release-review`; check: compare HEAD against latest tags for changed
   packages)
4. **Nothing actionable?** -- Report clean state
```

---

#### `.claude/agents/staff-engineer.md`

Replace `## Workflows` and everything up to `## Constraints` with:

```markdown
## Assess

Survey domain state, then choose the highest-priority action:

1. **Approved specs without plans?** -- Write an execution-ready plan
   (`kata-plan`; check: `specs/STATUS` for specs in `review` without a
   `plan-a.md`; push the plan on the existing `spec/` branch -- never start a
   new branch)
2. **Planned specs awaiting implementation?** -- Implement the lowest-ID planned
   spec (`kata-implement`; check: `specs/STATUS` for specs in `planned`;
   implement on a `feat/<spec-slug>` branch from `main`)
3. **Nothing actionable?** -- Report clean state

After choosing, follow the selected skill's full procedure.
```

---

#### `.claude/agents/product-manager.md`

Replace `## Workflows` and everything up to `## Constraints` with:

```markdown
## Assess

Survey domain state, then choose the highest-priority action:

1. **Open PRs awaiting triage?** -- Classify and merge qualifying PRs
   (`kata-product-classify`; check: open PRs, contributor trust, CI status; for
   spec PRs also apply `kata-spec` review, for plan PRs also apply `kata-plan`
   review)
2. **Open issues awaiting triage?** -- Classify and act on issues
   (`kata-product-triage`; check: open issues; trivial fix -- `fix/` branch,
   product-aligned -- spec via `kata-spec`, out of scope -- comment and label)
3. **Nothing actionable?** -- Report clean state

Product evaluation (`kata-product-evaluation`) is supervisor-initiated via
manual workflows and is not part of scheduled assessment.
```

---

#### `.claude/agents/improvement-coach.md`

Replace `## Workflow` (singular heading) and everything up to `## Constraints`
with:

```markdown
## Assess

Survey domain state, then choose the highest-priority action:

1. **Recent workflow traces not yet analyzed?** -- Grasp the current condition
   (`kata-trace`; check: completed workflow runs since last analysis, using the
   run selection algorithm)
2. **Unaddressed findings from prior grasps?** -- Act on findings (check:
   previous findings in `wiki/improvement-coach.md`; trivial fix --
   `fix/coach-<name>` branch from `main`, improvement -- spec via `kata-spec` on
   `spec/<name>` branch from `main`)
3. **Nothing actionable?** -- Report clean state

After choosing, follow the selected skill's full procedure. Every PR must branch
directly from `main`.
```

---

### 2. Workflow files — delete old, create new

**Delete** these 8 files:

- `.github/workflows/security-audit.yml`
- `.github/workflows/security-update.yml`
- `.github/workflows/doc-review.yml`
- `.github/workflows/wiki-curate.yml`
- `.github/workflows/release-readiness.yml`
- `.github/workflows/release-review.yml`
- `.github/workflows/plan-specs.yml`
- `.github/workflows/implement-plans.yml`

**Create or replace** these 6 files (product-manager.yml and
improvement-coach.yml are overwritten with new content; the other 4 are new):

- `.github/workflows/security-engineer.yml`
- `.github/workflows/technical-writer.yml`
- `.github/workflows/product-manager.yml`
- `.github/workflows/staff-engineer.yml`
- `.github/workflows/release-engineer.yml`
- `.github/workflows/improvement-coach.yml`

All six share the same structure. The template block below is authoritative — do
not copy from an existing file (they use varied job names and checkout
settings). Apply per-agent values from the table below:

| File                    | `name:`                   | `cron:`         | Job name | Step name        | `agent-profile:`    | `max-turns:` |
| ----------------------- | ------------------------- | --------------- | -------- | ---------------- | ------------------- | ------------ |
| `security-engineer.yml` | `Kata: Security Engineer` | `7 4 * * *`     | `kata`   | `Assess and Act` | `security-engineer` | `200`        |
| `technical-writer.yml`  | `Kata: Technical Writer`  | `37 5 * * *`    | `kata`   | `Assess and Act` | `technical-writer`  | `200`        |
| `product-manager.yml`   | `Kata: Product Manager`   | `23 6 * * *`    | `kata`   | `Assess and Act` | `product-manager`   | `200`        |
| `staff-engineer.yml`    | `Kata: Staff Engineer`    | `11 7 * * *`    | `kata`   | `Assess and Act` | `staff-engineer`    | `0`          |
| `release-engineer.yml`  | `Kata: Release Engineer`  | `43 8 * * *`    | `kata`   | `Assess and Act` | `release-engineer`  | `200`        |
| `improvement-coach.yml` | `Kata: Improvement Coach` | `47 10 * * 3,6` | `kata`   | `Assess and Act` | `improvement-coach` | `200`        |

**Shared values for all six:**

```yaml
on:
  schedule:
    - cron: "<per-agent cron>"
  workflow_dispatch:
    inputs:
      task-amend:
        description: "Additional text appended to the task prompt for steering"
        required: false
        type: string

concurrency:
  group: <agent-name>
  cancel-in-progress: true

permissions:
  contents: write
```

**Shared job steps** (preserve existing SHA-pinned action versions exactly):

```yaml
jobs:
  kata:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Generate installation token
        id: ci-app
        uses: actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859 # v3
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}

      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
        with:
          fetch-depth: 0
          token: ${{ steps.ci-app.outputs.token }}
          submodules: true

      - uses: ./.github/actions/bootstrap

      - name: Assess and Act
        uses: ./.github/actions/kata-action
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          CLAUDE_CODE_USE_BEDROCK: "0"
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          task-text: >-
            Assess the current state of your domain and act on the
            highest-priority finding.
          agent-profile: "<agent-name>"
          model: "opus"
          max-turns: "<per-agent value>"
          task-amend: ${{ inputs.task-amend }}
```

**Cron comments** (one per file, above the cron line):

- security-engineer: `# Daily at 04:07 UTC — first agent in the cycle`
- technical-writer: `# Daily at 05:37 UTC — curate and review before producers`
- product-manager:
  `# Daily at 06:23 UTC — triage after security, before planning`
- staff-engineer: `# Daily at 07:11 UTC — plan and implement after triage`
- release-engineer: `# Daily at 08:43 UTC — release after implementation`
- improvement-coach:
  `# Wed & Sat at 10:47 UTC — analyze traces after all producers`

### 3. KATA.md — update workflow references

Four edits to `KATA.md`. Match by content, not line numbers — concurrent merges
to `main` may shift lines before this plan lands.

**Edit A — Opening paragraph (line 16).** Change:

```
Ten scheduled workflows, six agent personas, and sixteen skills form a
self-reinforcing PDSA cycle.
```

to:

```
Six scheduled workflows — one per agent — six agent personas, and sixteen
skills form a self-reinforcing PDSA cycle.
```

**Edit B — Workflows section heading and intro (lines 74-79).** Replace:

```markdown
## Workflows

Ten scheduled workflows span 03-11 UTC. Times respect dependencies (plans before
implementation, rebase before merge, merge before release) and same-agent
workflows never overlap. Off-minute schedules avoid API load spikes. All support
`workflow_dispatch`, use concurrency groups, and have a 30-minute timeout.
```

with:

```markdown
## Workflows

Six scheduled workflows span 04-11 UTC, one per agent. Times respect ordering
constraints (security before product, product before planning, planning before
release, all producers before the improvement coach). Off-minute schedules avoid
API load spikes. All support `workflow_dispatch`, use concurrency groups, and
have a 30-minute timeout. Each workflow sends the same generic task prompt; the
agent's Assess section determines the actual action.
```

**Edit C — Workflow table (lines 81-92).** Replace the 10-row table with:

```markdown
| Workflow                | Schedule            | Agent             |
| ----------------------- | ------------------- | ----------------- |
| **security-engineer**   | Daily 04:07 UTC     | security-engineer |
| **technical-writer**    | Daily 05:37 UTC     | technical-writer  |
| **product-manager**     | Daily 06:23 UTC     | product-manager   |
| **staff-engineer**      | Daily 07:11 UTC     | staff-engineer    |
| **release-engineer**    | Daily 08:43 UTC     | release-engineer  |
| **improvement-coach**   | Wed & Sat 10:47 UTC | improvement-coach |
```

Remove the Phase column — agents now participate in multiple PDSA phases per
run, so a single-phase label per row is misleading. The Skills section already
maps skills to phases.

**Edit D — Authentication section (lines 193-195).** Remove the sentence:

```
`security-audit` uses `GITHUB_TOKEN` for checkout (preserving least
privilege) and a separate App token for API access.
```

This referenced a deleted workflow. (It was also inaccurate — security-audit.yml
used the App token for checkout, not `GITHUB_TOKEN`.)

### 4. Invariants — reorganize headers and add decision-quality checks

**`.claude/skills/kata-trace/references/invariants.md`**

**Header reorganization.** Rename section headers from
`## agent / workflow-name traces` to `## agent traces`, merging sections where
an agent previously had two workflow-specific sections. Existing invariant rows
within each section are preserved unchanged.

| Old header(s)                                                                                    | New header                                                                                               |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `## product-manager / product-backlog traces`                                                    | `## product-manager traces`                                                                              |
| `## release-engineer / release-readiness traces` + `## release-engineer / release-review traces` | `## release-engineer traces`                                                                             |
| `## security-engineer / security-update traces`                                                  | `## security-engineer traces` (note: no security-audit invariants exist to merge — only security-update) |
| `## staff-engineer / plan-specs traces` + `## staff-engineer / implement-plans traces`           | `## staff-engineer traces`                                                                               |
| `## technical-writer / doc-review traces` + `## technical-writer / wiki-curate traces`           | `## technical-writer traces`                                                                             |
| _(new)_                                                                                          | `## improvement-coach traces`                                                                            |

For merged sections (release-engineer, staff-engineer, technical-writer),
concatenate the invariant tables into a single table under the new header.
Preserve the prose paragraph after the product-manager table.

**New decision-quality invariant.** Add one row as the **first row** in each
agent's table — the assess phase precedes all skill-specific work:

| Agent             | Invariant                                  | Evidence to find                                                                                             | Severity |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------- |
| security-engineer | Domain state surveyed before action chosen | `npm audit` execution or Dependabot PR listing before the first skill-specific action                        | **High** |
| technical-writer  | Domain state surveyed before action chosen | `Read` calls on agent summaries or coverage map before the first skill-specific action                       | **High** |
| release-engineer  | Domain state surveyed before action chosen | CI status check (`bun run check`) or PR listing before the first skill-specific action                       | **High** |
| staff-engineer    | Domain state surveyed before action chosen | `Read` call on `specs/STATUS` before the first plan or implement action                                      | **High** |
| product-manager   | Domain state surveyed before action chosen | `gh pr list` or `gh issue list` call before the first classify or triage action                              | **High** |
| improvement-coach | Domain state surveyed before action chosen | Workflow run listing (`gh run list`) or run selection check before the first grasp or act-on-findings action | **High** |

**New section.** Add `## improvement-coach traces` with the decision-quality
invariant as its only row.

## Blast Radius

**Created (4):**

- `.github/workflows/security-engineer.yml`
- `.github/workflows/technical-writer.yml`
- `.github/workflows/release-engineer.yml`
- `.github/workflows/staff-engineer.yml`

**Modified (10):**

- `.claude/agents/security-engineer.md`
- `.claude/agents/technical-writer.md`
- `.claude/agents/release-engineer.md`
- `.claude/agents/staff-engineer.md`
- `.claude/agents/product-manager.md`
- `.claude/agents/improvement-coach.md`
- `.github/workflows/product-manager.yml`
- `.github/workflows/improvement-coach.yml`
- `KATA.md`
- `.claude/skills/kata-trace/references/invariants.md`

**Deleted (8):**

- `.github/workflows/security-audit.yml`
- `.github/workflows/security-update.yml`
- `.github/workflows/doc-review.yml`
- `.github/workflows/wiki-curate.yml`
- `.github/workflows/release-readiness.yml`
- `.github/workflows/release-review.yml`
- `.github/workflows/plan-specs.yml`
- `.github/workflows/implement-plans.yml`

## Ordering

1. **Agent profiles** (6 files) — no inter-file dependencies, can be edited in
   any order
2. **Workflow files** (8 deletes + 6 creates/overwrites) — depend on profiles
   existing; no inter-file dependencies within this group
3. **KATA.md** (4 edits) — describes the new workflow structure
4. **Invariants** (1 file) — independent of steps 1-3

## Decisions

1. **Daily schedule for five agents; 2x/week for improvement-coach.** Previous
   schedules ran 4-7 days/week per agent. Daily is the natural union. The
   improvement coach stays 2x/week because it needs traces to accumulate between
   runs. On idle days agents report clean state and terminate early.

2. **Staff-engineer gets unlimited turns (`max-turns: "0"`).** The agent may
   choose to implement, which is unbounded. This matches the existing
   `implement-plans.yml` behavior — the risk is unchanged, not new.

3. **Single generic task prompt for all workflows.** The spec calls for an
   assessment-first prompt. Agent-specific priorities live in the profile's
   Assess section, not the task prompt. This keeps workflow files identical
   except for schedule and agent name.

4. **`fetch-depth: 0` for all workflows.** Some old workflows used shallow
   clones; others used full history. Since agents now choose their own action —
   which may require full git history (release tags, branch diffs) — all new
   workflows use full clones. Cost: slightly more checkout time on idle runs.

5. **`permissions: contents: write` for all workflows.** The old
   `security-audit.yml` used `contents: read` for least privilege. The
   consolidated `security-engineer.yml` needs write because the agent may choose
   security-update actions (branch creation, push, merge). Least privilege now
   operates at the agent decision level, not the workflow level.

6. **Phase column removed from KATA.md workflow table.** Agents now participate
   in multiple PDSA phases per run. The Skills section already maps skills to
   phases.

7. **Action patterns preserved in Assess sections.** Some agents have branching
   patterns not fully specified in skills (security-engineer's fix/spec
   branching, release-engineer's direct-to-main authority, improvement-coach's
   branch naming). These are retained after the priority list for continuity.

8. **Product evaluation excluded from Assess.** The `kata-product-evaluation`
   skill is supervisor-initiated via manual setup workflows (`guide-setup.yml`,
   etc.). It is not part of scheduled assessment and is omitted from the
   product-manager's priority framework.

9. **Product-manager dual-job consolidated to single cron.** The current file
   has two cron entries (daily 08:13 + Mon/Wed/Fri 05:17, totalling ~10
   runs/week). The new file has one daily cron at 06:23 (7 runs/week). The
   agent's Assess section handles both PR triage and issue triage in a single
   run.

10. **Job names unified to `kata`.** Existing workflows use varied job names
    (`coach`, `triage`, `audit`, `readiness`, `release`, `implement`, `plan`,
    `review`, `curate`). The new workflows all use `kata`. Verified: no branch
    protection rules or required status checks reference the old job names.

11. **Technical-writer runs second (05:37).** The spec's four ordering
    constraints do not require a specific position for the technical-writer.
    Placing it early (after security, before product) lets wiki curation surface
    cross-agent observations before the product-manager and staff-engineer run,
    so those agents see fresher shared memory.

## Risks

1. **Assessment quality.** Agents may skip the survey and jump to a default
   action. **Mitigation:** The new decision-quality invariants catch this at
   **High** severity in trace audits. The improvement coach will flag
   violations.

2. **Decision logging consistency.** Agents may omit the four required Decision
   fields. **Mitigation:** The Memory paragraph prescribes the format. The
   improvement coach's regular trace analysis will flag logging gaps as
   findings.

3. **Daily security-engineer runs.** Previously 4x/week; now 7x/week. On clean
   days the agent reports clean state quickly (low token cost). **Mitigation:**
   Monitor run durations in the first week to confirm clean-state runs terminate
   early.

4. **Old workflow names in GitHub run history.** Existing run history references
   the old workflow names. External links to workflow runs by old names become
   stale. **Mitigation:** Expected for a clean break. Run history is preserved
   under old names; new runs appear under new names.

5. **Concurrency group rename.** Old groups (`security-audit`,
   `security-update`, etc.) are replaced by agent-name groups. If an old run is
   somehow still in-progress when the new workflow fires, they won't share a
   concurrency group. **Mitigation:** Extremely unlikely — workflows have
   30-minute timeouts and old cron schedules stop firing once files are deleted.

## Libraries Used

No `@forwardimpact/lib*` packages are consumed. All changes are YAML workflow
files, Markdown agent profiles, and Markdown documentation. The implementation
uses the existing `kata-action` composite and `fit-eval` CLI as-is.

## Execution

Single `staff-engineer` agent, sequential within one PR on branch
`feat/450-agent-centered-workflows`. All changes are tightly coupled — workflow
files must match profile content, KATA.md must match workflow files, invariant
headers must match workflow names. No decomposition needed; no parallel agents.
