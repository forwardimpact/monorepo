# Plan 1230-a — Part 02: libeval `discuss` mode + lead-flag consolidation + `fit-trace by-discussion`

New libeval orchestration mode `discuss` with suspend/resume semantics
(`RequestForComment`, `Recess`, `Adjourn`). Consolidate the lead role
flags across `supervise`, `facilitate`, and `discuss` to `--lead-profile`
/ `--lead-model`, removing the legacy `--supervisor-*` and
`--facilitator-*` flags entirely (spec § Success criteria row 9 — "none of
the legacy mode-specific flags"). Thread `discussion_id` through the
trace so `fit-trace by-discussion <id>` can join multi-run conversations.

Libraries used: `@forwardimpact/libeval` (extends in place), `@anthropic-ai/claude-agent-sdk`, `zod` (existing — tool schemas), `@forwardimpact/libbridge` (Part 01 — `ResumeTrigger` type), `@forwardimpact/libharness` (devDep — `createMockStorage`).

## Step 2.1 — Add `discuss` command skeleton

Created:
- `libraries/libeval/src/commands/discuss.js` — exports `runDiscussCommand(values, _args)` and `parseDiscussOptions(values)`. Mirrors `facilitate.js` (lead + N agents) but constructs a `Discusser` from Step 2.3.

Modified:
- `libraries/libeval/bin/fit-eval.js` — add a fourth command block matching the `facilitate` shape with these options:
  - `task-file`, `task-text`, `task-amend` (same as facilitate)
  - `lead-profile`, `lead-model` (see Step 2.2)
  - `agent-profiles`, `agent-cwd`, `agent-model` (same as facilitate)
  - `resume-context` (JSON string passed by `kata-dispatch.yml`)
  - `discussion-id` (flows into trace metadata)
  - `output`, `max-turns`
- Same file — add `"fit-eval discuss --task-file=task.md --lead-profile=release-engineer --agent-profiles=staff-engineer,security-engineer --discussion-id=GD_kw...]"` to the examples block.
- Same file — `case "discuss": return runDiscussCommand(values, args);` in the dispatch switch.

Verify: `node libraries/libeval/bin/fit-eval.js --help` lists `discuss` (matches spec § Success criteria row 7); `fit-eval discuss --help` shows the consolidated flags.

## Step 2.2 — Consolidate `--lead-profile` / `--lead-model`; remove legacy flags

Modified: `libraries/libeval/bin/fit-eval.js`.

In each of the `supervise`, `facilitate`, `discuss` command blocks:
- Add the two new options:
  ```js
  "lead-profile": {
    type: "string",
    description: "Lead role profile name (supervisor / facilitator / chair)",
  },
  "lead-model": {
    type: "string",
    description: "Claude model for the lead role (default: claude-opus-4-7[1m])",
  },
  ```
- **Delete** `supervisor-profile`, `supervisor-model`, `facilitator-profile`, `facilitator-model` from the option declarations. Spec § Success criteria row 9 verifies the help text shows "none of the legacy mode-specific flags".

Modified: `libraries/libeval/src/commands/supervise.js` `parseSuperviseOptions`:
- `supervisorProfile: values["lead-profile"] ?? undefined`
- `supervisorModel: values["lead-model"] ?? "claude-opus-4-7[1m]"`
- Remove all reads of `values["supervisor-profile"]` / `values["supervisor-model"]`.

Modified: `libraries/libeval/src/commands/facilitate.js` `parseFacilitateOptions`:
- `facilitatorProfile: values["lead-profile"] ?? undefined`
- `facilitatorModel: values["lead-model"] ?? "claude-opus-4-7[1m]"`
- Remove all reads of `values["facilitator-profile"]` / `values["facilitator-model"]`.

Modified: `libraries/libeval/src/commands/benchmark-run.js` and `libraries/libeval/bin/fit-benchmark.js` — if either reads `supervisor-*` / `facilitator-*`, rewire to `lead-*`. The implementer greps `libraries/libeval/` for the legacy keys first.

Modified — workflow call sites (the legacy flags are passed via the `forwardimpact/fit-eval@v1` composite action's `with:` block, which forwards them as CLI flags):
- `.github/workflows/agent-react.yml:192` — `facilitator-profile: "release-engineer"` → `lead-profile: "release-engineer"`. (Part 03 also edits this file for the rename; coordinate via PR ordering: Part 02 merges first, Part 03 rebases.)
- `.github/workflows/kata-interview.yml:133` — `supervisor-profile: "product-manager"` → `lead-profile: "product-manager"`.
- `.github/workflows/kata-coaching.yml:34` — `facilitator-profile: "improvement-coach"` → `lead-profile: "improvement-coach"`.
- `.github/workflows/kata-storyboard.yml:33` — `facilitator-profile: "improvement-coach"` → `lead-profile: "improvement-coach"`.

Note: the composite action `forwardimpact/fit-eval@v1`'s own `inputs:` declarations must be updated in the sibling repo (`forwardimpact/fit-eval`) to accept `lead-profile` and `lead-model` and forward them to the CLI. The implementer of this part opens a PR against that sibling repo as part of the same change set, tagged `v1`-mutable per `.github/CLAUDE.md`. If the sibling-action edit is blocked, Step 2.2 falls back to having every consuming workflow invoke `node libraries/libeval/bin/fit-eval.js` directly (the pattern Part 03 uses for the new `discuss` invocation) — adds two lines per workflow.

Modified: documentation referencing the legacy flags — `.claude/skills/fit-eval/SKILL.md` (if it exists), `.claude/skills/kata-setup/references/workflow-*.md`, `libraries/libeval/README.md`. `rg --type md '(supervisor|facilitator)-(profile|model)'` returns empty after this step.

Verify: `fit-eval supervise --help`, `fit-eval facilitate --help`, `fit-eval discuss --help` all show `--lead-profile` and `--lead-model`; none show the legacy flags. `rg --type md '(supervisor|facilitator)-(profile|model)'` returns empty. Add unit tests `libraries/libeval/test/commands/lead-flags.test.js` covering all three modes.

## Step 2.3 — Discusser class with suspend/resume

Created:
- `libraries/libeval/src/discusser.js` — exports `Discusser`, `createDiscusser({ leadProfile, leadModel, agentConfigs, discussionId, resumeContext })`, `DISCUSS_SYSTEM_PROMPT`. The class **composes** (does not extend) the existing `Facilitator` — composition was chosen so the suspend/resume hooks live in `Discusser` and the `Facilitator` stays a pure within-run orchestrator. The constructor:
  1. Builds an `OrchestrationContext` (existing factory) augmented with `{ discussionId, recessed: false, recessTrigger: null, replies: [] }`.
  2. Instantiates a private `Facilitator` for the within-run loop, swaps the lead's tool-server for the new `DiscussTools` server (Step 2.4) — this removes `Conclude` from the lead's tool set and replaces it with `Adjourn` (terminal verdict) and `Recess` (suspend with trigger).
  3. When `resumeContext` is non-null on startup, hydrate `ctx.pendingAsks`, `ctx.participants`, and `ctx.history` from it before resuming the loop. `pendingAsks` round-trips through `JSON.stringify` / `JSON.parse` via `Object.fromEntries(map)` / `new Map(Object.entries(obj))`. The first turn reads the new inputs that arrived between runs (delivered as a tool-result on the lead's resume turn).
  4. Within-run termination conditions: `Adjourn` (verdict `adjourned`) or `Recess` (verdict `recessed`). After `Recess` the loop terminates, the `replies[]` accumulated by `RequestForComment` flushes to the trace via `TraceCollector`, and the loop persists `ctx.pendingAsks` for the next run.

`DISCUSS_SYSTEM_PROMPT` reuses `FACILITATED_AGENT_SYSTEM_PROMPT` for participants and a new lead prompt that explicitly forbids `Conclude` and directs the lead toward `Adjourn` / `Recess` instead.

Modified: `libraries/libeval/src/index.js` — add `export { Discusser, createDiscusser, DISCUSS_SYSTEM_PROMPT } from "./discusser.js"`.

Verify: `bun test libraries/libeval/test/discusser.test.js` covers: (a) clean adjourn path; (b) recess + resume with prior pending ask; (c) `RequestForComment` emits a `replies[]` entry on the callback payload; (d) `pendingAsks` `Map<string, …>` round-trip is byte-identical post-serialisation.

## Step 2.4 — DiscussTools tool-server

Created: `libraries/libeval/src/discuss-tools.js` — exports `createDiscussLeadToolServer(ctx)` and `createDiscussAgentToolServer(ctx, opts)`. Lead tool set:

| Tool | Behaviour |
|---|---|
| `RollCall` | Existing handler. |
| `Ask` | Existing handler. |
| `Answer` | Existing handler. |
| `Announce` | Existing handler. |
| `Redirect` | Existing handler. |
| `RequestForComment({ channel, body, addressees?: string[] })` | Pushes `{ addressee, body, in_reply_to?, thread_id? }` into `ctx.replies[]`; returns a fresh `correlation_id` for the lead to reference. **Does not call the bridge**: the callback runner (Step 2.5) projects `ctx.replies[]` into the structured callback payload, and the bridge then opens the thread on receipt. This keeps the in-run lead pure — no network egress from `RequestForComment`. |
| `Recess({ reason, trigger: ResumeTrigger })` | Sets `ctx.recessed = true`, `ctx.recessTrigger = trigger`, terminates the loop. |
| `Adjourn({ verdict, summary, outcome })` | Sets `ctx.concluded = true`, `ctx.verdict = verdict`, `ctx.summary = summary`. |

`Conclude` is intentionally absent from the lead set; agents keep the existing `createFacilitatedAgentToolServer` surface.

Modified: `libraries/libeval/src/index.js` — add `export { createDiscussLeadToolServer, createDiscussAgentToolServer } from "./discuss-tools.js"`.

Verify: covered by `libraries/libeval/test/discuss-tools.test.js`.

## Step 2.5 — Callback emission shape

Modified: `libraries/libeval/src/commands/callback.js`.

Extend the JSON body the runner POSTs to include new fields when the trace contains them:

```ts
{
  correlation_id, verdict, summary, run_url,    // existing
  discussion_id,                                 // read from trace meta event
  replies: Array<{ addressee?, body, in_reply_to?, thread_id? }>,
  trigger?: ResumeTrigger,                       // present iff verdict === "recessed"
}
```

The runner reads structured events emitted by the `Discusser` (e.g.
`{ event: "reply", body, addressee, in_reply_to }` and `{ event: "recess", trigger }`)
and projects them into `replies[]` / `trigger`. The runner scans the
entire trace (not just the first line) so events emitted late are caught.

Add CLI flags: `--discussion-id` (forwards to the callback body verbatim when the trace lacks the meta event), `--include-replies` (boolean; defaults to true on `discuss` traces, false otherwise — so the existing `supervise` / `facilitate` callback shape is unchanged).

Verify: `bun test libraries/libeval/test/commands/callback.test.js` covers all three verdict shapes.

## Step 2.6 — Thread `discussion_id` through the trace via a meta header

Modified: `libraries/libeval/src/trace-collector.js`.

`createTraceCollector({ ..., discussionId })` — when `discussionId` is set:
1. Emit a `{ event: "meta", discussion_id }` line as the **first line** of the trace. This is the guarantee the `by-discussion` lookup in Step 2.7 relies on.
2. Carry `discussion_id` as a top-level field on every emitted event (so partial trace reads still join correctly).

Modified:
- `libraries/libeval/src/discusser.js` — pass `discussionId` to the collector.
- `libraries/libeval/src/commands/discuss.js` — read `--discussion-id` from values, pass to the discusser.

Verify: a trace produced by `fit-eval discuss --discussion-id=GD_x ...` has `{"event":"meta","discussion_id":"GD_x"}` as its first NDJSON line; existing `supervise` / `facilitate` traces are unaffected (no meta header emitted).

## Step 2.7 — `fit-trace by-discussion <id>` command

Modified: `libraries/libeval/bin/fit-trace.js` — add a new command block before the existing `filter`:

```js
{
  name: "by-discussion",
  args: "<discussion-id> [trace-dir]",
  description: "List trace files whose meta header carries the given discussion_id, ordered by first-event timestamp",
  options: {
    "trace-dir": { type: "string", description: "Directory to scan (default: traces/)" },
  },
},
```

Created: `libraries/libeval/src/commands/by-discussion.js` — scans `trace-dir` for `.ndjson` files. For each file, reads only the first line, parses JSON, checks `event.event === "meta" && event.discussion_id === id`. The Step 2.6 first-line guarantee makes this cheap and deterministic. Pipes the file list to stdout one per line, sorted by file mtime ascending so the result is usable with `xargs cat` for a chronological merge.

Modified: `libraries/libeval/bin/fit-trace.js` — register the runner in the existing commands table (`COMMANDS` constant near line 307 — the implementer matches the existing capitalisation when adding the entry).

Verify: `bun test libraries/libeval/test/commands/by-discussion.test.js` covers (a) match found; (b) no match; (c) malformed first line skipped; (d) traces without a meta header skipped (not erroneous).

## Step 2.8 — Defaults

Set in `parseDiscussOptions`:
- `leadProfile` default: `"release-engineer"` (matches design § Components).
- `maxTurns` default: `40` (higher than facilitate's `20` because each recess/resume adds turns).
- `agentProfiles` default: empty array (the lead can run solo).

Verify: `fit-eval discuss --task-text='ping' --discussion-id=GD_x` runs without specifying `--lead-profile` or `--agent-profiles` and concludes via `Adjourn`.

## Notes for the implementer

- The legacy flag removal is irreversible once this part merges. Confirm
  with release-engineer that all in-flight workflow runs of the affected
  workflows (`agent-react.yml`, `kata-interview.yml`, `kata-coaching.yml`,
  `kata-storyboard.yml`) are quiesced before merging — a half-rebased
  runner on the old composite-action tag will reject the new `lead-*`
  inputs.
- The composite-action sibling-repo PR (`forwardimpact/fit-eval`) is a
  prerequisite for the workflow `with:` edits to take effect. The release
  engineer cuts a new `v1`-mutable tag once the sibling PR merges; the
  monorepo PR rebases and re-runs CI.
- The `Discusser`'s `resumeContext` is the entire suspend/resume contract;
  every state mutation a `Recess` needs to preserve must live there.
  Tests must cover round-trip serialisation of `ctx.pendingAsks` (a
  `Map<string, {askId, askerName, …}>`).
- `RequestForComment`'s `correlation_id` is generated by the lead's tool
  call but only becomes meaningful once the bridge dispatches the new
  thread on receiving the callback. The lead may issue multiple RFCs in
  one run; each emits one `replies[]` entry.
