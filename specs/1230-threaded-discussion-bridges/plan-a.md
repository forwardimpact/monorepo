# Plan 1230-a — Threaded discussion bridges

## Approach

Land the shared `libraries/libbridge` package first so the GitHub and Teams
adapters can converge on the same intake skeleton, callback registry, rate
limiter, history bound, durable state, and resume-trigger contract. Land
the libeval `discuss` mode and consolidated `--lead-profile` / `--lead-model`
CLI next so the workflow has a target to call into. Then rename
`agent-react.yml` → `kata-dispatch.yml` and strip its Discussion prompt
blob, bypassing the `forwardimpact/fit-eval@v1` composite action and
invoking `node libraries/libeval/bin/fit-eval.js discuss` directly so no
sibling-repo retag is required. Refactor `services/msteams` →
`services/msbridge` onto `libbridge` (preserving the Bot Framework
contract), and add `services/ghbridge` as a sibling that verifies Kata App
webhook signatures and posts replies through `addDiscussionComment`. A
final documentation part covers the coordination-protocol edit, READMEs,
JTBD entries, and the Kata App webhook-subscription change.

Each part declares its own `Libraries used:` line; the overview line is
intentionally omitted to avoid drift.

## Parts

| # | Title | File | Depends on |
|---|---|---|---|
| 01 | `libraries/libbridge` package and DiscussionContext store | [plan-a-01.md](plan-a-01.md) | — |
| 02 | libeval `discuss` mode + lead-flag consolidation + `fit-trace by-discussion` | [plan-a-02.md](plan-a-02.md) | 01 (DiscussionContext type, ResumeTrigger type) |
| 03 | Workflow renames + channel-agnostic dispatch | [plan-a-03.md](plan-a-03.md) | 02 (`discuss` mode + `--lead-*` flags + `--discussion-id` callback flag must exist before the workflow YAML references them) |
| 04 | `services/msbridge` (rename + refactor onto libbridge) | [plan-a-04.md](plan-a-04.md) | 01; touches `kata-dispatch.yml` filename string — can land in parallel with 03 because the filename is a string literal until the workflow file is created |
| 05 | `services/ghbridge` (new GitHub Discussions adapter) | [plan-a-05.md](plan-a-05.md) | 01; same parallelism note as Part 04 |
| 06 | Documentation, protocol edit, Kata App webhook subscription | [plan-a-06.md](plan-a-06.md) | 02–05 (renames + new surfaces) |

## Execution

Sequence: **01 → 02 → (03 ‖ 04 ‖ 05) → 06**.

- Part 01 is the foundation — every later part imports `libbridge`. Land
  first; do not parallelise.
- Part 02 lands the CLI surface (`fit-eval discuss`, `--lead-profile`,
  `--lead-model`, `--discussion-id`, `--resume-context`) and the trace
  query (`fit-trace by-discussion`). Part 03's workflow YAML invokes
  these directly via `node libraries/libeval/bin/fit-eval.js`, so they
  must exist on `main` before Part 03 merges.
- Parts 03, 04, 05 are independent once 02 is on `main`. Recommend three
  parallel `kata-implement` sessions on `feat/1230-threaded-discussion-bridges-{03,04,05}` branches. Each branch claims a per-part target (`spec-1230-part-03`, `-04`, `-05`) via `fit-wiki claim` before opening a branch to avoid the intra-agent self-collision pattern in MEMORY.
- Part 06 is documentation only — runs after the engineering parts
  settle. Route to `technical-writer`. The wiki-memo updates referenced
  in earlier drafts have been removed — agents own their own memos via
  their own sessions (per memory-protocol).

All engineering parts: `staff-engineer` via `kata-implement`. Documentation
part (06): `technical-writer`.

## Risks

| Risk | Mitigation |
|---|---|
| `forwardimpact/fit-eval@v1` composite action's `inputs:` does not expose `discuss` mode or the new `--lead-*` / `--discussion-id` / `--resume-context` flags. A naive workflow edit that adds these via `with:` would silently no-op. | Part 03 bypasses the composite action and invokes `node libraries/libeval/bin/fit-eval.js discuss ...` directly from the workflow (same pattern the existing callback step already uses). No sibling-repo retag required. |
| `agent-react.yml` rename ripples through ~50 references across `KATA.md`, `.claude/agents/**`, `.claude/skills/**`, `services/msteams/**`, downstream sibling repos, and wiki logs. Missing one strands the reference. | Part 03 Step 3.6 runs `rg 'agent-(react\|team)\.yml'` and `rg 'agent-react workflow\|agent-team workflow'` and requires both to return empty before the PR is approved. The implementer fixes every match in the same PR. |
| Kata GitHub App webhook subscription change is an out-of-tree manual step (App settings UI). Until applied, ghbridge serves nothing and the renamed workflow no longer accepts `discussion` events — Discussion traffic vanishes. | Part 06 includes a setup-checklist PR comment for the release-engineer. Until then, ghbridge runs read-only via a tunnel (see ghbridge README); the documentation part captures the exact App-settings edit so the operator can apply it without re-deriving it. |
| libeval `discuss` mode's suspend/resume contract depends on the bridge re-dispatching with `resume_context`. A bridge bug that drops a trigger silently strands the RFC. | Part 05 includes an integration test (post → recess → simulated trigger fire → resume → adjourn) running against a `createMockStorage`-backed libbridge harness. Elapsed timers re-arm on bridge restart from `open_rfcs.opened_at`; if `setTimeout`'s 24.8-day cap is exceeded for a 14-day window (it isn't, but adjacent durations could be), the bridge chunks the delay into ≤7-day segments. |
| The Bot Framework `ConversationReference` is a structured object (bot, channelId, conversation, serviceUrl, user, activityId). Flattening it into a single string would break `continueConversationAsync` on resume. | Part 04 Step 4.3 stores the full object as JSON in `DiscussionContext.participants[?].metadata` and round-trips it through `JSON.stringify` / `JSON.parse`. Tests assert byte-equality on resume. |
| GitHub Discussion reactions are GraphQL-only (`addReaction` mutation). A REST-shaped reaction call would 404 in production but pass dev fixtures. | Part 05 Step 5.5 specifies the GraphQL mutation explicitly; the implementer must not invent a REST endpoint. |
| Two staff-engineer instances pick up Parts 03/04/05 simultaneously (parallel-domain-assess pattern from MEMORY). | Each part requires a per-target `fit-wiki claim` before branching; the kata-implement skill enforces this. The execution narrative above repeats the claim names. |
