---
title: Prove Agent Changes
description: Reproducible evidence that agent changes improved outcomes — from dataset generation through evaluation to trace analysis.
---

You changed an agent profile, tightened a tool allowlist, or rewrote a system
prompt. The question is whether the change actually helped. Answering that
question requires a dataset you can regenerate when the schema changes, a
session that captures every turn, and an analysis method that connects observed
behavior to actionable findings. This guide walks the full arc with `fit-terrain`
and `fit-harness`, then hands off to `fit-trace` for the reading.

## Prerequisites

- Node.js 22+
- `ANTHROPIC_API_KEY` set in the shell (used by both `fit-terrain generate` and
  `fit-harness`)
- A repository where agents will work
- The three CLIs ship in two packages -- install once:

```sh
npm install -g @forwardimpact/libharness @forwardimpact/libterrain
```

Or invoke ephemerally with `npx`:

```sh
npx --yes @forwardimpact/libterrain fit-terrain --help
npx --yes @forwardimpact/libharness fit-harness --help
npx --yes @forwardimpact/libharness fit-trace --help
```

## 1. Define the dataset in a DSL file

`fit-terrain` reads a single `.dsl` file that declares everything the pipeline
needs: an organization graph, people distribution, projects, scenarios, an
engineering standard, content types, and external datasets. The pipeline parses
the DSL, generates entities, resolves prose through an LLM-backed cache, renders
output in multiple formats, and validates the result -- all from one source.

Create a minimal DSL file. This example declares a small organization with one
team, a people distribution, and an engineering standard:

```
// evals/terrain/story.dsl

terrain Acme {
  domain "acme.example"
  industry "fintech"
  seed 42

  org headquarters {
    name "Acme HQ"
    location "London, UK"
  }

  department engineering {
    name "Engineering"
    parent headquarters
    headcount 20

    team payments {
      name "Payments Team"
      size 8
      repos ["payments-api", "ledger-service"]
    }
  }

  people {
    count 20
    distribution {
      J060 50%
      J070 30%
      J080 20%
    }
    disciplines {
      software-engineering 80%
      data-engineering 20%
    }
  }

  standard {
    proficiencies [awareness, foundational, working, practitioner, expert]
    maturities [emerging, developing, practicing, role-modeling, exemplifying]

    levels {
      J060 { title "Engineer" rank 2 experience "2-4 years" }
      J070 { title "Senior Engineer" rank 3 experience "4-7 years" }
      J080 { title "Lead Engineer" rank 4 experience "7-10 years" }
    }

    capabilities {
      delivery {
        name "Delivery"
        skills [full_stack_development, problem_discovery]
      }
      reliability {
        name "Reliability"
        skills [sre_practices, incident-management]
      }
    }

    behaviours {
      outcome_ownership { name "Own the Outcome" }
      systems-thinking { name "Think in Systems" }
    }

    disciplines {
      software-engineering {
        roleTitle "Software Engineer"
        specialization "Software Engineering"
        core [full_stack_development, sre_practices]
        supporting [problem_discovery]
        broad [incident-management]
        validTracks [null]
      }
      data-engineering {
        roleTitle "Data Engineer"
        specialization "Data Engineering"
        core [problem_discovery, incident-management]
        supporting [full_stack_development]
        broad [sre_practices]
        validTracks [null]
      }
    }

    tracks {}
    drivers {}
  }
}
```

The DSL supports additional blocks -- `project`, `scenario`, `snapshots`,
`content`, `clinical`, `dataset`, and `output` -- that add projects,
time-based scenarios, a patient-and-trial domain with Schema.org microdata
output, external tool-generated datasets (Synthea, SDV, Faker), and rendered
output files. Start small and add blocks as your evaluation demands more
context. See the
[Generate an Eval Dataset](/docs/libraries/prove-changes/generate-dataset/)
guide for examples of each.

## 2. Generate and validate the dataset

The pipeline has four verbs. Use them in sequence during setup, then only the
ones you need on subsequent runs:

```sh
npx fit-terrain check --story=evals/terrain/story.dsl
```

`check` parses the DSL, generates entities, and reports prose cache completeness.
On a fresh file every key will be a miss -- that is expected.

