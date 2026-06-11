# Design 1460-a — Build-time enumeration-drift assertion

Spec: [`spec.md`](spec.md) — assert that every registered consumer's
enumeration block matches its source-of-truth set, failing the build
with an actionable message on drift.

Substrate: repo invariants are declarative `*.rules.mjs` modules under
`.coaligned/invariants/`, discovered and run by `bunx coaligned
invariants` (`bun run invariants`, the `invariants` job of Quality CI
on every PR). This design adds one rule module plus one adjacent
registry data file to that host — no new build step, no new wiring.

## Components

```mermaid
flowchart LR
  REG[Topic registry<br/>enumeration-drift.topics.yml] --> B
  subgraph M[enumeration-drift.rules.mjs]
    B[build: probes + consumer parser] --> S[subjects + ctx]
    S --> RU[rules: drift checks]
    SEED[seed: canonical fence bodies]
  end
  FS1[(services/ libraries/ products/<br/>.claude/skills/ .github/workflows/)] --> B
  FS2[(.github/CLAUDE.md sibling table)] --> B
  FS3[(CONTRIBUTING.md CLAUDE.md KATA.md<br/>websites/**)] --> B
  HOST[bunx coaligned invariants<br/>libcoaligned host · Quality CI] --> M
  RU --> F[findings → writeFindings → exit 1]
```

| Component | Responsibility | Placement |
|---|---|---|
| **Topic registry** | One declarative data file: every topic carries a `source` (glob or selector + optional `exclude`) and a `consumers[]` list with per-consumer `property` ∈ {`count`, `list`, `both`}. The single named registry path the spec's single-source criterion verifies; a 7th topic is a one-file edit. The plan picks the exact YAML schema | New `.coaligned/invariants/enumeration-drift.topics.yml`, adjacent to its module exactly as `ambient-deps.allow.yml` sits beside `ambient-deps.rules.mjs` |
| **Rule module** | Default export `{ name: "enumeration-drift", build, rules, seed }` per the libcoaligned host contract. The host auto-discovers `*.rules.mjs` — landing the file is the wiring | New `.coaligned/invariants/enumeration-drift.rules.mjs` |
| **Source probes** | Per-topic pure function inside `build()`: registry source → canonical sorted set of identifiers. Probes own normalisation (basenames, table-row filtering); five are filesystem globs over the shared `lib/walk.mjs` `collectFiles`, the sixth parses the `.github/CLAUDE.md` § Third-party actions table. Adding a 7th probe is the plan's path | Inside the rule module |
| **Consumer parser** | Inside `build()`: reads each registered consumer, locates fenced enumeration blocks under the marker convention, returns the observed value per block; ignores fences inside fenced-code regions so docs documenting the convention do not self-trigger | Inside the rule module |
| **Subjects + ctx** | `build()` returns one subject per registry assertion (consumer path × declared property, carrying expected set and observed value or fence-absence) plus one subject per discovered fence (for unknown-topic detection); registry parse/IO errors become a registry-path subject rather than a throw, mirroring `ambient-deps`'s parse-error pattern, so authors never see a raw stack | `build()` return value |
| **Drift rules** | Declarative `rules[]` entries the shared `runRules` engine applies over the subjects; each emits a finding `{ id, level, path, message, hint }` that the host prints via `writeFindings` and converts to exit 1 | `rules[]` in the module |
| **Seed output** | `seed()` prints the canonical fence body per topic from current probe output; `bunx coaligned invariants --seed enumeration-drift` seeds the hand-authored fence bodies at landing, the same affordance `ambient-deps` uses for its deny-list | `seed()` in the module |

The plan owns the YAML schema, fence-body grammar, sort definition
for list blocks, empty-list/sub-bullet rules, and any decomposition
into the existing `.coaligned/invariants/lib/` helpers. Those are HOW
questions.

## Marker convention

Every registered consumer carries a fenced block per asserted
property:

```
<!-- enum:services-tree:list -->
…content the plan defines…
<!-- /enum -->
```

- `TOPIC` is one of the six registry topic ids
  (`services-tree`, `libraries-list`, `sibling-composite-actions`,
  `published-skills`, `products-tree`, `kata-workflows`).
- `PROPERTY` is `count` or `list`.
- Consumers asserting `both` carry two adjacent fences, one per
  property. The registry's per-consumer `property` says which
  fences must exist on each path; a missing required fence is a
  drift just as a wrong value is.
- Fences do not nest. The parser pairs each open fence with the
  next bare `<!-- /enum -->` outside any fenced-code region.

The fence is invisible in rendered HTML, so reader pages keep their
narrative shape. The `enum:` prefix does not collide with `libdoc`'s
`<!-- part:type:path -->` content-partial token — different prefix,
and that token is single-shot rather than a fence pair; the two
parsers ignore each other's markers.

## Landing strategy

The implementation PR is **atomic**: it introduces the registry, the
rule module, **and** every required consumer fence in one diff.
`--seed enumeration-drift` output at the landing PR's `HEAD` supplies
the seed values for the hand-authored fence bodies, so the gate is
green on its own merge. There is no two-step landing where fences
arrive in a follow-up PR — `bun run invariants` would block the
implementation PR itself.

