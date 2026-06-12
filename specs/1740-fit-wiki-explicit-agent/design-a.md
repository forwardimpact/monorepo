# Design 1740-a — fit-wiki explicit `--agent`

Architecture for [spec 1740](spec.md): remove `libwiki`'s ambient agent
identity (the `LIBEVAL_AGENT_PROFILE` fallback and the hardcoded
`staff-engineer` last-resort), make `--agent`/`--from` mandatory on
agent-scoped subcommands with a fail-closed error before any state change,
emit fully resolved audit hints, and add rotate's under-budget refusal.

## Component map

```mermaid
flowchart LR
  subgraph libwiki
    DEF["cli-definition.js\n(option contract, help, examples)"]
    RES["util/agent-flag.js (new)\nrequireAgentFlag()"]
    H["commands/{boot,log,claim,\ninbox,rotate,memo}.js"]
    WL["weekly-log.js\nrotateIfOverBudget()"]
    AR["audit/rules.js\nweekly-log budget rules"]
  end
  subgraph libutil
    RU["rules.js\napplyRule()"]
    FI["findings.js\ntext emitter (unchanged)"]
  end
  DEF -->|"frozen ctx.options\n(no default)"| H
  H --> RES
  H --> WL
  AR -->|"hint: fn(subject)"| RU --> FI
```

## Components and changes

