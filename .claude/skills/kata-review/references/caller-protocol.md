# Sub-Agent Review Protocol

Shared protocol for callers of `kata-review`. Used by:

- `kata-spec` Step 5, `kata-design` Step 5, `kata-plan` Step 5 — panel of 3
- `kata-implement` Step 7 — panel of 5

## Panel Composition

Each panel has a role (`subagent_type`) and a size. Callers launch all panels
for a given artifact in a single message so they run in parallel.

| Caller           | Artifact                    | Panel     | `subagent_type`   | Reviewers |
| ---------------- | --------------------------- | --------- | ----------------- | --------- |
| `kata-spec`      | `spec.md`                   | product   | `product-manager` | 3         |
| `kata-spec`      | `spec.md`                   | technical | engineering agent  | 3         |
| `kata-design`    | `design-a.md`               | technical | engineering agent  | 3         |
| `kata-plan`      | `plan-a.md` (+ parts)       | technical | engineering agent  | 3         |
| `kata-implement` | diff (`origin/main...HEAD`) | technical | engineering agent  | 5         |

Rationale for panels, sizes, and the spec-only product panel:
[panel-rationale.md](panel-rationale.md).

## How to Invoke

1. **Launch all panels in a single message** via one `Agent` tool call per
   reviewer. All reviewers across all panels launch in parallel, so the caller
   cannot cross-feed one reviewer's output into another's prompt. Each
   sub-agent:
   - Starts cold with no prior conversation context.
   - Uses the `subagent_type` from the panel composition table.
   - Loads the [`kata-review`](../SKILL.md) skill.
   - Receives the **identical** prompt within its panel: artifact type, artifact
     path, spec path (for design/plan/diff), design path (for plan/diff), plan
     path (for diff), and branch name (for diff).
   - Is told not to invoke the parent skill (e.g., "do not invoke `kata-spec`")
     — defense in depth on top of the structural recursion fix.

2. **Do not share a scratchpad or cross-feed reviewer output.** Correlated
   errors collapse the ensemble back to one reviewer's signal.

3. **Collect all N findings reports** before merging. A missing report is not a
   pass — re-spawn that reviewer.

## How to Merge Findings

Merge findings **within each panel independently**. When an artifact has
multiple panels (e.g., technical + product for specs), run the steps below once
per panel, then combine the results. Findings from different panels are not
cross-voted — each panel's consensus threshold applies to its own reviewers.

Findings arrive under `### Blocker` / `### High` / `### Medium` / `### Low`,
each row shaped `<file:line> — <criterion> — <one-sentence reason>` (or a commit
hash in place of `file:line` for diffs).

1. **Group semantically.** Merge findings citing the same `file:line` (or nearby
   lines in the same hunk) that raise the same concern, even if worded
   differently. When in doubt, merge.
2. **Record vote count and each flagging reviewer's severity.**
3. **Pick severity by mode; tie-break high.** Vote count reflects reach;
   severity reflects seriousness.
4. **Partition by vote count:**
   - **Consensus (≥⌈N/2⌉):** verify and address all confirmed blocker/high/
     medium findings in the same turn.
   - **Minority (>1, <⌈N/2⌉):** empty for N=3. For N=5, verify with extra care.
   - **Singleton (1):** verify each; address or record dismissal rationale.
5. **Scope-creep guard.** Dismiss findings raising concerns outside the
   artifact's declared scope (spec scope for design/plan, plan scope for diffs;
   user intent for specs). Exception: consensus "scope-creep in the diff"
   findings stand.

## How to Handle Findings

- **Verify** every unique finding against the actual artifact before acting on
  it. The caller is accountable, not the panel.
- **Proceed without pausing.** Address every confirmed consensus
  **blocker**/**high**/**medium** finding in the same turn — do not stop for
  user permission. Re-run the panel if the fix is substantial, then advance.
- **Low** findings are optional. Document if dismissed.
- **False positives.** Record a one-line rationale in the commit message or
  artifact and continue — silent dismissal is not allowed.
- **Disagreement with a consensus blocker.** Revise the artifact to address the
  underlying concern, or record a rationale — in the same turn, without
  stopping.
- **Same-run revision is an exclusive route.** A Disposition comment
  pre-announcing a same-run revision reserves it for the announcing run, and
  must embed a run-unique token: `$GITHUB_RUN_ID` (or the workflow run URL)
  in CI sessions, a session-generated nonce otherwise. You are the announcing
  run iff the announcement's token equals your own run's token; on mismatch
  **or missing token**, the route is taken — do not author a duplicate. The
  pin comment naming the revision head echoes the token, so the thread itself
  records announcer = pinner. Any other route checks the thread tail before
  authoring: pin present, verify against the pinned head.
