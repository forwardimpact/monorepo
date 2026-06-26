# Changelog

All notable changes to `@forwardimpact/libharness`'s CLIs are recorded here.

## Unreleased

### Renamed: libeval → libharness (breaking, v1.0.0)

The library is renamed to reflect the role it plays — the Kata agent
**harness** — while keeping its evaluation capability. This is a clean break
with no aliases or shims; consumers migrate in one step.

- **Package**: `@forwardimpact/libeval` → `@forwardimpact/libharness`. The
  version takes a fresh major, `1.0.0`.
- **CLI**: `fit-eval` → `fit-harness`. The `fit-trace`, `fit-benchmark`, and
  `fit-selfedit` CLIs keep their names.
- **Sibling action**: `forwardimpact/fit-eval` → `forwardimpact/fit-harness`.
- **Env-var contract (breaking)**: every `LIBEVAL_*` name is renamed to
  `LIBHARNESS_*` (`AGENT_PROFILE`, `SKILL`, `WORK_TRACKER`,
  `REDACTION_DISABLED`, `REDACTION_ENV_VARS`). The old names stop being
  recognized — no alias, no fallback, no deprecation window. A configuration
  that still sets `LIBEVAL_*` gets the default as if unset. **Migration:**
  rename each `LIBEVAL_<NAME>` to `LIBHARNESS_<NAME>` in any CI or environment
  that sets it. This is the single-step migration path.
- The evaluation domain vocabulary (`evaluateAssertion`, the `Judge`, "run an
  eval", the framework description) is unchanged — the harness and evaluation
  are distinct concepts.

### fit-trace browse-mode analysis

Six user-visible changes that let the documented grounded-theory analysis
method run without Python wrappers:

- **Default output is now human-readable text.** Every analysis verb that
  previously emitted a JSON envelope (`overview`, `head`, `tail`, `tools`,
  `tool`, `errors`, `reasoning`, `stats`, `init`, `filter`, `turn`, `batch`,
  `search`, and the new verbs below) now prints grep/awk-friendly text by
  default. `count` and `timeline` already printed text and are unchanged.
- **`--format json` opts back into JSON.** Under a single file, the
  `--format json` output is structurally identical to the JSON these verbs
  emitted by default before this change (`search` excepted: its top-level
  array envelope is preserved, but the matched-block interior carries the new
  representation). **Migration for scripted consumers: add `--format json`** to
  any `fit-trace` invocation whose output you parse. This is the single-flag
  migration path.
- **`tool-calls` verb.** One record per `tool_use` block, each paired with its
  `tool_result` by `toolUseId`; orphaned calls emit `result: null` (text:
  `(no result)`) and are never dropped.
- **`commands` and `paths` verbs.** `commands` lists Bash command text
  (optional `--match <regex>`); `paths` gives a frequency-sorted list of the
  distinct `Read`/`Edit`/`Write` file paths (optional `--prefix`).
- **`compare` verb.** Side-by-side view of two traces — turn count, distinct
  tools, paths touched, cost, and a per-tool delta — with each side's case name
  and participant in the header. Identical traces emit zero deltas; an empty
  trace emits zeroed counters with an `(empty)` marker rather than erroring.
- **Multi-file input via `--file`.** Cross-trace verbs (`overview`, `count`,
  `head`, `tail`, `tools`, `errors`, `reasoning`, `timeline`, `stats`, `init`,
  `filter`, `tool-calls`, `commands`, `paths`) now take their trace files
  through a repeated `--file <path-or-glob>` option instead of a positional
  argument; pass it more than once, or give it a quoted glob
  (`--file 'traces/*.ndjson'`), to analyse several traces at once. With more
  than one resolved file, every record carries its source basename
  (`grep -H` convention for per-record verbs; a `sources` array for the
  aggregators). A single resolved file (including a glob matching one) carries
  no source prefix. `compare` and the single-file verbs (`tool`, `turn`,
  `batch`, `search`) keep their positional file argument.
- **`stats --by-tool` and `stats --summary`.** `--by-tool` attributes token
  usage per tool with a cost-share fraction summing to 1.0 (turns with no tool
  call land in the `(no-tool)` bucket); `--summary` prints totals only.

**Breaking changes:**

- Cross-trace verbs no longer take a positional trace file. Replace
  `fit-trace <verb> structured.json` with
  `fit-trace <verb> --file structured.json`.
- `head`/`tail` replace the optional `[N]` positional with `--lines <n>`
  (default 10).
