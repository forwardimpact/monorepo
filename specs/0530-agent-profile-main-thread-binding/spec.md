# Spec 0530 — Agent Profile Main-Thread Binding

## Problem

Scheduled Kata agents are not adopting their `.claude/agents/<name>.md` profile
as the main-thread system prompt. The main thread runs as a generic Claude Code
session that happens to know `<name>` is a registered subagent. PR [#409]
(2026-04-17) switched libeval from `extraArgs: { agent }` to the SDK's top-level
`options.agent` expecting this to bind the profile; traces from five runs
spanning four agents on the next night shift show it did not. The
`options.agent` route is the wrong integration point for libeval's needs —
evidence in this spec establishes it as unreliable for main-thread binding
across SDK 0.2.98–0.2.112, and libeval should stop depending on it even if a
future SDK version makes it work.

[#409]: https://github.com/forwardimpact/monorepo/pull/409

### Evidence

Five consecutive workflow runs ran after [#409] merged at `2026-04-17T17:46Z`.
Each started on a commit containing the fix. None adopted its profile.

| Workflow          | Run ID        | Start UTC | Own profile read? | Other profiles read?                         | Behaviour exhibited                                    |
| ----------------- | ------------- | --------- | ----------------- | -------------------------------------------- | ------------------------------------------------------ |
| Technical Writer  | [24587425816] | 21:26     | no                | none                                         | Implemented summit/coverage code fix (#414)            |
| Release Engineer  | [24586709478] | 21:06     | no                | none                                         | Ran product-manager PR gate, merged #413               |
| Product Manager   | [24596510543] | 04:05     | no                | improvement-coach.md                         | Ran product-manager PR gate (in-domain by coincidence) |
| Staff Engineer    | [24597071264] | 04:39     | no                | improvement-coach.md, **product-manager.md** | Ran product-manager PR gate on #414                    |
| Security Engineer | [24597390612] | 04:58     | no                | **product-manager.md**                       | Ran product-manager PR gate on #414                    |

[24587425816]:
  <https://github.com/forwardimpact/monorepo/actions/runs/24587425816>
[24586709478]:
  <https://github.com/forwardimpact/monorepo/actions/runs/24586709478>
[24596510543]:
  <https://github.com/forwardimpact/monorepo/actions/runs/24596510543>
[24597071264]:
  <https://github.com/forwardimpact/monorepo/actions/runs/24597071264>
[24597390612]:
  <https://github.com/forwardimpact/monorepo/actions/runs/24597390612>

**Shared opening phrase.** Every one of the five main-thread agents opens with
near-identical framing — "The user is asking me to assess the current state of
my domain and act on the highest-priority finding. This looks like an autonomous
loop prompt/request/task." The security engineer adds "Let me figure out what
domain I'm in." That framing is generic Claude Code responding to a task, not a
profile introducing itself.

**Voice markers absent.** `technical-writer.md` instructs the agent to sign
output with `— Technical Writer 📝`. The technical-writer run emitted no
signature. None of the other profiles' voice markers appear either.

**Drift converges on product-manager behaviour.** Three of four non-PM runs
produced Product PR Gate reports on PR #414 — the most actionable visible work.
When the profile is absent, the agent reads `KATA.md` for orientation, sees the
seven-agent landscape, picks the most visible queue (open PRs), and acts as
whichever profile that queue belongs to. The Security Engineer run even read
`.claude/agents/product-manager.md` to execute the gate correctly.

**Init event does not mark a main-thread agent.** The SDK's `system.init` event
from run 24587425816 contains:

```text
agents: ['Explore', 'general-purpose', 'improvement-coach', 'Plan',
         'product-manager', 'release-engineer', 'security-engineer',
         'staff-engineer', 'statusline-setup', 'technical-writer']
```

All profiles registered as subagents; none bound as the main-thread agent. The
per-turn `agent_type` field described in `sdk.d.ts` as "Present … on the main
thread of a session started with --agent" never appears.

**The `options.agent` contract is underspecified for this use case.**
`@anthropic-ai/claude-agent-sdk@0.2.112` documents the top-level `agent` option
as: "The agent must be defined either in the `agents` option or in settings."
libeval passes `agent: "<name>"` but does not pass
`agents: { "<name>": { prompt, description, … } }`. The `settings` fallback path
reads subagent definitions from `.claude/agents/*.md`, but the observed
behaviour shows those definitions are applied to the _subagent registry_ (for
the `Task`/`Agent` tool), not to the _main-thread system prompt_. The option has
also shifted behaviour across SDK versions — PR [#409] was itself a response to
a behaviour change between 0.2.98 and 0.2.112. Treat `options.agent` as
unreliable infrastructure for main-thread binding regardless of SDK version.

**All five runs completed successfully at the API level** — the bug is silent.
No validation error, no warning. The only visible signal is behavioural drift
across many turns.

### Contrast — facilitated mode works

The daily storyboard meeting uses libeval's `facilitate` execution mode, which
wires its agents with a different SDK option shape. Run [24554487708]
(2026-04-17 07:58, 10 hours _before_ PR #409 merged) shows perfect persona
adoption across all five facilitated agents:

[24554487708]:
  <https://github.com/forwardimpact/monorepo/actions/runs/24554487708>

| Signal                                                | Solo runs (5 sampled)          | Facilitated run (5 agents) |
| ----------------------------------------------------- | ------------------------------ | -------------------------- |
| Read own `wiki/<agent>.md` before first domain action | 0 / 5                          | **5 / 5**                  |
| First tool call in-domain                             | 0 / 5                          | **5 / 5**                  |
| Emitted profile voice marker (🌱 🔒 🚀 📝 📊)         | 0 / 5                          | **5 / 5**                  |
| Drift to other profile                                | 4 / 5 (all to product-manager) | 0 / 5                      |

Voice markers like `— Technical Writer 📝` are authored only in
`.claude/agents/<name>.md`. No facilitated agent _Read_ its own profile file
during the run, yet every one of them emitted the correct marker. The profile
content therefore reaches facilitated agents through the system prompt at
session start, not through a tool call.

**The difference is at session start, not at task time.** Facilitated and
supervised modes compose the profile into the main-thread system prompt before
the first turn; solo mode does not. `options.agent` alone — the approach PR
[#409] reached for — is not what distinguishes a working run from a broken one
in this SDK version; some additional session-start composition, already present
in the facilitated and supervised call sites, is. Solo mode is the single
outlier among the three execution modes. The working modes' correctness does
_not_ depend on `options.agent` being respected by the SDK, which is why their
binding holds even when the option is silently ignored.

### Impact

- **Persona-enforced scope constraints are not in force.** Each profile defines
  scope boundaries ("never weaken documentation accuracy", "trust boundary:
  product-manager is sole external merge point", etc.). When the profile is not
  loaded, those boundaries are absent.
- **Skill routing fails.** Profiles list 5–8 skills each; the main thread
  instead sees the union of all skills and picks whichever matches the
  self-chosen task.
- **Voice and signatures are absent.** Downstream PR comments and wiki writes
  cannot be attributed to the right agent by voice — breaks cross-agent audit
  trails.
- **Invariant audits produce false FAILs.** `kata-trace`'s per-agent invariants
  (`references/invariants.md`) assume the profile drove the run; when the
  profile was absent, every invariant that refers to persona-scoped behaviour
  fails against a main thread that never tried to satisfy them.
- **Cost inflation.** Generic triage runs dispatch multiple Explore sub-agents
  to re-derive what the profile would have narrowed to "read own summary +
  current week log". Run 24587425816 spent 816K cache-read tokens and six Agent
  sub-agents on broad repo triage.

## Proposal

Bind the designated agent profile as the main-thread system prompt on every
scheduled agent run — including solo-mode runs, which today silently skip this
step. The profile must drive the first token of the main thread, and silent
fallback to a generic main thread when the profile is unreachable is not an
acceptable outcome. Two pre-existing safety nets already cover the remaining
failure surfaces and need no augmentation: an unreadable profile file surfaces
as the file-read's own error and halts the run, and a main thread that binds the
wrong or empty content drifts across domain boundaries within the first few
turns — which `kata-trace` already detects through grounded-theory analysis of
trace artifacts.

### libeval owns the binding; `options.agent` is not part of it

libeval must attach profile content to the main thread at its own layer, using
inputs it controls directly. Passing the profile's name via `options.agent` (or
the equivalent CLI flag) has been observed to silently not bind across SDK
0.2.98–0.2.112 and must be treated as unreliable for this purpose regardless of
SDK version. Two consequences follow:

1. Solo-mode runs today produce an unbound main thread while reporting success.
   That cannot continue.
2. If a future SDK version makes `options.agent` reliably attach profile
   content, libeval's own binding path would _duplicate_ that work — potentially
   stacking two copies of the same profile in the system prompt, or producing
   conflicting tool/model restrictions. libeval must not rely on the option, and
   must not set the option alongside its own binding, to avoid either failure
   mode.

Facilitated and supervised modes already bind correctly without depending on
`options.agent`; they stand as the baseline. Solo mode must meet the same
guarantee and must reach it through the same layer-appropriate mechanism —
libeval's own.

### Binding must hold across execution modes

All three libeval execution modes — single-agent runs, supervised runs, and
facilitated multi-agent sessions — must bind their respective main-thread
profiles with the same guarantees. In supervised and facilitated modes, each
independent main thread must bind its own profile independently. The existing
behaviour of supervised and facilitated modes is the baseline against which solo
mode's fix is verified.

## Scope

### Affected

- **libeval main-thread profile loading** — all three execution modes (run,
  supervise, facilitate) across their respective main threads.
- **Use of `options.agent` inside libeval** — libeval must stop passing the
  SDK's top-level `agent` option (and the equivalent `--agent` CLI flag) for
  main-thread binding. Whatever libeval does to attach profile content stands
  alone and does not coexist with that option.

### Excluded

- **Agent profile content.** The `.md` files under `.claude/agents/` stay as
  written. This spec changes how they are loaded, not what they say.
- **Subagent registration.** The existing mechanism for making `Explore`,
  `Plan`, `improvement-coach`, etc. available via the `Task`/`Agent` tool
  continues to work as today. The Task/Agent tool's use of agent names is a
  separate concern from main-thread binding.
- **Future SDK behaviour of `options.agent`.** Whether a later SDK version makes
  the option reliable for main-thread binding does not affect this spec;
  libeval's binding does not use that option, and the correctness of libeval's
  binding must not depend on the option being ignored, respected, or changed.
- **Dedicated binding instrumentation.** Startup validation that refuses
  unresolvable profile names with bespoke error messages, and dedicated trace
  events that announce which profile is bound, are both out of scope. The spec
  does not add that layer because the two existing safety nets described in the
  Proposal already cover unreadable-profile and drift-from-wrong-content failure
  modes.
- **Task prompt rewording.** The task text "Assess the current state of your
  domain and act on the highest-priority finding" stays generic. The profile is
  what binds "your domain" to a specific meaning, and fixing the binding is this
  spec's job. A follow-up spec may later add defence-in-depth prefixes to task
  text, but only after the binding fix is verified.
- **Storyboard / coaching task prompts.** Those are specific enough to be
  self-identifying today.

## Dependencies

None blocking. [#409] merged a prior libeval change that routed through
`options.agent`; the evidence in this spec shows that integration point is
unreliable and the spec's direction is to move off it rather than refine it.

## Success Criteria

1. A libeval test verifies that for each profile defined under
   `.claude/agents/`, the SDK call libeval constructs carries the profile's
   content in its system prompt. The test passes; `bun run test` is the command.
2. A repository-wide grep for the SDK option that previously carried the profile
   name (top-level `agent` in SDK query options, `--agent` CLI flag) returns no
   call sites inside libeval's source. Test fixtures and historical
   documentation may still reference it.
3. On the next scheduled run of the `agent-team` workflow after the fix lands,
   the per-agent traces (technical-writer, security-engineer, staff-engineer,
   release-engineer, product-manager) contain the profile's voice marker
   (`— Technical Writer 📝`, `— Security Engineer 🔒`, etc.) in at least one
   text block. The markers are authored only in `.claude/agents/<name>.md`;
   their appearance confirms profile content reached the main thread and is a
   signal the fix survived the scheduled-run integration path, not only the
   libeval test harness.
