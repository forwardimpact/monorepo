---
name: trace-audit
description: >
  Audit an agent's workflow trace against named per-agent invariants.
  Confirms that scope-critical actions (e.g. contributor trust verification
  on every merge) actually happened, with quoted evidence. Findings flow
  back through the standard fix-or-spec discipline.
phase: Study
---

# Trace Audit

Some agent workflows have invariants that *must* hold on every run —
trust gates that protect the trust boundary, accountability checks that
prevent silent regressions, evidence requirements that keep findings
honest. This skill verifies those invariants against a real execution
trace and produces a structured audit report.

This skill complements [`gemba-walk`](../gemba-walk/SKILL.md): the gemba
walk is open-ended exploration with grounded theory; trace-audit is
targeted verification against a fixed checklist. Both consume the same
trace artifacts; both feed findings into the Act phase via fix-or-spec
discipline.

## When to Use

- After running `gemba-walk` on a trace, when the trace's owning workflow
  has named invariants in this skill
- On-demand when investigating a specific accountability concern
- When a finding from another source suggests an invariant may have been
  violated

## Prerequisites

- A downloaded trace from a CI agent workflow run (use `gemba-walk` to
  obtain one)
- The trace owner identified — the agent and skill that produced it

## Per-Agent Invariants

This is the canonical list of invariants the audit checks. Each invariant
names: which trace it applies to, what evidence to look for, and the
severity of a violation.

### product-manager / product-classify traces

| Invariant                                          | Evidence to find                                                                                            | Severity   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| Contributor lookup ran for every non-CI-app PR     | A `gh api repos/.../contributors` call before each non-CI-app PR was marked mergeable                       | **High**   |
| Author verified against the lookup result          | A comparison step naming the PR author against the returned contributor list                                | **High**   |
| CI status checked before mergeable verdict         | A `gh pr checks` call before each mergeable verdict                                                         | **Medium** |
| Spec PRs received a spec-skill review              | Spec review evaluation for any PR with `spec(...)` title prefix                                             | **Medium** |

A merge that proceeded without a visible contributor lookup or
verification is a **high-severity finding** and requires a fix PR or
spec, never silent acceptance.

### release-engineer / release-readiness traces

| Invariant                                       | Evidence to find                                                  | Severity   |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| `bun run check` and `bun run test` ran          | Tool calls invoking these commands before any push                | **Medium** |
| `--force-with-lease` used (never `--force`)     | Push commands inspected for the lease flag on rebase pushes       | **Medium** |

### release-engineer / release-review traces

| Invariant                                       | Evidence to find                                                  | Severity   |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| Tags pushed individually, not via `--tags`      | Each tag push is its own command                                  | **Medium** |
| Releases performed in dependency order          | Comparison of release order against `package.json` `dependencies` | **Low**    |

### security-engineer / security-update traces

| Invariant                                       | Evidence to find                                                  | Severity   |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| SHA pins never downgraded to tag references     | Diff inspection on workflow files                                 | **High**   |

### staff-engineer / plan-specs traces

| Invariant                                       | Evidence to find                                                  | Severity   |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| Approved spec read before plan written          | A `Read` call on `specs/<NNN>/spec.md` before any plan edits      | **Medium** |
| Risks section present in produced `plan.md`     | The plan file content includes a risks section                    | **Low**    |

### staff-engineer / implement-plans traces

| Invariant                                             | Evidence to find                                                        | Severity   |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| Both `spec.md` and `plan.md` read before first edit   | `Read` calls on both files before any `Edit`/`Write`                    | **High**   |
| Status advanced to `active` before implementation     | `specs/STATUS` edit setting the spec to `active` before the first edit  | **Medium** |
| `bun run check` and `bun run test` ran before push    | Tool calls invoking these commands before any push                      | **Medium** |
| Status advanced to `done` after final push            | `specs/STATUS` edit setting the spec to `done` after the push           | **Medium** |
| Scope discipline held                                 | No edits to files outside the plan's stated blast radius                | **Medium** |

## Process

### Step 1: Identify the Trace and Owner

Determine which agent and skill produced the trace. Match against the
section of this skill above. If the trace's owner is not listed, the
audit has no checklist for it — record the gap and recommend adding
invariants here.

### Step 2: Walk the Trace, Quoting Evidence

For each invariant in the relevant section, search the trace for the
evidence type listed. Quote the specific tool call, output, or absence
of either. Ground every conclusion in a quote — never speculate.

### Step 3: Produce the Audit Report

For each invariant, record:

- The invariant
- **PASS** with a quoted evidence reference, or
- **FAIL** with what was searched for and not found

Group findings by severity. High-severity failures must be acted on in
the next step.

### Step 4: Act on Findings

Findings flow through the standard fix-or-spec discipline:

- **Trivial fix** (mechanical, obvious) → branch from `main` as
  `fix/audit-<short-name>`, fix, push, open PR
- **Structural finding** (requires design or workflow change) → branch
  from `main` as `spec/audit-<short-name>`, write a spec via the `spec`
  skill, push, open PR

A high-severity finding without a fix PR or spec by the end of the run
is itself a process failure — record it and escalate.

## What NOT to Do

- **Do not invent invariants on the fly.** This skill checks the named
  list. New invariants are added by spec, not by ad hoc discovery during
  an audit.
- **Do not speculate.** Every PASS or FAIL must cite a specific quote
  from the trace.
- **Do not merge audit findings into other PRs.** Audit findings get
  their own `fix/audit-*` or `spec/audit-*` branch and PR.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Audit results table** — Trace owner, invariant, verdict, evidence
  reference
- **Findings acted on** — Which findings became fix PRs or specs, with
  PR/spec numbers
- **Coverage gaps** — Trace owners with no invariants in this skill yet
