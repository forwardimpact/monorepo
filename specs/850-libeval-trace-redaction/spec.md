# Spec 850 — libeval Trace Artifact Secret Redaction

## Problem

`libraries/libeval`'s trace pipeline serialises every tool input, tool output,
and assistant text block verbatim into the NDJSON artifact uploaded by
`actions/upload-artifact`. There is no redaction layer (`rg
'redact|sanitize|mask|filter.*secret'` returns only display-time JSON-punctuation
sanitisation in `src/render/tool-hints.js` — none of it secret-aware).

When that pipeline runs under `.github/workflows/agent-react.yml`, the trace is
the unique single point at which secrets cross from CI into a downloadable
artifact. The workflow:

| Property | Value | Source |
|---|---|---|
| Triggers on external-user actions | `issues: opened`, `issue_comment: created`, `discussion: created`, `discussion_comment: created` | `agent-react.yml:3-17` |
| Actor gating | None — only event-type and label-prefix filters | `agent-react.yml:55-56` |
| Secrets exported into the agent step's environment | `ANTHROPIC_API_KEY`; the `kata-agent-team[bot]` GitHub App installation token (as `GH_TOKEN`) | `agent-react.yml:177-184` |
| Agent permission mode | `bypassPermissions` with `allowDangerouslySkipPermissions: true` (not overridable) | `libraries/libeval/src/agent-runner.js:14, 84-85` |
| Default agent tools | `Bash, Read, Glob, Grep, Write, Edit, Agent, TodoWrite` — no Bash deny-list for env-reading commands | `.github/actions/kata-action-eval/action.yml:38`, `agent-runner.js:9` |
| Trace artifact upload | `actions/upload-artifact@v4` for every run, including failures (`if: always()`) | `kata-action-eval/action.yml:228-233` |
| Repo visibility | Public — workflow artifacts are downloadable by any authenticated GitHub user via `gh run download` for the retention window | `CLAUDE.md` § Distribution Model |

The system therefore relies on **a single layer of defence** — the agent's
prompt-injection resistance — to prevent secrets from being written into the
trace. A successful injection in any external-trigger surface that convinces
the agent to run `printenv ANTHROPIC_API_KEY`, `cat /proc/self/environ`,
`env | grep -i token`, or any equivalent puts the secret into the
`tool_result` block that `TraceCollector.handleUser` serialises (`json.stringify`
when content is non-string, otherwise verbatim — `trace-collector.js:194-205`),
which `commands/output.js` writes line-by-line to the uploaded NDJSON.

This is a **defence-in-depth gap on a public, externally-triggerable surface**.
Severity HIGH on the conventional risk model — pre-auth (any GitHub account can
open an issue or comment), reliable (every external trigger spawns a run with
the same env), and high-impact (compromise of `ANTHROPIC_API_KEY` is direct
financial; compromise of the bot installation token is repo-write across the
monorepo).

The carry-forward observation that surfaced this was 2026-05-09 morning's
`credential-leak-prevention` audit pass. It is recorded in
`wiki/security-engineer.md` § Cross-Team Follow-Up. The 2026-05-09 evening
`app-security-libraries` revisit (this audit) confirmed every premise above
against current code.

---

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Platform Builders | Evaluate and Improve Agents — "generate test data and chart agent metrics to distinguish signal from noise" ([JTBD.md:258](../../JTBD.md)) | An eval harness whose published trace artifacts can carry CI secrets is unsafe to run in any environment that mixes external triggers with privileged credentials — the very setting Forward Impact's own monorepo demonstrates. |
| Internal Contributors (Kata team) | Run an autonomous agent team that ships features without leaking secrets when external users prompt-inject the agent surface | The repo's own `agent-react.yml` is the worked example of this surface; without redaction the team carries a single-layer control on a public attack surface. |

---

## Scope

### In scope