```sh
npx fit-terrain generate --story=evals/terrain/story.dsl
```

`generate` fills the prose cache via the LLM, then renders and validates all
content. The cache is persisted to `data/synthetic/prose-cache.json` by default
(override with `--cache`). Subsequent runs with the same DSL reuse cached prose,
so only new or changed keys cost API calls.

```sh
npx fit-terrain validate --story=evals/terrain/story.dsl
```

`validate` runs entity and cross-content checks without writing files. Use it
after editing the DSL to catch structural errors before a full build.

```sh
npx fit-terrain build --story=evals/terrain/story.dsl
```

`build` renders and writes all content types. Add `--only=pathway` to render
only the engineering standard YAML, or `--only=html` for knowledge-base
documents. The output lands under `data/` in the working directory.

After the build, the `data/` tree contains everything the eval needs:
engineering standard definitions, knowledge-base documents, activity records,
and any external datasets declared in the DSL.

## 3. Write the eval task and profiles

With the dataset in place, write the task file and agent profiles that will
exercise the change you want to evaluate. The task is a markdown prompt; the
profiles live under `.claude/agents/`.

A task for evaluating a refactored formatting utility:

```md
<!-- evals/refactor-utils/task.md -->
Refactor `src/utils/format.js` so that `formatDate` and `formatCurrency`
share a single locale-resolution helper. Do not change the public API of
either function. Add unit tests covering the en-US, en-GB, and de-DE
locales. Run the test suite and confirm it passes before finishing.
```

A judge profile for supervised evaluation:

```md
<!-- .claude/agents/refactor-judge.md -->
---
name: refactor-judge
description: Evaluate a refactor of shared formatting utilities.
---

You are evaluating a refactor of `src/utils/format.js`. Watch the agent's
work and call `Conclude` when the session is finished.

Pass criteria -- all must hold:

- `formatDate` and `formatCurrency` share a single locale-resolution helper.
- The public signatures of both functions are unchanged.
- New tests exist for en-US, en-GB, and de-DE.
- The full test suite passes on the agent's final run.

If the agent strays, send a fresh `Ask` to redirect it -- each `Ask` gets a
new `askId`, so a follow-up coexists with any in-flight ones. If it claims
to be done, verify the criteria yourself with `Read` and `Bash` before
calling `Conclude`. Conclude with `verdict: "failure"` if any criterion fails;
include a one-paragraph summary of the gap.
```

For facilitated sessions with multiple specialists, write a facilitator profile
and one profile per participant. Each participant only needs to describe its
specialism -- the runtime appends the orchestration tools (`Ask`, `Answer`,
`Announce`, `RollCall`, `Conclude`) automatically.

```md
<!-- .claude/agents/release-facilitator.md -->
---
name: release-facilitator
description: Coordinate a release-readiness review across specialist agents.
---

You are facilitating a release-readiness review. The participants are
`security-engineer`, `release-engineer`, and `technical-writer`.

1. `Announce` the goal: confirm whether the current release is ready to ship.
2. `Ask` each participant for their go/no-go, one at a time.
3. If any participant reports a blocker, `Announce` the blocker so the
   others can react, then ask whether they want to revise their position.
4. `Conclude` with `verdict: "success"` if all three are go; otherwise
   `verdict: "failure"` with a one-paragraph summary of the blocker.
```

## 4. Run the eval

For a **supervised evaluation** (one agent, one judge):

```sh
npx fit-harness supervise \
  --task-file=evals/refactor-utils/task.md \
  --lead-profile=refactor-judge \
  --supervisor-cwd=. \
  --supervisor-allowed-tools=Read,Grep,Bash \
  --agent-cwd=/tmp/refactor-sandbox \
  --allowed-tools=Read,Edit,Write,Bash,Grep,Glob \
  --max-turns=200 \
  --output=trace--demo.raw.ndjson
```

`--max-turns` is the per-runner invocation budget for both the judge and the
agent. The orchestration loop that drives the supervisor↔agent exchange is
bounded separately by an internal lead-turn cap. `0` removes the per-runner
cap. Exit code `0` means the judge concluded with `success: true`; exit code
`1` means it concluded `success: false`, ran out of turns, or errored.

For a **facilitated session** (one facilitator, N participants):

