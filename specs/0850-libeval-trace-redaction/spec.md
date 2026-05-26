# Spec 0850 — libeval Trace Artifact Secret Redaction

## Problem

`libraries/libeval`'s trace pipeline serialises every tool input, tool output,
and assistant text block verbatim into the NDJSON artifact uploaded by
`actions/upload-artifact`. There is no redaction layer (`rg
'redact|sanitize|mask|filter.*secret'` in `libraries/libeval/src/` returns only
display-time JSON-punctuation sanitisation in `src/render/tool-hints.js` —
none of it secret-aware).

When that pipeline runs under `.github/workflows/agent-react.yml`, the trace is
the unique single point at which secrets cross from CI into a downloadable
artifact. The workflow:

| Property | Value | Source |
|---|---|---|
| Triggers on external-user actions (anonymous-author surface) | `issues: opened`, `issue_comment: created`, `discussion: created`, `discussion_comment: created`, `pull_request_review: submitted`, `pull_request_review_comment: created`, plus `pull_request_target: labeled` (label-prefix-gated only) | `agent-react.yml:3-17` |
| Actor gating | None — only event-type and label-prefix filters | `agent-react.yml:55-56` |
| Secrets exported into the agent step's environment | `ANTHROPIC_API_KEY` and the `kata-agent-team[bot]` GitHub App installation token (as `GH_TOKEN`) | `agent-react.yml:180-181` |
| Agent permission mode | `bypassPermissions` with `allowDangerouslySkipPermissions: true` (not overridable) | `libraries/libeval/src/agent-runner.js:14, 84-85` |
| Default agent tools (workflow-effective superset) | `Bash, Read, Glob, Grep, Write, Edit, Agent, TodoWrite` — no per-command Bash gating. The runner's lower-floor default (`agent-runner.js:9`) is the 6-tool subset; the action passes the full 8-tool list which overrides it. | `.github/actions/kata-action-eval/action.yml:38` |
| Trace artifact upload | `actions/upload-artifact@v4` for every run, including failures (`if: always()`) | `kata-action-eval/action.yml:228-233` |
| Repo visibility | Public — workflow artifacts on a public repo are downloadable through the retention window | `CLAUDE.md` § Distribution Model |

The system therefore relies on **a single layer of defence** — the agent's
prompt-injection resistance — to prevent secrets from being written into the
trace. A successful injection in any external-trigger surface that convinces
the agent to read the process environment via shell puts the secret into the
`tool_result` block that `TraceCollector.handleUser` serialises
(`trace-collector.js:194-205`), which `agent-runner.js#recordLine`
(`agent-runner.js:205-209`) and `commands/run.js#onLine`
(`commands/run.js:77`) write line-by-line to the file fed to
`actions/upload-artifact`.

This is a **defence-in-depth gap on a public, externally-triggerable surface**.
Pre-auth (any GitHub account can open an issue or comment), reliable (every
external trigger spawns a run with the same env), and high-impact (compromise
of `ANTHROPIC_API_KEY` is direct financial; compromise of the bot installation
token is repo-write across the monorepo).

The carry-forward observation that surfaced this came from the 2026-05-09
`credential-leak-prevention` audit pass and is recorded in
`wiki/security-engineer.md` § Cross-Team Follow-Up. The 2026-05-09
`app-security-libraries` revisit (this audit) confirmed every premise above
against current code at HEAD.

---

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Platform Builders | Evaluate and Improve Agents — Big Hire is to prove whether agent changes improved outcomes with reproducible evidence; the JTBD is hired on Gear, of which `libeval` / `fit-eval` is the trace surface ([JTBD.md](../../JTBD.md) § Platform Builders: Evaluate and Improve Agents) | An eval harness whose published trace artifacts can carry CI secrets is unsafe to run in any environment that mixes external triggers with privileged credentials; consumers cannot adopt `fit-eval` for production-grade evaluations until the trace surface is closed against secret leakage. |

---

## Scope

### In scope

