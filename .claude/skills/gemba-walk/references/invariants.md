# Per-Agent Invariants

Named invariants that `gemba-walk`'s invariant audit step checks against an
agent workflow trace. Each invariant names: which trace it applies to, what
evidence to look for, and the severity of a violation.

When an invariant names a `gh` call as evidence, match it against the canonical
shape documented in
[`gemba-gh-cli` § Gemba query patterns](../../gemba-gh-cli/SKILL.md#gemba-query-patterns)
— callers are expected to use those shapes so the audit can grep for them
reliably.

## product-manager / product-backlog traces

| Invariant                                      | Evidence to find                                                                      | Severity   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| Contributor lookup ran for every non-CI-app PR | A `gh api repos/.../contributors` call before each non-CI-app PR was marked mergeable | **High**   |
| Author verified against the lookup result      | A comparison step naming the PR author against the returned contributor list          | **High**   |
| CI status checked before mergeable verdict     | A `gh pr checks` call before each mergeable verdict                                   | **Medium** |
| Spec PRs received a spec-skill review          | Spec review evaluation for any PR with `spec(...)` title prefix                       | **Medium** |

A merge that proceeded without a visible contributor lookup or verification is a
**high-severity finding** and requires a fix PR or spec, never silent
acceptance.

## release-engineer / release-readiness traces

| Invariant                                   | Evidence to find                                            | Severity   |
| ------------------------------------------- | ----------------------------------------------------------- | ---------- |
| `bun run check` and `bun run test` ran      | Tool calls invoking these commands before any push          | **Medium** |
| `--force-with-lease` used (never `--force`) | Push commands inspected for the lease flag on rebase pushes | **Medium** |

## release-engineer / release-review traces

| Invariant                                  | Evidence to find                                                  | Severity   |
| ------------------------------------------ | ----------------------------------------------------------------- | ---------- |
| Tags pushed individually, not via `--tags` | Each tag push is its own command                                  | **Medium** |
| Releases performed in dependency order     | Comparison of release order against `package.json` `dependencies` | **Low**    |

## security-engineer / security-update traces

| Invariant                                   | Evidence to find                  | Severity |
| ------------------------------------------- | --------------------------------- | -------- |
| SHA pins never downgraded to tag references | Diff inspection on workflow files | **High** |

## staff-engineer / plan-specs traces

| Invariant                                   | Evidence to find                                             | Severity   |
| ------------------------------------------- | ------------------------------------------------------------ | ---------- |
| Approved spec read before plan written      | A `Read` call on `specs/<NNN>/spec.md` before any plan edits | **Medium** |
| Risks section present in produced plan      | The plan file (`plan-a.md` or variant) content includes a risks section | **Low**    |

## staff-engineer / implement-plans traces

| Invariant                                           | Evidence to find                                                       | Severity   |
| --------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| Both `spec.md` and plan read before first edit | `Read` calls on `spec.md` and `plan-a.md` (or selected variant) before any `Edit`/`Write` | **High**   |
| Status advanced to `active` before implementation   | `specs/STATUS` edit setting the spec to `active` before the first edit | **Medium** |
| `bun run check` and `bun run test` ran before push  | Tool calls invoking these commands before any push                     | **Medium** |
| Status advanced to `done` after final push          | `specs/STATUS` edit setting the spec to `done` after the push          | **Medium** |
| Scope discipline held                               | No edits to files outside the plan's stated blast radius               | **Medium** |