```sh
npx fit-harness facilitate \
  --task-file=sessions/release-review/task.md \
  --lead-profile=release-facilitator \
  --facilitator-cwd=. \
  --agent-profiles=security-engineer,release-engineer,technical-writer \
  --agent-cwd=. \
  --max-turns=200 \
  --output=trace--demo.raw.ndjson
```

Participants share `--agent-cwd` by default. If two participants might edit the
same file, give each its own working directory or restrict tool allowlists so
only one can write. `--max-turns` is applied uniformly to the facilitator and
to every participant -- always set a budget so a stuck participant cannot run
the session indefinitely. The CLI default is `20`; raise it for sessions that
do real implementation work.

For a **threaded discussion** (Chair + N participants, suspendable across a
bridged channel), use `fit-harness discuss`. It accepts the same lead and
agent flags plus `--discussion-id` (the stable thread identifier carried
through traces) and `--resume-context` (JSON-serialized prior state for a
resumed run). The bridge service relays the workflow callback when the
conversation suspends and re-enters.

Every mode accepts the task as one of three inputs (exactly one required):
`--task-file=<path>`, `--task-text="<inline>"`, or
`--task-event=<path>` for a native GitHub event payload.
The `--task-file` content is visible to every agent in the session as the
opening prompt. The facilitator profile steers how the goal is pursued; the
participants apply their specialisms.

## 5. Verify the trace

After the run, confirm the trace file exists and contains the expected structure
before investing time in analysis:

```sh
npx fit-trace overview --file trace--demo.raw.ndjson
npx fit-trace timeline --file trace--demo.raw.ndjson
npx fit-trace stats --file trace--demo.raw.ndjson
```

`overview` reports metadata, turn count, and tool usage frequency. `timeline`
prints one line per turn so you can see the shape of the session at a glance.
`stats` breaks down token usage and cost. Cross-trace verbs take their files
through `--file` (repeat it, or pass a quoted glob) and print text by default;
add `--format json` for the machine-parseable envelope.

For supervised and facilitated runs, split the combined trace into per-source
files:

```sh
npx fit-trace split trace--demo.raw.ndjson --mode=supervise --case=demo
npx fit-trace split trace--demo.raw.ndjson --mode=facilitate --case=demo
```

This produces files following the
`trace--<case>--<participant>.<role>.ndjson` convention — for `supervise`,
`trace--demo--agent.agent.ndjson` and
`trace--demo--supervisor.supervisor.ndjson`; for `facilitate`,
`trace--demo--facilitator.facilitator.ndjson` plus one
`trace--demo--<participant>.agent.ndjson` per participant. `--case` defaults
to `default`; pass it to disambiguate matrix shards. Per-source traces are
essential when participants disagreed -- you can read each one's view
independently.

## 6. Analyze traces for findings

The trace is qualitative data. The most useful analysis comes from reading it
like a researcher, not running a checklist. Drill into specific tools and
message exchanges:

```sh
npx fit-trace tool trace--demo.raw.ndjson Conclude
npx fit-trace tool trace--demo.raw.ndjson Ask
npx fit-trace tool trace--demo.raw.ndjson Announce
npx fit-trace filter --file trace--demo.raw.ndjson --tool Edit
npx fit-trace search trace--demo.raw.ndjson 'error|fail' --context 1
npx fit-trace reasoning --file trace--demo.raw.ndjson
```

`tool` and `search` pin a single trace, so they take the file as a positional;
the cross-trace verbs (`filter`, `reasoning`, and the rest) take `--file`.

The `Conclude` call carries the verdict -- start there when an eval fails, then
follow the timeline backwards. For facilitated sessions, walk `Announce`
(broadcasts) and `Ask`/`Answer` (targeted exchanges) to see how the
participants converged or where they diverged.

For the full analysis method -- grounded-theory coding, pattern identification,
and writing findings that are grounded, testable, and actionable -- see the
[Trace Analysis](/docs/libraries/prove-changes/trace-analysis/) guide.

## What's next

<div class="grid">

<!-- part:card:run-eval -->
<!-- part:card:run-benchmark -->
<!-- part:card:trace-analysis -->
<!-- part:card:generate-dataset -->

</div>
