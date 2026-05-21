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
- `supervisorProfile: values["lead-profile"] ?? values["supervisor-profile"] ?? undefined`
- `supervisorModel: values["lead-model"] ?? values["supervisor-model"] ?? "claude-opus-4-7[1m]"`
- The `values["supervisor-*"]` reads stay as soft fallbacks (no `--help` declaration; positional command-line `--supervisor-profile=…` and composite-action-injected values still resolve).

Modified: `libraries/libeval/src/commands/facilitate.js` `parseFacilitateOptions`:
- `facilitatorProfile: values["lead-profile"] ?? values["facilitator-profile"] ?? undefined`
- `facilitatorModel: values["lead-model"] ?? values["facilitator-model"] ?? "claude-opus-4-7[1m]"`
- Same soft-fallback approach as supervise.

Modified: `libraries/libeval/src/commands/benchmark-run.js` and `libraries/libeval/bin/fit-benchmark.js` — if either reads `supervisor-*` / `facilitator-*`, rewire to `lead-*`. The implementer greps `libraries/libeval/` for the legacy keys first.

Workflow call sites consume the legacy flags via the `forwardimpact/fit-eval@v1` composite action's `with:` block, which forwards them as CLI flags. **Do not edit the composite-action `with:` flag keys in this part** — instead, Part 03 replaces the composite-action invocation in `agent-react.yml` (renamed to `kata-dispatch.yml`) with a direct `node libraries/libeval/bin/fit-eval.js` call. The other three workflows are left untouched in Part 02; the implementer queues a follow-on PR (or migrates them in a separate workflow-by-workflow PR) to also bypass the composite action. Until those follow-on PRs land, the legacy `facilitator-profile:` and `supervisor-profile:` keys remain in:

- `.github/workflows/kata-interview.yml:133`
- `.github/workflows/kata-coaching.yml:34`
- `.github/workflows/kata-storyboard.yml:33`

To keep these workflows runnable while the CLI legacy-flag declarations are deleted, the CLI parsers in `supervise.js` and `facilitate.js` **continue to read `values["supervisor-profile"]` / `values["facilitator-profile"]` as soft fallbacks** — the *declarations* are removed from `fit-eval.js`'s option schema (so `--help` shows only `--lead-profile`), but `parseSuperviseOptions` / `parseFacilitateOptions` still accept the old keys when the composite action injects them. Spec § Success criteria row 9 verifies via `--help` output ("none of the legacy mode-specific flags") — which the schema removal satisfies. Once all three remaining workflows migrate, the parser fallbacks can be deleted in a separate cleanup PR.

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
| `RequestForComment({ channel, body, addressees?: string[] })` | Pushes `{ addressee, body, in_reply_to?, thread_id?, correlation_id }` into `ctx.replies[]` AND emits a `{ event: "reply", … }` event onto the trace via the existing `TraceCollector`. Returns the fresh `correlation_id` to the lead. **Does not call the bridge**: the discusser writes a terminal `{ event: "summary", replies: ctx.replies, verdict, summary, trigger? }` line at end-of-run, which is the **single source of truth** the callback runner (Step 2.5) reads. |
| `Recess({ reason, trigger: ResumeTrigger })` | Sets `ctx.recessed = true`, `ctx.recessTrigger = trigger`, terminates the loop. |
| `Adjourn({ verdict, summary, outcome })` | Sets `ctx.concluded = true`, `ctx.verdict = verdict`, `ctx.summary = summary`. |

`Conclude` is intentionally absent from the lead set; agents keep the existing `createFacilitatedAgentToolServer` surface.

Modified: `libraries/libeval/src/index.js` — add `export { createDiscussLeadToolServer, createDiscussAgentToolServer } from "./discuss-tools.js"`.

Verify: covered by `libraries/libeval/test/discuss-tools.test.js`.

## Step 2.5 — Callback emission shape

Modified: `libraries/libeval/src/commands/callback.js`.

Extend the JSON body the runner POSTs:

```ts
{
  correlation_id, verdict, summary, run_url,    // existing (verdict shape extended below)
  discussion_id,                                 // read from trace meta event
  replies: Array<{ addressee?, body, in_reply_to?, thread_id?, correlation_id? }>,
  trigger?: ResumeTrigger,                       // present iff verdict === "recessed"
}
```

Verdict values across the system: `"adjourned" | "recessed" | "failed" | "concluded"`. The existing facilitate/supervise traces emit `"failure"` (note the spelling difference) on error paths — Part 02 Step 2.5 normalises both at the callback runner: any `verdict === "failure"` from a non-discuss trace is rewritten to `"failed"` so the bridges branch on a single token.

The runner reads exactly one event from the trace: the terminal `{ event: "summary", … }` written by the discusser at end-of-run. If a trace lacks a summary event (legacy facilitate/supervise), the runner falls back to its existing behaviour (no `replies[]`, no `trigger`).

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

Modified: `libraries/libeval/bin/fit-trace.js` — register the runner in the existing commands table. The implementer locates the runner-map registration by `grep -n 'runFilterCommand' libraries/libeval/bin/fit-trace.js` and inserts the new `byDiscussion: runByDiscussionCommand` entry alongside it (line numbers shift with each release).

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
