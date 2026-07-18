# Spec 2230 — Native Advisor Consults for fit-harness Sessions

An agent in a `fit-harness` session that hits a hard decision — an
architectural fork, an unclear root cause, a trade-off it cannot rank — has no
way to borrow stronger judgment mid-loop. Its choices today are to guess and
keep building on the guess, or to burn the whole session on the most capable
model tier. This spec adds a third option: an executor-triggered **advisor
consult** — one bounded, read-only session on a stronger model that sees the
caller's full context and returns a paragraph of advice, leaving the caller in
control of the loop.

Serves **Platform Builders** — the persona who hires Gear to *give humans and
agents shared capabilities with tooling to prove changes improved outcomes*
(see [JTBD.md](../../JTBD.md)). The advisor is exactly such a capability: a
model-pairing primitive whose every use lands in the same trace evidence the
harness already produces, so its value can be proven or refuted on our own
workloads.

**Classification: internal.** The change lands in `libraries/libharness` (the
`fit-harness` CLI) — an internal tree serving a Platform Builder job.

## Problem

**The pattern is proven elsewhere but unmeasured here.** Anthropic's "advisor
strategy" ([launch blog](https://claude.com/blog/the-advisor-strategy),
2026-04-09) pairs a cheap executor holding the agent loop with a stronger
advisor consulted only at hard decision points. Their published results:
Sonnet + Opus advisor gained +2.7pp on SWE-bench Multilingual at −11.9% cost
per task; Haiku + Opus advisor doubled BrowseComp accuracy at −85% of
Sonnet-solo cost. The one independent controlled field test found (ren-ai.dev,
2026) was **negative** — same codebase and prompts, more tokens, no quality
gain. There is no internal incident evidence either way, and there cannot be:
harness sessions have no advisor capability, so the harness cannot measure a
pattern it cannot run. The pattern's value is workload-dependent, which is
precisely the question fit-harness exists to answer.

**The economics apply directly to our own benchmark.** The benchmark
agent-under-test is pinned to a mid-tier model so pass@k stays comparable,
while eval agents default to the top tier. A benchmark arm where the mid-tier
executor can consult a top-tier advisor is the cheapest credible way to test
whether model pairing beats either model solo on our tasks — but only after
the consult capability exists.

**Anthropic's server-side tool is not a fit.** The native `advisor_20260301`
API tool
([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool))
would deliver the pattern without new code, but:

| Gap | Consequence for the harness |
| --- | --- |
| Public beta: beta header, shifting model-pairing matrix; available on the Claude API and Claude Platform on AWS only — not Bedrock, Vertex, or Foundry | Couples every harness run to a moving surface; consumers on other platforms excluded |
| Advisor thinking is dropped; cost buried in `usage.iterations[]` | The harness's evidence chain breaks — consults would be the only agent activity invisible in NDJSON traces |
| Budgets are per-request `max_uses`; no conversation-level cap exists, so session ceilings are prompt-level | Field data (readysolutions.ai, 159 logged consults) shows prompt-level caps are a cost hope, not a cost control |
| Advisor sees only the transcript; cannot read files | A documented blind spot: advice about code it cannot open |