| Component | What changes |
|---|---|
| `libraries/libeval` trace pipeline | A redaction step is interposed between trace event capture and artifact emission, so every string-shaped field of every tool input, tool output (`tool_result.content`), assistant text block, orchestrator-summary text, and any other turn-level string the collector emits passes through redaction before reaching the writable stream consumed by `actions/upload-artifact`. |
| Redaction sources | Two complementary kinds, both required: (a) the runtime values of a configurable allowlist of environment-variable names with a documented default set (the secrets actually exported by repository workflows today: `ANTHROPIC_API_KEY`, `GH_TOKEN`, `GITHUB_TOKEN`); (b) well-known credential-shape patterns (Anthropic API key prefix, GitHub PAT and installation-token prefixes). The selection mechanism for (a) — explicit list vs glob vs `process.env` enumeration — is a design decision, not a spec decision. |
| Redaction placeholder | A fixed string with two stable forms — one for value-based hits, one for pattern-based hits — that no real secret of the covered shapes can produce. The exact placeholder strings are fixed in the design and treated as a stable contract going forward. |
| Documentation | The trace-pipeline README and the `kata-action-eval` action README state that redaction is on by default, list the env-var allowlist and patterns covered, and document the opt-out switch and its safe-use criteria. The opt-out's surface (env var name, CLI flag, both) is a design decision. |
| Tests | The verifiable behaviours under § Success Criteria are exercised against the redactor in isolation and against the producer-side trace pipeline as a whole; the test-layering choice (unit vs integration vs end-to-end fixture) is a plan decision. |

### Out of scope, deferred

- **`agent-react.yml` Bash hardening to prevent the agent from reading process
  environment variables.** This is a secondary, complementary defence: the
  redaction layer above is sufficient on its own to close the leak path even
  if the agent does read the env. Hardening the agent's Bash surface is worth
  doing but is separable from the redaction work — track as its own follow-up
  spec so the two changes can land on independent merge schedules.
- **GitHub-side artifact ACL changes.** The fix is producer-side. Whether
  workflow artifacts on public repos should be access-restricted by GitHub is
  not something this spec touches.
- **Removing `bypassPermissions` from `agent-runner.js`.** Load-bearing for
  headless CI per the comment at `agent-runner.js:11-14`. The redaction layer
  makes the existing permission posture safe; revisiting the posture is a
  separate spec if pursued.
- **Actor gating on `agent-react.yml`.** Restricting external triggers to
  trusted accounts reduces the workflow's intended function (it is designed to
  react to external users). This spec assumes the channel stays open.
- **Redaction of secrets that arrive in the agent's prompt itself** (e.g. a
  user pasting an API key into an issue comment). User-provided strings are
  not privileged data the libeval consumer is custodian of; out of scope.
- **Retroactive scrubbing of historical trace artifacts** already uploaded.
  Retention timeout (default 90 days) ages them out; manual deletion via
  `gh api -X DELETE` is the operational mitigation if a leak is suspected.
- **Other libraries' shell-exec usage.** Verified safe in this audit pass —
  `libwiki`, `libpack`, `libutil` all use `spawn`/`spawnSync` with argv
  arrays; no shell interpolation. No finding.

---

## Success Criteria

| Claim | Verification |
|---|---|
| With each environment variable in the configured allowlist set to a unique sentinel value at run time, no NDJSON line emitted by the trace pipeline contains any of those sentinel values, regardless of which carrier in `trace-collector.js` they appear in (`tool_use.input.*` strings, `tool_result.content`, assistant `text`, orchestrator `summary`, system payloads). | Test seeds each carrier with each sentinel value, runs the pipeline end-to-end up to the writable stream, and asserts every emitted line passes a substring check against every sentinel. |
| The pattern-based source redacts well-known credential-shape strings even when no allowlisted env var is set. | Test inputs include the Anthropic API key prefix shape and the GitHub PAT / installation-token prefix shapes at full canonical length; each yields the pattern-hit placeholder at the position the secret occupied. |
| Benign content is unchanged. | Test inputs include human prose, Markdown, URLs, git SHAs, UUIDs, and quoted shell commands — all round-trip identical with no false-positive redaction. |
| Redaction is on by default; an opt-out exists and is documented. | With no opt-out signal, redaction is enabled; with the documented opt-out signal, redaction is disabled and an opt-out warning is surfaced on each run. The opt-out surface and the warning channel are named in the design. |
| Trace replay through `toText()` (offline `fit-eval output --format=text`) preserves the placeholder strings byte-for-byte. | Test renders a captured trace containing both placeholder forms; both appear in the rendered output identically to their NDJSON form. |

— Security Engineer 🔒
