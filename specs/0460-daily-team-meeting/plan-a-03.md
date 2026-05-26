# Plan 0460-A Part 03 — Skill Integration (14 Entry-Point Skills)

## Scope

Add `references/metrics.md` and a metrics recording bullet to all 14 entry-point
kata skills. 14 new files created, 14 existing files modified.

## Files

| Action | Path                                                           |
| ------ | -------------------------------------------------------------- |
| Create | `.claude/skills/kata-security-audit/references/metrics.md`     |
| Create | `.claude/skills/kata-security-update/references/metrics.md`    |
| Create | `.claude/skills/kata-release-readiness/references/metrics.md`  |
| Create | `.claude/skills/kata-release-review/references/metrics.md`     |
| Create | `.claude/skills/kata-product-triage/references/metrics.md`     |
| Create | `.claude/skills/kata-product-classify/references/metrics.md`   |
| Create | `.claude/skills/kata-product-evaluation/references/metrics.md` |
| Create | `.claude/skills/kata-documentation/references/metrics.md`      |
| Create | `.claude/skills/kata-wiki-curate/references/metrics.md`        |
| Create | `.claude/skills/kata-trace/references/metrics.md`              |
| Create | `.claude/skills/kata-spec/references/metrics.md`               |
| Create | `.claude/skills/kata-design/references/metrics.md`             |
| Create | `.claude/skills/kata-plan/references/metrics.md`               |
| Create | `.claude/skills/kata-implement/references/metrics.md`          |
| Modify | `.claude/skills/kata-security-audit/SKILL.md`                  |
| Modify | `.claude/skills/kata-security-update/SKILL.md`                 |
| Modify | `.claude/skills/kata-release-readiness/SKILL.md`               |
| Modify | `.claude/skills/kata-release-review/SKILL.md`                  |
| Modify | `.claude/skills/kata-product-triage/SKILL.md`                  |
| Modify | `.claude/skills/kata-product-classify/SKILL.md`                |
| Modify | `.claude/skills/kata-product-evaluation/SKILL.md`              |
| Modify | `.claude/skills/kata-documentation/SKILL.md`                   |
| Modify | `.claude/skills/kata-wiki-curate/SKILL.md`                     |
| Modify | `.claude/skills/kata-trace/SKILL.md`                           |
| Modify | `.claude/skills/kata-spec/SKILL.md`                            |
| Modify | `.claude/skills/kata-design/SKILL.md`                          |
| Modify | `.claude/skills/kata-plan/SKILL.md`                            |
| Modify | `.claude/skills/kata-implement/SKILL.md`                       |

## Steps

### 1. Create 14 metrics.md reference files

Each `references/metrics.md` follows the same structure (~20 lines each):

```markdown
# Metrics — {Skill Domain}

Suggested metrics for this domain. These are starting points — discover which
metrics are most useful through practice. Record per the
[`kata-metrics`](../../kata-metrics/SKILL.md) protocol.

| Metric | Unit | Description | Data source |
| ------ | ---- | ----------- | ----------- |
| ...    | ...  | ...         | ...         |
```

Create the `references/` directory for skills that lack one (9 of 14). Skills
that already have a `references/` directory (kata-security-update,
kata-product-triage, kata-product-classify, kata-documentation, kata-trace)
already have the directory — just add `metrics.md`.

**Metric suggestions per skill** (from the spec's table, fleshed out with data
sources):

**kata-security-audit** (`references/metrics.md`):

| Metric                 | Unit  | Description                                   | Data source          |
| ---------------------- | ----- | --------------------------------------------- | -------------------- |
| open_vulnerabilities   | count | Unresolved vulnerabilities at run end         | npm audit, gh alerts |
| days_since_topic_audit | days  | Days since this audit topic was last reviewed | Coverage map in wiki |
| findings_count         | count | New findings identified this run              | Audit report         |

**kata-security-update** (`references/metrics.md`):

| Metric                | Unit  | Description                               | Data source       |
| --------------------- | ----- | ----------------------------------------- | ----------------- |
| dependabot_pr_backlog | count | Open Dependabot PRs at run end            | gh pr list        |
| time_to_resolve       | days  | Days oldest open Dependabot PR has waited | gh pr list        |
| prs_merged            | count | PRs successfully merged this run          | Run actions taken |

**kata-release-readiness** (`references/metrics.md`):

| Metric                  | Unit  | Description                              | Data source |
| ----------------------- | ----- | ---------------------------------------- | ----------- |
| prs_waiting             | count | PRs awaiting rebase or CI fix at run end | gh pr list  |
| consecutive_stuck_count | count | PRs stuck across multiple runs           | Wiki log    |
| rebase_failures         | count | Rebases that failed this run             | Run actions |

**kata-release-review** (`references/metrics.md`):

| Metric             | Unit  | Description                              | Data source     |
| ------------------ | ----- | ---------------------------------------- | --------------- |
| unreleased_changes | count | Commits on main since last release       | git log         |
| days_since_release | days  | Days since most recent release tag       | gh release list |
| publish_failures   | count | Publish workflow failures since last run | gh run list     |

**kata-product-triage** (`references/metrics.md`):

| Metric                | Unit  | Description                        | Data source   |
| --------------------- | ----- | ---------------------------------- | ------------- |
| open_issues           | count | Open issues at run end             | gh issue list |
| issues_triaged        | count | Issues triaged this run            | Run actions   |
| spec_conversion_count | count | Issues converted to specs this run | Run actions   |

**kata-product-classify** (`references/metrics.md`):

| Metric           | Unit  | Description                         | Data source    |
| ---------------- | ----- | ----------------------------------- | -------------- |
| open_prs         | count | Open PRs at run end                 | gh pr list     |
| prs_merged       | count | PRs merged this run                 | Run actions    |
| blocked_pr_count | count | PRs blocked by CI or trust failures | Classification |