**Advisor-shaped machinery mostly exists in libharness.** The judge runs a
solo, tool-restricted, one-shot session over another agent's work and re-emits
its lines into the parent trace under its own source tag. The orchestration
toolkit builds per-caller tools whose handlers are closed over the caller's
name and shared session state. Every session mode (`run`, `supervise`,
`facilitate`, `discuss`) runs agents through the same runner with a composed
system prompt. Two pieces are genuinely new: a code-enforced consult budget
(the toolkit's shared counters generate message ids; none enforces a cap), and
a per-participant transcript record — the harness writes session lines to the
trace stream and keeps no in-memory record, so there is nothing today to
forward to an advisor.

## Goal

Any agent in a `fit-harness` session can, when the operator enables it,
consult a stronger model at its own judgment and get back bounded advice
grounded in its full context — with the consult count enforced in code, every
consult and its cost visible in the trace, and the advisor structurally unable
to take over the work.

## The advisor contract

These properties define the capability independent of mechanism; each maps to
a success criterion below.

1. **Consulted, not commanding.** The advisor never holds the loop, never
   modifies the working directory, and has no standing presence in the
   session. Its output re-enters the caller's session only as advice text.
2. **Whole context in, advice out.** The advisor sees the caller's full
   context — the system prompt the harness composed, task, transcript so
   far — assembled by the harness, not curated by the caller. The caller adds
   a focused question; it cannot restrict what the advisor sees.
3. **Read-only inspection, nothing else.** The advisor can open the files the
   caller's transcript names — closing the server-side tool's documented
   blind spot — but holds no write, execute, subagent, or orchestration
   tools.
4. **Bounded output.** A fixed response contract (assessment, recommendation,
   unsolicited findings; short) so advice stays a paragraph, not a takeover.
5. **Budgeted in code.** A session-level consult cap enforced in code, not in
   the prompt. On exhaustion the caller is told to proceed with its best
   judgment.
6. **Evident.** Every consult is visible in the trace: who asked, what was
   asked, the advice, and the advisor's own token usage and cost, attributed
   to the advisor as a distinct source.
7. **Operator-enabled, executor-triggered.** The operator turns the advisor
   on per session; the caller's judgment decides when to consult, steered by
   system-prompt guidance — no schedule, no forced calls.
8. **Fail-open.** An advisor error, timeout, or abort returns an explicit
   "proceed without advice" result to the caller; it never stalls or crashes
   the caller's session.

## Scope

### In scope

| Change | Detail |
| --- | --- |
| Advisor consult capability | An `Advisor` tool available to agent participants, taking a focused question and returning advice text. Offered only when the session is started with an advisor model; absent otherwise (default off). |
| One-shot advisor sessions | Each consult runs a fresh, solo, tool-restricted session on the advisor model over the forwarded context. Stateless per consult — each call re-reads the caller's context as it stands. |
| Per-participant transcript record | The harness keeps each participant's session record (composed system prompt, delivered prompts, messages so far) so consults forward the whole context. Contract item 2 is impossible without it. |
| Consult budget | `--advisor-max-uses <n>` session-level cap, **default 3** (Anthropic's published evals all ran `max_uses: 3`), enforced in code and shared across all callers in the session; exhaustion returns a "proceed with your best judgment" result without spending advisor tokens. |
| CLI surface | `--advisor-model <id>` and `--advisor-max-uses <n>` on `run`, `supervise`, `facilitate`, and `discuss`. Absent `--advisor-model` means no advisor tool is offered; `--advisor-max-uses` without `--advisor-model` is a usage error. |
| Consult guidance | When the advisor is enabled, agent system prompts gain an advisor-usage section: when a consult pays off (early, before work builds on an unvalidated assumption), when it does not (routine reads, writes, searches), and the budget. Guidance steers the caller's judgment; it mandates nothing (contract 7). |
| Trace evidence | Every consult emits an orchestrator event (caller, question, model, duration, remaining budget) and the advisor session's own lines land in the same trace attributed to the advisor as a distinct source — including its result event with token usage and cost. |
| Failure isolation | Consult timeout (bound owned by the design), advisor session error, and session-level abort all resolve the tool call with an explicit no-advice result; an in-flight consult is aborted when the parent session stops. |
| Documentation | The four commands' `--help` documents both flags; the fit-harness agent-collaboration guide gains an advisor section. |

### Excluded

- **Benchmark three-arm variant axis** (executor solo / executor + advisor /
  advisor solo). The evidence loop that proves the pattern's value is its own
  spec-sized change to the benchmark runner, result schema, and report; it
  depends on this spec and is claimed as a follow-up spec once this one
  lands.
- **Trace analysis verbs.** New `fit-trace` facets or stats splits
  (executor-vs-advisor token breakdowns) build on the evidence this spec
  records; the raw evidence is in scope, the query surface is not.
- **Persistent advisor sessions** (resume-with-delta per caller). An
  optimization to adopt only if measured consult cost justifies it.
- **Anthropic's server-side `advisor_20260301` tool** — rejected above; no
  passthrough or hybrid mode.
- **Advisor as a bus participant.** A consulted advisor is a tool call; a
  participating advisor is just another agent, which facilitate mode already
  supports via profiles.
- **Advisor for lead roles.** Facilitator, supervisor, and discuss leads
  coordinate rather than perform substantive work; only agent participants
  get the tool. Revisit with benchmark data.
- **Context curation knobs** (message/char budgets, tool-result filtering).
  Whole-context forwarding is the contract; curation is a cost lever to
  consider only with cost data.
- **Domain-specific advisor profiles** (`--advisor-profile`). One built-in
  advisor role first.

## Success criteria

Verifiable at merge time with the runner's injected-query test seam — no live
LLM spend. Verification: `bun test` in `libraries/libharness`.

| Criterion | Contract | Verification |
| --- | --- | --- |
| The advisor tool is offered iff `--advisor-model` is set. | 7 | A session without the flag exposes no `Advisor` tool and no advisor prompt section; with the flag, agent participants get both, in all four modes. |
| A consult runs one fresh advisor-model session and returns its final text as advice. | 1 | With a fake query, `Advisor({question})` triggers exactly one session on the configured advisor model; the tool result is that session's final text. |
| The advisor can inspect but not act. | 1, 3 | The advisor session's tools are exactly the read-only inspection set — no write, execute, subagent, or orchestration tools; it holds no bus presence and its output enters the caller's session only as the tool result. |
| The forwarded context is whole and uncurated. | 2 | The advisor session's prompt contains the caller's system prompt as the harness composed it (when the harness composed one), the caller's delivered prompts, every prior message of the caller's session, and the question — regardless of what the caller passed. |
| Consults are stateless. | 2 | A second consult from the same caller forwards the full transcript as it stands then, not a delta. |
| The budget is enforced in code. | 5 | Consult `n+1` past the cap (flag value, or 3 unset) returns a "proceed with your best judgment" result and starts no advisor session; the counter is shared across all callers in the session. |
| Every consult is evident in the trace. | 6 | Each consult emits an orchestrator consult event (caller, question, model, duration, remaining budget), and the advisor session's lines — including its result event with usage and cost — appear in the same trace under a distinct advisor source. |
| Advice is bounded. | 4 | The advisor session is constructed with a single-digit turn budget, and its role prompt fixes the response contract (assessment / recommendation / unsolicited findings) with a stated length ceiling; a test asserts both. |
| Failure is isolated. | 8 | A consult that times out, errors, or is aborted resolves with an explicit no-advice result and the caller's session continues; parent-session stop aborts an in-flight advisor session. |
| Enabled prompts carry consult guidance. | 7 | With the advisor enabled, each agent's system prompt contains the advisor-usage section; without it, no advisor text appears. |

**Outcome criterion (go-see)** — tracked after merge, not gating: the
follow-up benchmark spec comparing executor-solo vs executor+advisor arms on a
monorepo task family runs to verdict using only this spec's trace evidence
(consult counts, positions, advisor cost split from executor cost).

## Path to approval

Approval is human-only: this spec advances when `wiki/STATUS.md` shows the
`2230` row approved, written from a trusted human signal. This spec ships
together with `design-a.md` under lockstep co-execution — one combined PR,
one design-class approval subsuming both. On approval the pipeline proceeds
to `kata-plan`.

— Staff Engineer 🛠️
