# Changelog

This file records all notable changes to `@forwardimpact/libharness`'s CLIs.

## Unreleased

### Bins moved to `@forwardimpact/gemba` (breaking)

The four CLI entry points (`fit-harness`, `fit-trace`, `fit-benchmark`,
`fit-selfedit`) moved to the `@forwardimpact/gemba` product package. They now
carry the gemba names (`gemba-harness`, `gemba-trace`, `gemba-benchmark`,
`gemba-selfedit`). This release removes the `bin` field and the `bin/`
directory. libharness is an import-only library. The command modules the bins
dispatch to are now package exports (`./commands/*.js`). The exports include a
new `./commands/selfedit.js`. It comes from the former `fit-selfedit` bin.
**Migration:** install `@forwardimpact/gemba` for the commands. Import
`@forwardimpact/libharness` for the APIs.

### Renamed: libeval → libharness (breaking, v1.0.0)

This release renames the library to reflect the role it plays. That role is
the Kata agent **harness**. The library keeps its evaluation capability. This
is a clean break with no aliases and no shims. Consumers migrate in one step.

- **Package**: `@forwardimpact/libeval` → `@forwardimpact/libharness`. The
  version takes a fresh major, `1.0.0`.
- **CLI**: `fit-eval` → `fit-harness`. The `fit-trace`, `fit-benchmark`, and
  `fit-selfedit` CLIs keep their names.
- **Sibling action**: `forwardimpact/fit-eval` → `forwardimpact/fit-harness`.
- **Env-var contract (breaking)**: this release renames every `LIBEVAL_*` name
  to `LIBHARNESS_*` (`AGENT_PROFILE`, `SKILL`, `WORK_TRACKER`,
  `REDACTION_DISABLED`, `REDACTION_ENV_VARS`). The library no longer
  recognizes the old names. There is no alias, no fallback, and no deprecation
  window. A configuration that still sets `LIBEVAL_*` gets the default as if
  unset. **Migration:** rename each `LIBEVAL_<NAME>` to `LIBHARNESS_<NAME>` in
  any CI or environment that sets it. This is the single-step migration path.
- The evaluation domain vocabulary (`evaluateAssertion`, the `Judge`, "run an
  eval", the framework description) is unchanged. The harness and evaluation
  are distinct concepts.

### fit-trace browse-mode analysis

Six user-visible changes let the documented method for grounded-theory
analysis run without Python wrappers:

- **Default output is now human-readable text.** Every analysis verb that
  previously emitted a JSON envelope now prints grep/awk-friendly text by
  default. Those verbs are `overview`, `head`, `tail`, `tools`, `tool`,
  `errors`, `reasoning`, `stats`, `init`, `filter`, `turn`, `batch`, `search`,
  and the new verbs below. `count` and `timeline` already printed text and are
  unchanged.
- **`--format json` opts back into JSON.** Under a single file, the
  `--format json` output is structurally identical to the JSON these verbs
  emitted by default before this change. `search` is the exception. It keeps
  its top-level array envelope, but the matched-block interior carries the new
  representation. **Migration for scripted consumers: add `--format json`** to
  any `fit-trace` invocation whose output you parse. This is the single-flag
  migration path.
- **`tool-calls` verb.** The verb emits one record per `tool_use` block. It
  pairs each record with its `tool_result` by `toolUseId`. Orphaned calls emit
  `result: null` (text: `(no result)`). The verb never drops them.
- **`commands` and `paths` verbs.** `commands` lists Bash command text
  (optional `--match <regex>`). `paths` gives a frequency-sorted list of the
  distinct `Read`/`Edit`/`Write` file paths (optional `--prefix`).
- **`compare` verb.** The verb shows two traces side by side. The view
  reports turn count, distinct tools, paths touched, cost, and a per-tool
  delta. The header carries each side's case name and participant. Identical
  traces emit zero deltas. An empty trace emits zeroed counters with an
  `(empty)` marker, and it does not error.
- **Multi-file input through `--file`.** Cross-trace verbs now take their
  trace files through a repeated `--file <path-or-glob>` option instead of a
  positional argument. Those verbs are `overview`, `count`, `head`, `tail`,
  `tools`, `errors`, `reasoning`, `timeline`, `stats`, `init`, `filter`,
  `tool-calls`, `commands`, and `paths`. Pass the option more than once to
  analyse several traces at once. You can also give it a quoted glob
  (`--file 'traces/*.ndjson'`). With more than one resolved file, every record
  carries its source basename. Per-record verbs follow the `grep -H`
  convention. The aggregators carry a `sources` array. A single resolved file
  carries no source prefix, and a glob that resolves to one file behaves the
  same way. `compare` and the single-file verbs (`tool`, `turn`, `batch`,
  `search`) keep their positional file argument.
- **`stats --by-tool` and `stats --summary`.** `--by-tool` attributes token
  usage per tool. The cost-share fractions sum to 1.0. Turns with no tool call
  land in the `(no-tool)` bucket. `--summary` prints totals only.

**Breaking changes:**

- Cross-trace verbs no longer take a positional trace file. Replace
  `fit-trace <verb> structured.json` with
  `fit-trace <verb> --file structured.json`.
- `head`/`tail` replace the optional `[N]` positional with `--lines <n>`
  (default 10).
