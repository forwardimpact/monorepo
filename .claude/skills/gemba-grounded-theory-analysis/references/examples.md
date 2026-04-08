# Grounded Theory Analysis Examples

Worked examples from real agent trace analysis.

## Open Coding Example

Codes assigned sequentially, using in-vivo language from the trace:

```
turn-03: "logged in to github.com"   — gh auth status succeeded
turn-07: "11 commits behind"         — PR detected as stale
turn-12: rebase-completed            — git rebase origin/main succeeded
turn-13: "403 forbidden"             — git push returned permission denied
turn-14: setup-git-retry             — agent ran gh auth setup-git
turn-15: "two credentials supplied"  — push failed with duplicate auth header
turn-16: identical-retry             — same push command, same error
turn-17: commented-manual-steps      — agent commented on PR with manual instructions
```

## Memo Example

> **Memo (turn 15):** The agent received a clear error message ("two credentials
> supplied") but did not investigate _which_ two credentials were in play. It
> retried the same operation instead. This suggests the agent's error-handling
> repertoire is limited to retry — it lacks a "diagnose credential conflict"
> skill. Compare to turn 12 where it successfully recovered from a different
> error by changing approach. What distinguishes recoverable from
> non-recoverable errors in the agent's behaviour?

## Axial Coding Example

A category filled in with the paradigm model:

```
Category: CREDENTIAL_CONFLICT_LOOP

Causal conditions:
  - Checkout token (GITHUB_TOKEN) configured git credentials at clone time
  - GH_TOKEN (App installation token) set separately for API calls
  - Agent invoked `gh auth setup-git`, adding a second credential

Phenomenon:
  - Git push fails because two credential helpers supply conflicting tokens

Context:
  - Happens only when pushing to the main repo (not worktrees)
  - Worktree pushes use a fresh clone with a single credential

Actions/Interactions:
  - Agent retried the push 3 times with the same configuration (turn 14–16)
  - Agent did not inspect git credential config
  - Agent fell back to commenting on the PR (turn 17)

Consequences:
  - 3 wasted turns (≈4,200 tokens)
  - PR left un-pushed; manual intervention required
  - Agent's fallback preserved the PR from being abandoned entirely
```

## Selective Coding Example

Core category derived from the categories above:

```
Core category: INADEQUATE ERROR DIAGNOSIS

Propositions:
1. When the agent encounters an error it has not seen before, it defaults to
   retrying the same operation rather than investigating the error's cause.
2. The agent's recovery success rate correlates with whether the error message
   maps to a known pattern in its skill documentation.
3. Adding diagnostic steps to skill error-handling sections would reduce wasted
   retry turns by an estimated 40-60% for credential-related failures.
```

Each proposition must be:

- **Grounded** — traceable to specific codes, categories, and turn numbers
- **Testable** — future traces can confirm or refute it
- **Actionable** — implies a concrete change to skills, workflows, or
  infrastructure