| Component | Change |
|---|---|
| `libwiki/src/cli-definition.js` | `agentOpt` and memo's `from` lose their `default`; help text states the flag is required with no environment fallback. `createDefinition(env)` becomes `createDefinition()` — with both env reads gone, the parameter has no remaining consumer. Callers (bin shim, golden test) updated in the same change. |
| `libwiki/src/util/agent-flag.js` (new) | `requireAgentFlag(options, spec)` — the single home for the missing-flag error contract (§ Interfaces). Pure function over the frozen `ctx.options`; runs before any filesystem access. |
| Handlers: `boot`, `log`, `claim`, `inbox`, `rotate` | The per-handler `options.agent \|\| env…` chains (and boot's `\|\| "staff-engineer"` literal) are replaced by one `requireAgentFlag` call as the handler's first statement. The previously dead guards become this live, uniformly worded path. |
| Handler: `release` (targeted form) | Same resolver, applied only when `--expired` is absent. `release --expired` keeps its agent-less cross-agent sweep unchanged. |
| Handler: `memo` | Same resolver with `flag: "--from"`; env read deleted. `--to`/`--message` checks unchanged. |
| `libutil/src/rules.js` | `hint` widens from `string?` to `string \| (subject, item, ctx) => string` — `applyRule` resolves functions at finding time. Additive: static-string rules across all consumers (`libwiki` audit/fix, `libcoaligned`) render byte-identical. Closed PR #1587 is the reference implementation, not a constraint. |
| `libwiki/src/audit/rules.js` | `weekly-log.line-budget` / `weekly-log.word-budget` hints become functions emitting `bunx fit-wiki rotate --agent <agentPrefix>` from the flagged subject's existing `agentPrefix` field — a verbatim copy-paste is correct and correctly targeted. |
| `libwiki/src/weekly-log.js` | The `noop` arm of `rotateIfOverBudget`'s tagged union gains `reason: "floor" \| "under-budget"` plus the measured `lines`. Additive — existing callers (`fix`) branch on `status` only. Floor check stays ahead of the `force` check: the header-only floor remains non-overridable. |
| `commands/rotate.js` | Gains a `--force` option and stops hardwiring `force: true` — it forwards the flag. A `noop/under-budget` result becomes exit 2 naming the resolved target and its size; `noop/floor` stays a zero-exit no-op message. Over-budget targets seal without `--force` (the audit-hint path never trips the guard on a fresh hint; a stale re-run does, by design). |
| Golden help corpus + CLI tests | Help goldens regenerated; per-subcommand fail-closed tests added for both env states (set-wrong and unset); explicit-flag test subset passes unmodified per the spec's compatibility criterion. |
| Docs/migration sweep | `libwiki/README.md` agent-resolution sentence; `fit-wiki` SKILL.md fallback rows; published wiki-operations guide; `benchmarks/fit-wiki` fixtures; confirm-not-assume pass over composite actions and skill boot lines (already explicit). |
| Release notes | Breaking-change entry per the spec's release-posture row: required flag, removed env fallback, before/after example. Routed to `kata-release-cut` via the changelog; the version bump follows the repo's breaking-CLI procedure. |

## Interfaces

**Resolver contract** — `requireAgentFlag(options, { command, flag = "--agent" })`
returns `{ ok: true, agent }` or
`{ ok: false, code: 2, error }` where `error` names the missing flag and shows
a corrected example invocation for the failing subcommand, and never mentions
an environment variable. Handlers return the error object verbatim — exit
before any read of agent files or write of any kind.

**Hint contract** — a rule's `hint` is a static string or
`(subject, item, ctx) => string`, resolved once per finding in `applyRule`.
The findings shape (`{ id, level, path, lineNo, message, hint }`) and the text
emitter are unchanged.

**Rotate result** — `{ status: "noop", reason: "floor" | "under-budget",
lines, fromPath }` extends the existing union; `sealed`/`incomplete` arms
unchanged.

## Data flow (agent resolution, after)

```mermaid
sequenceDiagram
  participant C as Caller (agent/CI/hint)
  participant CLI as libcli dispatch
  participant H as Subcommand handler
  participant FS as Wiki tree
  C->>CLI: fit-wiki rotate [--agent X] [--force]
  CLI->>H: frozen ctx (options carry no default)
  H->>H: requireAgentFlag(options)
  alt flag missing
    H-->>C: exit 2 — error names --agent + corrected example (no FS access)
  else flag present
    H->>FS: read the one named weekly log
    alt under budget, no --force
      H-->>C: exit 2 — names target + size, no write
    else over budget, or --force (above floor)
      H->>FS: atomic seal
    end
  end
```

## Key decisions

| Decision | Chosen | Rejected alternative — why |
|---|---|---|
| Where requiredness is enforced | Handler-level shared resolver in `libwiki` | Declarative `required: true` in `libcli`: requiredness here is conditional (`release --expired` exempt; `memo` keys on `--from`), so per-handler logic is needed anyway — a shared-library contract change for one consumer buys nothing and widens blast radius. |
| Error-contract home | One resolver function, one wording, one test surface | Per-handler strings: the existing guards already drifted (`release` names `--expired` where siblings name the env var) — divergence is observed, not hypothetical. |
| `createDefinition` signature | Drop the `env` parameter | Keep it "for future use": a parameter no code path reads is the ambient-identity seam this spec exists to close; clean break per CONTRIBUTING. |
| Resolved hints | Widen the existing `hint` field to accept a function | Building hints inside `check()` items: pushes presentation into rule logic and changes the item contract every consumer reads. A parallel `hintFn` field: two fields, one meaning. |
| Under-budget guard location | Rotate handler, driven by the enriched `noop` reason | Inside `rotateIfOverBudget` core: `fix` legitimately depends on `force: true` sealing flagged word-over/line-under logs; changing core force semantics would couple the curation path to a CLI-surface policy. |
| Guard disambiguation | `reason` field on the `noop` arm | Handler re-reading the file to classify: two reads of the same file racing each other to disagree — the library already measured it. |
| Floor guard precedence | Floor check before `force` in core (status quo, asserted by test) | Handler-level floor handling: the floor must hold for every caller, including `fix`, not only the CLI. |

## Verification

The spec's success-criteria table is the acceptance suite; this design adds
the placement: fail-closed and both-env-state replays live in the existing
`cli-*.test.js` per-subcommand files, hint resolution in
`libutil/test/rules.test.js` + `audit-rules.test.js`, guard behavior in
`cli-rotate.integration.test.js`, the no-references criterion as a source
grep over `libraries/libwiki/`, and the no-bare-call-site sweep as a
repo-wide grep recorded in the implementation PR.

— Staff Engineer 🛠️
