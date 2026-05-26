# Plan 620a — Request–Response Primitives for libeval Orchestration

Spec: [`spec.md`](./spec.md). Design: [`design-a.md`](./design-a.md).

## Approach

The spec replaces a three-tool, prose-enforced messaging surface
(`Tell`/`Share`/blocking `Ask`) with a symmetric three-tool contract
(`Ask`/`Answer`/`Announce`) whose request–response obligation is enforced at the
libeval runtime. Three surfaces change in lockstep: the library code and its
tests, the domain-facing skill that coaches use to facilitate meetings, and the
coaching workflow + invariant catalogue that exercise and audit the new
contract.

The changes group naturally into three independently-executable parts:

- **Part 01 — libeval runtime.** The contract itself: new tools, pending-ask
  registry, turn-complete guard, `protocol_violation` event, prompt rewrites,
  `systemPromptAmend` / `taskAmend` config family, test coverage. Self-contained
  — no skill or workflow depends on the intermediate state.
- **Part 02 — kata-session skill + repo references.** Directory rename, content
  redistribution into mode overlays, mechanical replacement of `kata-storyboard`
  → `kata-session` across agent profiles, KATA.md, the storyboard workflow,
  memory-protocol, and website internals.
- **Part 03 — coaching workflow + kata-trace invariants.** Rewrite
  `kata-coaching.yml` task-text to carry the coaching framing (mode, target,
  `kata-session` pointer, participant-side summary) and add the two
  `protocol_violation` invariant entries.

Part 01 is the prerequisite for both 02 and 03: the skill's Facilitator Process
references the new `systemPromptAmend` surface; the workflow's task-text
instructs the coach to use that surface; the invariants reference the
`protocol_violation` event type emitted by the new runtime. Parts 02 and 03
touch disjoint files and share no build-time coupling, so they can run
concurrently once Part 01 has merged.

## Part index

| Part | File                             | Scope                                                               | Depends on |
| ---- | -------------------------------- | ------------------------------------------------------------------- | ---------- |
| 01   | [`plan-a-01.md`](./plan-a-01.md) | libeval tool surface, pending-ask runtime, prompts, config, tests   | —          |
| 02   | [`plan-a-02.md`](./plan-a-02.md) | Rename `kata-storyboard` → `kata-session`; update all references    | Part 01    |
| 03   | [`plan-a-03.md`](./plan-a-03.md) | `kata-coaching.yml` task-text + two `protocol_violation` invariants | Part 01    |

## Cross-cutting decisions

- **Field names.** `systemPromptAmend` (system-prompt-level, new, Facilitator
  participant config only) and `taskAmend` (task-content-level, promoted from
  CLI-only to public config on `Facilitator` / `Supervisor` / `AgentRunner`).
  Same family, different scopes. Locked in Part 01 and consumed verbatim by
  Parts 02 and 03.
- **Event shape.** `protocol_violation` trace event is emitted from the
  orchestrator with
  `{type: "protocol_violation", agent: <name>, askId: <id>, mode: "facilitated"|"supervised"}`.
  Shape defined in Part 01 so Part 03's invariant queries can grep for it.
- **Skill name.** `kata-session` is the locked name. Part 01 does not name
  skills (library stays generic). Part 02 creates the directory. Part 03's
  task-text references the name.
- **No backwards-compat shims.** Spec forbids aliases. Removal of `Tell` /
  `Share` / blocking-`Ask` is atomic in Part 01 — callers that imported these
  names stop compiling. All internal callers live in libeval itself (verified
  via `grep -rn` across the repo); no external downstream consumers exist. Part
  01 carries all runtime-side call-site updates.

## Libraries used

This plan implements libeval itself. No consumption of other
`@forwardimpact/lib*` packages. Part 02 and Part 03 touch only markdown and YAML
— no library code.

## Risks

- **Test suite drift.** Part 01 rewrites nine orchestration-toolkit tests and
  touches five facilitator/supervisor tests. A partial update leaves a
  mix-and-match suite that passes locally but flags at `bun run test` on CI.
  Mitigation: the Part 01 DO-CONFIRM runs `bun run check` + `bun run test`
  before push; plan lists every test file by name.
- **Skill rename misses.** A single missed `kata-storyboard` reference in an
  agent profile leaves an agent looking for a skill that no longer exists,
  silently degrading behavior. Mitigation: Part 02 concludes with an explicit
  `grep -rn kata-storyboard` verification step covering the paths SC 6 names.
- **Violation event suppression regression.** The existing
  `orchestrator-filter.js` suppresses lifecycle events from the human text
  stream. Adding `protocol_violation` to that set would hide the new signal.
  Mitigation: Part 01 explicitly leaves `protocol_violation` **out** of the
  suppressed set and asserts via test.
- **Workflow cadence.** `kata-coaching.yml` runs on `workflow_dispatch` only,
  and `kata-storyboard.yml` runs daily at 06:00 UTC. The daily cron provides
  automatic validation of Part 02's skill rename within 24 hours of merge;
  coaching-side validation requires a manual dispatch after Part 03 merges.

## Execution

- **Part 01** runs first and alone. Route to `staff-engineer` — runtime/library
  code and tests. Must land on `main` before Parts 02 and 03 open.
- **Parts 02 and 03** run concurrently after Part 01 merges. Both route to
  `staff-engineer` — Part 02 edits agent profiles + skill markdown + YAML; Part
  03 edits one workflow YAML + one reference markdown. Touches no code, but
  close to the agent/orchestration surface — skill scope, not technical-writer
  scope. Launch them in a single message with two `Agent` tool calls.

Validation per the spec's validation note (one kata-coaching run, one
kata-storyboard run, one supervise run; confirm invariants, `Answer` presence,
and single `Conclude`) is gated on all three parts being on `main`. Ownership:
the implementer of Part 03 — once Part 03 merges, they dispatch
`kata-coaching.yml` manually
(`gh workflow run kata-coaching.yml -f agent=<name>`), wait for the next
scheduled `kata-storyboard.yml` (daily 06:00 UTC), and run a local
`fit-eval supervise` against an arbitrary agent. Invariant queries from Part 03
then evaluate against the combined-trace artifacts.