Spec criterion "Existing consumers pass at landing" is therefore
falsifiable before merge: `bun run invariants` on the implementation
branch must exit 0 against `main` HEAD, and the plan's `Affected
paths` declaration must include every modified consumer file
alongside the new module and registry files.

## Failure modes and diagnostics

| Failure mode | Rule | Author-visible finding |
|---|---|---|
| Required fence missing on a registered consumer | `enum.fence-missing` | `<consumer-path> :: <topic>:<property> :: required fence not found` |
| Fence with an unknown `TOPIC` id (typo, vestigial) | `enum.unknown-topic` — hard-fail, never silent-ignore | `<consumer-path> :: <topic> :: unknown topic; remove the fence or add the topic to the registry` |
| `list` drift | `enum.list-drift` | `<consumer-path> :: <topic>:list :: missing=[…] extra=[…]` |
| `count` drift | `enum.count-drift` | `<consumer-path> :: <topic>:count :: actual=<n> expected=<m>` |
| Source-side-only PR (a registered source changed; no consumer file in the PR diff) | same drift rules | Same shape as a consumer-side drift; the finding names the consumer path the author must touch to land the source change, satisfying the spec's "actionable" criterion when the failing path is outside the PR diff |
| Malformed registry, unreadable consumer, probe failure | `enum.registry-invalid` | Finding on the registry (or consumer) path with the reason — `build()` maps internal errors to subjects, so no raw stack reaches the author |
| Registered topic with zero registered consumers | none — vacuous pass | Gate green; spec § Excluded "Adding a 7th topic happens through a content edit to one file" means a new topic can land before its first consumer wires up |
| Unregistered consumer that paraphrases a registered topic | none — not detected | Accepted residual risk per spec § Excluded "Automatic registry updates"; addressed by amending the registry when a future drift surfaces |

The implementation PR description names exactly one build
invocation: `bun run invariants` (→ `bunx coaligned invariants`).
Rule ids are internal handles; the host command is the single named
build step the toolchain already calls.

## Key decisions

| Decision | Choice | Rejected alternative | Why |
|---|---|---|---|
| Gate placement | Rule module under `.coaligned/invariants/`, hosted by `bunx coaligned invariants`, which Quality CI's `invariants` job runs on every PR with no path filter | (a) `fit-doc` pre-build hook via the `justfile` `just build` shim; (b) standalone script + root `package.json` entry | (a) fires only on PRs that rebuild a site, missing source-side-only edits to `services/`, `libraries/`, or `.github/CLAUDE.md`; the invariants job covers those for free. (b) is the pattern PR #1639 deleted — reintroducing a one-off script forks the repo's single invariant idiom and re-creates the aggregate-wiring this substrate removed |
| Registry shape | Adjacent declarative YAML data file; no other file in the diff declares a topic | Topics declared inline in the rule module | Spec landing gate requires a single named registry path and that a 7th-topic PR edits exactly one file; a data file keeps registry edits content edits, makes the single-source criterion mechanically checkable, and follows the `ambient-deps.allow.yml` config-beside-module precedent. The schema admits a per-source `exclude` list so Topic 6's `kata-interview.yml` exclusion is registry-side data, not probe code |
| Marker convention | HTML comment fences `<!-- enum:TOPIC:PROPERTY -->…<!-- /enum -->` applied uniformly across every registered consumer, including the unnamed-section consumers (`websites/fit/gear/index.md`, `websites/kata/index.md`) | Unique section heading per topic per consumer; fenced YAML metadata block | Section headings are fragile to prose rewrites and cannot delimit count-only blocks; fenced YAML blocks render visibly. HTML comments are invisible in rendered output and the spec's "applies it uniformly … including unnamed-section consumers" criterion is met by construction |
| Per-consumer property declaration | Registry entry declares `count`, `list`, or `both`; consumer must carry exactly the declared fence(s) | Auto-detect property from the block | Auto-detection conflates "block missing" with "block wrong shape." Explicit declaration lets findings name the missing property |
| Source-side PR scope | Gate runs on every PR via the invariants job, catching source-side-only PRs before merge | Run only on PRs that touch a registered consumer path | Symmetric coverage costs nothing extra and removes the failure mode where a source-side PR lands clean and the next consumer-touching PR inherits red CI |
| Landing migration | Implementation PR atomically introduces registry, module, and every consumer fence; `--seed` output at `HEAD` seeds the hand-authored fence bodies | Two-step landing (gate first, then consumer fences) or auto-generated fence bodies | Two-step lands the gate red on its own merge. Auto-generation removes the human's chance to phrase the count or list context naturally and would require a `--fix` mode the spec does not ask for; the host's existing `--seed` affordance gives machine-accurate values with human-authored placement |
| Failure-message shape | One finding per drift through the host's `writeFindings` — `{ id, level, path, message, hint }` naming consumer path + topic + property + diff (set sym-diff for `list`, integer delta for `count`); identical shape for source-side drifts and internal errors | Custom formatter or aggregated "see logs" summary | Spec criterion "Failure messages are actionable" requires the author can correct in one edit; per-finding shape gives that for every failure mode, and reusing the host's emitter keeps output uniform with every other invariant |

— Staff Engineer 🛠️