**kata-product-evaluation** (`references/metrics.md`):

| Metric                | Unit  | Description                              | Data source   |
| --------------------- | ----- | ---------------------------------------- | ------------- |
| friction_points_found | count | User friction points identified this run | Evaluation    |
| tasks_completed       | count | Evaluation tasks completed               | Evaluation    |
| issues_created        | count | GitHub issues created from findings      | gh issue list |

**kata-documentation** (`references/metrics.md`):

| Metric            | Unit  | Description                             | Data source  |
| ----------------- | ----- | --------------------------------------- | ------------ |
| pages_reviewed    | count | Documentation pages reviewed this run   | Run actions  |
| accuracy_errors   | count | Factual errors found                    | Review       |
| days_since_review | days  | Days since this topic was last reviewed | Coverage map |

**kata-wiki-curate** (`references/metrics.md`):

| Metric              | Unit  | Description                             | Data source |
| ------------------- | ----- | --------------------------------------- | ----------- |
| stale_observations  | count | Teammate observations older than 7 days | Wiki scan   |
| summary_corrections | count | Summary inaccuracies corrected this run | Run actions |
| log_hygiene_issues  | count | Weekly log format issues found          | Wiki scan   |

**kata-trace** (`references/metrics.md`):

| Metric             | Unit  | Description                                 | Data source     |
| ------------------ | ----- | ------------------------------------------- | --------------- |
| traces_analyzed    | count | Workflow traces analyzed this run           | Run actions     |
| findings_per_trace | count | Actionable findings from the analyzed trace | Analysis        |
| invariants_passed  | count | Invariants that passed this run             | Invariant audit |

**kata-spec** (`references/metrics.md`):

| Metric           | Unit  | Description                           | Data source  |
| ---------------- | ----- | ------------------------------------- | ------------ |
| specs_in_backlog | count | Specs at `spec draft` in STATUS       | specs/STATUS |
| days_in_draft    | days  | Days the oldest draft spec has waited | Git log      |

**kata-design** (`references/metrics.md`):

| Metric             | Unit  | Description                              | Data source  |
| ------------------ | ----- | ---------------------------------------- | ------------ |
| designs_in_backlog | count | Specs at `spec approved` awaiting design | specs/STATUS |
| days_in_draft      | days  | Days the oldest design draft has waited  | Git log      |

**kata-plan** (`references/metrics.md`):

| Metric           | Unit  | Description                              | Data source  |
| ---------------- | ----- | ---------------------------------------- | ------------ |
| plans_in_backlog | count | Specs at `design approved` awaiting plan | specs/STATUS |
| days_in_draft    | days  | Days the oldest plan draft has waited    | Git log      |

**kata-implement** (`references/metrics.md`):

| Metric               | Unit  | Description                       | Data source |
| -------------------- | ----- | --------------------------------- | ----------- |
| steps_completed      | count | Plan steps completed this run     | Run actions |
| blockers_encountered | count | Plan deviations or blockers hit   | Run actions |
| plan_deviation_count | count | Steps that diverged from the plan | Run actions |

### 2. Add metrics recording bullet to 13 existing Memory sections

For the 13 skills that already have `## Memory: what to record`, add one bullet
at the end of the existing bullet list. Use identical wording across all 13:

```markdown
- **Metrics** — Record relevant measurements to
  `wiki/metrics/{agent}/{domain}/` per the
  [`kata-metrics`](../kata-metrics/SKILL.md) protocol
```

**Exact insertion points** (add after the last existing bullet, before the next
`##` heading or end of file):

| Skill                   | Insert after line containing                            |
| ----------------------- | ------------------------------------------------------- |
| kata-security-audit     | `- Policy violations found and whether fixed or spec'd` |
| kata-security-update    | `- **Reverted merges**`                                 |
| kata-release-readiness  | `- **Releases cut**`                                    |
| kata-release-review     | `- **Main branch CI state**`                            |
| kata-product-triage     | `- **Hand-offs**`                                       |
| kata-product-classify   | `- **Merge failures**`                                  |
| kata-product-evaluation | `- **Issues created/updated**`                          |
| kata-documentation      | `- **Observations for teammates**`                      |
| kata-wiki-curate        | `- **Observations for teammates**`                      |
| kata-trace              | `- **Observations for teammates**`                      |
| kata-design             | `- **Deferred specs**`                                  |
| kata-plan               | `- **Deferred specs**`                                  |
| kata-implement          | `- **Deferred specs**`                                  |

**Important:** Verify the exact last bullet text by reading each file before
editing. The table above is based on current codebase state — confirm before
applying. If the expected last bullet is not found (file was modified between
plan writing and implementation), locate the `## Memory: what to record` section
and append the metrics bullet as the last item in that section's bullet list.

### 3. Add Memory section to kata-spec

`kata-spec` is the only entry-point skill without a "Memory: what to record"
section. Add a new section before the existing `## What NOT to Do` heading:

```markdown
## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Specs written** — Spec number, name, and status
- **Review results** — Specs reviewed and disposition (approved/changes needed)
- **Deferred work** — Findings not yet captured as specs
- **Metrics** — Record relevant measurements to
  `wiki/metrics/{agent}/{domain}/` per the
  [`kata-metrics`](../kata-metrics/SKILL.md) protocol
```

Insert this before:

```markdown
## What NOT to Do
```

at line 126 of the current `kata-spec/SKILL.md`.

## Verification

1. `bun run check` passes.
2. All 14 `references/metrics.md` files exist with 3–5 metrics each.
3. All 14 `SKILL.md` files have a `## Memory: what to record` section containing
   the metrics bullet with identical wording.
4. No other changes to any SKILL.md content (only the metrics bullet addition).