| Component | What changes |
|---|---|
| `libraries/libeval` trace pipeline | A redaction layer is interposed between event accumulation and artifact emission. The layer scrubs every string-shaped field of every tool input, tool output (`tool_result.content`), assistant text block, and orchestrator-summary text, replacing matches with a fixed placeholder. The layer is on by default; an explicit env-or-flag opt-out exists for offline replay where redaction is unwanted. |
| Redaction sources | Two complementary sources, both required: (a) **value-based** — redact any substring that exactly matches the runtime value of a configured set of environment variables (default: `ANTHROPIC_API_KEY`, `GH_TOKEN`, `GITHUB_TOKEN`, `KATA_APP_PRIVATE_KEY`, `HOMEBREW_TAP_PAT`, plus the `*_API_KEY` / `*_TOKEN` glob over `process.env`); (b) **pattern-based** — redact substrings matching well-known secret patterns (Anthropic API key prefix, GitHub PAT/installation-token prefixes, generic high-entropy strings of the lengths the above use). |
| Redaction placeholder | A single fixed string distinguishable from any real secret; same placeholder used for value-based and pattern-based hits, with a suffix indicating which source matched (for forensic value without leaking the underlying value). |
| `agent-react.yml` Bash deny-list | The workflow constrains the agent's allowed Bash subset to exclude env-reading primitives (`printenv`, `env`, `set`, `cat /proc/*/environ`, `ps eww`, equivalent forms). External-trigger workflows specifically — not the broader `kata-action-eval` defaults. |
| Documentation | The trace-pipeline README and the `kata-action-eval` action README state that redaction is on by default, list the env vars and patterns covered, and document the opt-out switch and its safe-use criteria. |
| Tests | Unit tests cover the redaction layer in isolation (worked-example payloads under § Success Criteria); an integration test verifies an agent-react-shaped trace cannot reach `actions/upload-artifact` with an unredacted secret value present at runtime. |

### Out of scope

- **GitHub-side artifact ACL changes.** The fix is producer-side. Whether
  workflow artifacts on public repos should be access-restricted by GitHub is
  not something this spec touches.
- **Removing `bypassPermissions` from `agent-runner.js`.** That mode is
  load-bearing for headless CI per the comment at `agent-runner.js:11-14`. The
  redaction layer makes the existing permission posture safe; revisiting the
  posture is a separate spec if pursued.
- **Actor gating on `agent-react.yml`.** Restricting external triggers to
  trusted accounts is a defensible additional layer but reduces the workflow's
  intended function (the channel is designed to react to external users). This
  spec assumes the channel stays open.
- **Redaction of secrets that arrive in the agent's prompt itself** (e.g. a
  user pasting an API key into an issue comment). User-provided strings are not
  privileged data the agent is custodian of; out of scope.
- **Retroactive scrubbing of historical trace artifacts** already uploaded.
  Retention timeout (default 90 days) ages them out; manual deletion via
  `gh api -X DELETE` is the operational mitigation if a leak is suspected.
- **Other libraries' shell-exec usage.** Verified safe in this audit pass —
  `libwiki`, `libpack`, `libutil` all use `spawn`/`spawnSync` with argv arrays;
  no shell interpolation. No finding.

---

## Success Criteria

| Claim | Verification |
|---|---|
| With `ANTHROPIC_API_KEY=sk-ant-test-…` in the environment, no NDJSON line emitted by the trace pipeline contains that literal substring, regardless of whether it appeared in a `tool_use.input.command`, a `tool_result.content`, an assistant `text` block, or an orchestrator-summary `summary`. | Integration test: feed a synthetic NDJSON stream where each carrier shape contains the live env value; assert every output line passes `!line.includes(process.env.ANTHROPIC_API_KEY)` and the placeholder appears in its place. |
| The pattern-based layer redacts well-known prefixes even when the value-based source is unset. | Unit test of the redactor: inputs `"sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA"`, `"ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`, `"ghs_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`, `"github_pat_…"` each yield the placeholder, byte-for-byte stable. |
| Benign content survives unchanged. | Unit test: inputs `"hello world"`, `"git commit -m 'chore: bump'"`, `"https://github.com/forwardimpact/monorepo/pull/823"`, a 10 KB Markdown blob — round-trip identical, no false-positive redaction. |
| Redaction is on by default; opt-out is explicit. | Unit test of the runner factory: with no flag, redaction is enabled; with the documented opt-out env var or flag set, redaction is disabled and a warning is emitted on stderr. |
| `agent-react.yml`'s allowed-tools constraint blocks the env-reading Bash primitives. | Integration assertion against the workflow-rendered config: any of the listed primitives (`printenv`, `env`, `set` without a flag, `cat` against `/proc/*/environ`, `ps eww`) is rejected by the SDK at tool-permission check time. |
| Trace replay (offline `fit-eval output --format=text` over a captured trace) renders the placeholder identically to its NDJSON form, so reviewers reading replays do not see ghosted secret-shaped strings. | Unit test: a captured trace with placeholder strings round-trips through `toText()` with no special-case handling; the placeholder string is preserved verbatim. |

— Security Engineer 🔒
