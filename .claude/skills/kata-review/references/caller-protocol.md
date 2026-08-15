# Sub-Agent Review Protocol

Callers of `kata-review` share this protocol.

## Panel Composition

Each panel has a role (`subagent_type`) and a size. Panel sizes come from the
`reviewPanel` profile selected in [settings.md](settings.md) (read mechanic:
shared kata-settings reference). The consensus threshold stays ≥⌈N/2⌉ for any
panel size.

| Caller           | Artifact                    | Panel     | `subagent_type`   |
| ---------------- | --------------------------- | --------- | ----------------- |
| `kata-spec`      | `spec.md`                   | product   | `product-manager` |
| `kata-spec`      | `spec.md`                   | technical | engineering agent  |
| `kata-design`    | `design-a.md`               | technical | engineering agent  |
| `kata-design`    | `design-a.md`               | devex     | `devex-engineer`  |
| `kata-plan`      | `plan-a.md` (+ parts)       | technical | engineering agent  |
| `kata-plan`      | `plan-a.md` (+ parts)       | devex     | `devex-engineer`  |
| `kata-implement` | diff (`origin/main...HEAD`) | technical | engineering agent  |
| `kata-implement` | diff (`origin/main...HEAD`) | devex     | `devex-engineer`  |

Rationale for panels, sizes, and scope:
[panel-rationale.md](panel-rationale.md).

## How to Invoke

1. **Launch all panels in a single message** with one `Agent` tool call per
   reviewer. All reviewers across all panels launch in parallel, so the caller
   cannot cross-feed one reviewer's output into another's prompt. Each
   sub-agent:
   - Starts cold with no prior conversation context.
   - Uses the `subagent_type` from the panel composition table.
   - Loads the [`kata-review`](../SKILL.md) skill.
   - Receives the **identical** prompt within its panel: artifact type, artifact
     path, spec path (for design/plan/diff), design path (for plan/diff), plan
     path (for diff), and branch name (for diff).
   - Is told not to invoke the parent skill (e.g., "do not invoke `kata-spec`").
     This adds defense in depth to the recursion fix.

2. **Do not share a scratchpad or cross-feed reviewer output.** Correlated
   errors collapse the ensemble back to one reviewer's signal.

3. **Collect all N findings reports** before you merge. An absent report never
   passes. Re-spawn that reviewer.

## How to Merge Findings

Merge findings **within each panel independently**. When an artifact has
multiple panels (e.g., technical + product for specs), run the steps below once
per panel, then combine the results. Never cross-vote across panels. Each
panel's consensus threshold applies to its own reviewers.

Findings arrive under `### Blocker` / `### High` / `### Medium` / `### Low`.
Each row has the shape `<file:line> — <criterion> — <one-sentence reason>`. For
diffs, a commit hash replaces `file:line`.

1. **Group semantically.** Merge findings that cite the same `file:line` (or
   nearby lines in the same hunk) and raise the same concern. Wording may
   differ. When in doubt, merge.
2. **Record the vote count and the severity each reviewer assigned.**
3. **Pick severity by mode. Tie-break high.** Vote count reflects reach.
   Severity reflects seriousness.
4. **Partition by vote count:**
   - **Consensus (≥⌈N/2⌉):** verify and address all confirmed findings at or
     above the configured blocking severity floor (`reviewBlockingSeverity`)
     in the same turn.
   - **Minority (>1, <⌈N/2⌉):** verify with extra care.
   - **Singleton (1):** verify each. Address or record a dismissal rationale.
5. **Scope-creep guard.** Dismiss findings that raise concerns outside the
   artifact's declared scope (spec scope for design/plan, plan scope for diffs;
   user intent for specs). Exception: consensus "scope-creep in the diff"
   findings stand.

## How to Handle Findings

- **Verify** every unique finding against the actual artifact before you act.
  The caller is accountable. The panel is not.
- **Proceed. Do not pause.** Address every confirmed consensus finding at or
  above the configured floor in the same turn. Do not stop for user
  permission. Re-run the panel if the fix is substantial. Then advance.
- Findings below the floor are optional. Document it if you dismiss one.
- **False positives.** Record a one-line rationale in the commit message or
  artifact, then continue. Never dismiss one silently.
- **Disagreement with a consensus blocker.** Revise the artifact to address the
  concern behind it, or record a rationale. Do it in the same turn. Do not
  stop.
- **Same-run revision is an exclusive route.** A Disposition comment that
  pre-announces a same-run revision reserves it for the announcer. That comment
  must embed a run-unique token: `$GITHUB_RUN_ID` (or the workflow run URL) in
  CI sessions, a session-generated nonce otherwise. You are the announcer iff
  the announcement's token equals your run's token. On a mismatch **or an
  absent token**, the route is already taken. Do not author a duplicate. The
  pin comment that names the revision head echoes the token, so the thread
  itself records announcer = pinner. Any other route checks the thread tail
  before it authors: pin present, verify against the pinned head.
