# 330 — libskill API Cleanup

`@forwardimpact/libskill` is the derivation engine behind every Pathway product
surface: CLI commands, web pages, slides, the gRPC service adapter, and the
agent/skill pack builder. Twenty-six files across the monorepo import from it,
and it is the single point where discipline × level × track combinations become
concrete jobs, skill matrices, behaviour profiles, agent profiles, interview
guides, checklists, and toolkits. When libskill is wrong, every Pathway surface
is wrong in the same way.

An audit of the current state finds the big ideas in good shape — pure
functions, layered derivation, a well-factored policy module, clean subpath
exports — but also finds several concrete defects that have shipped and a
pervasive erosion of developer experience that makes the library harder to use
than it needs to be. This spec captures those findings and proposes the scope of
a cleanup. It is a WHAT/WHY document, not a plan.

## Why this matters now

libskill is the one library in the monorepo exempted from the OO+DI pattern
because CLAUDE.md calls it "pure-function design." That exemption only pays off
if the API is self-evidently pure and the surface is tight enough to reason
about. Today the surface is ~80 exports across a dozen modules, about half of
which are either unused in production or partially duplicated from another
module. Consumers have started building pass-through wrappers and local copies
around libskill's awkward edges, and the library's own JSDoc types have been
broken silently for long enough that IDE support across the public API has
effectively stopped working. Every new consumer is paying a tax that should not
exist.

The defects described below are each individually small enough to fix, but they
compound: duplicated function bodies diverge, silent cache hits hide stale data,
inconsistent parameter styles force consumers to context-switch on every call.
Fixing them together is cheaper than fixing them one at a time, and the
library's test coverage (16 test files, 9 more in the cross-monorepo test suite)
means a refactor can move fast without losing confidence.

## Findings

Findings are grouped by severity. Each finding names concrete files and the
shape of the fix, with the goal of enabling a planning pass (HOW) to follow
directly.

### Critical: correctness defects that have shipped

**C1. `getOrCreateJob` cache key omits `capabilities`.**
`libraries/libskill/job-cache.js:46` keys the cache only by discipline × level ×
track. But `deriveJob` returns a different shape depending on whether
`capabilities` were passed — with capabilities the job has
`derivedResponsibilities` populated, without it the array is empty. Consumers
call both flavours for the same combination: `prepareJobDetail` passes
`capabilities`, `prepareJobSummary` does not, and the pathway product's
progression and interview formatters alternate between the two. Whichever call
populates the cache first wins, and later callers silently receive a stale
shape. `validationRules` is also not in the key, so the cache cannot be reused
across frameworks that differ only in validation rules. This is a correctness
bug, not a performance issue, and it only hides because most surfaces happen to
call `prepareJobDetail` first in current flows.

**C2. `estimateBestFitLevel` silently ignores its `skills` argument.**
`libraries/libskill/matching.js:397` destructures parameters as
`{ selfAssessment, levels, _skills }` — the underscore prefix marks the
parameter as intentionally unused. Its JSDoc still documents `params.skills`,
and `matching-development.js:312` calls it with `skills: ...` as a real
argument. The value is discarded at destructuring time. The function body
already operates on self-assessment skill proficiencies alone, so the argument
is dead weight that looks live at every call site. Either the parameter is
vestigial and should be deleted, or the logic that was meant to use skills was
never wired up.

**C3. Duplicated function definitions from an incomplete refactor.**
`deriveStageTransitions`, `deriveAgentSkills`, and `deriveAgentBehaviours` are
each defined twice: once exported from `libraries/libskill/agent.js` and once as
a local or exported copy in `libraries/libskill/agent-stage.js`. The comment at
`agent.js:18` claims the latter are "thin wrappers for backward compatibility,"
but they are not wrappers — they are independent copies of the same bodies.
`deriveStageTransitions` is re-exported from the root index via `agent.js:202`,
but the internal caller at `agent-stage.js:199` uses the local copy, meaning the
two entry points already observe different implementations if the copies drift.
The refactor that split `agent.js` into `agent.js` and `agent-stage.js` was left
half-finished.

**C4. Module-level mutable cache contradicts the pure-function exemption.**
`libraries/libskill/job-cache.js:11` holds a `Map` at module scope. CLAUDE.md
lists libskill under libraries "exempt from OO+DI" because it is pure-function
design; this file is the sole counter-example. The consequences are
test-isolation fragility (tests have to remember to call `clearCache()` in
hooks), cross-test contamination when they forget, and a surprising memory
lifetime that grows unbounded for long-running processes. Combined with C1 the
cache is both unsound and architecturally misplaced: a factory
(`createJobCache()`) injected by composition roots — or no cache at all, since
`deriveJob` is cheap and consumers can memoize at their own layer — would match
the rest of libskill's design.

**C5. JSDoc type references are universally broken.** Eighty-one
`import('./levels.js').*` references across six files (`derivation.js`,
`derivation-validation.js`, `derivation-responsibilities.js`, `modifiers.js`,
`interview.js`, `interview-specialized.js`) point at a `levels.js` module that
does not exist in libskill. The types live in `@forwardimpact/map/levels`. In
every editor and every TypeScript checker, these references resolve to `any`,
which means IntelliSense on the libskill public API is effectively dead and
every consumer is writing against an untyped surface. This is the single biggest
DX regression in the library. The fix is mechanical — a global path replacement
— but nobody has done it because no consumer has strict type checking enabled to
flag the breakage.

**C6. Orphaned duplicate of job-cache inside the pathway product.**
`products/pathway/src/lib/job-cache.js` is a 90-line byte-for-byte duplicate of
`libraries/libskill/job-cache.js`, with the only difference being the
`deriveJob` import path. Nothing in the repo imports it — verified by grep. The
three `products/pathway/src/*.html` files use import maps to redirect
`@forwardimpact/libskill/job-cache` to `/model/lib/job-cache.js`, which
`products/pathway/src/commands/dev.js:162` serves directly from the libskill
package directory. The local file is dead code that also mirrors C1 and C4 —
another module-level cache to lose state in if anyone ever wires it up.

### Moderate: design smells that create consumer friction

**M1. Parameter convention is inconsistent across the API.** Multi-argument
libskill functions pick positional or destructured style with no discernible
rule, and same-shape functions go opposite ways.
`generateJobTitle(discipline, level, track)` is positional;
`deriveJob({discipline, level, track, …})` is destructured; both take the same
first three arguments in the same order. `getNextLevel(level, levels)` is
positional but `analyzeLevelProgression({…, level, levels})` is destructured.
`getSkillsByCapability(skills, capability)` is positional but
`findMatchingJobs({…, skills, …})` is destructured. Consumers cannot predict
which style a function uses without reading its source, and the API
documentation (which is broken anyway per C5) cannot help them. A single rule —
for example "destructured for ≥2 arguments, positional only for unary" — would
remove this friction at a stroke.

**M2. `isValidJobCombination` has two conflicting ways to pass level context.**
Callers pass `levels` either directly as a sibling of `validationRules`, or via
`validationRules.levels`. `derivation.js:334` passes both simultaneously
(`levels: validationRules?.levels`), `matching.js:328` passes them separately,
and `progression.js:315` passes only `levels` with no validation rules. The
shape is so awkward that `products/pathway/src/formatters/progress/shared.js:37`
wraps the function in an `isValidCombination` helper that exists solely to
forward the same arguments under a different name. When a consumer builds a
pass-through wrapper just to rename a function, the library's API shape is the
smell.

**M3. Iteration logic is duplicated between `generateAllJobs` and
`findMatchingJobs`.** Both functions walk `disciplines × levels × tracks`,
validate each combination, and call `deriveJob` on the valid ones.
`generateAllJobs` (`derivation.js:505`) loops disciplines → levels → tracks;
`findMatchingJobs` (`matching.js:325`) loops disciplines → levels for trackless
jobs and then disciplines → tracks → levels for tracked jobs, reversing the
inner order. Results differ in pre-sort order and the validate-then-derive
pipeline is re-implemented twice. `findMatchingJobs` should call
`generateAllJobs` and score each returned job, or both should share an iterator
helper.

**M4. Two implementations of the same job-key format.** `derivation.js:300`
defines a private `generateJobId` that produces
`${discipline.id}_${level.id}_${track.id}`; `job-cache.js:20` exports a
`buildJobKey` that produces the same format. If the format ever changes — which
it has to if C1 is fixed to include capabilities — both implementations have to
change in lockstep. A single shared helper would eliminate the risk.

**M5. `buildSkillTypeMap` exists for O(1) lookup but is never used where it
matters.** `derivation.js:36` documents `buildSkillTypeMap` as an optimization
that enables O(1) skill-type lookup "instead of repeated array scans." It is
exported from the root index. But `deriveSkillMatrix` (`derivation.js:180`),
which is the hot path that the optimization was designed for, still calls
`getSkillTypeForDiscipline` in its inner loop — and that function does three
`.includes()` scans across discipline skill arrays. The optimization is
exported, tested, and completely bypassed. Either wire it into
`deriveSkillMatrix` and delete the public export, or delete `buildSkillTypeMap`
entirely. Having it exist but be ignored is the worst of both worlds.

**M6. `applyFilters` detects operation type by probing the function at
runtime.** `policies/filters.js:84` distinguishes predicates from matrix filters
by calling each operation once with `[{}]` as a probe and inspecting the return
type. This is clever but fragile: every filter runs once extra on a bogus input
per call, a filter that throws on empty input will break the whole pipeline, and
the contract between the policy layer and its callers depends on the shape of a
probe response. Either split into explicit
`applyPredicates`/`applyMatrixFilters` APIs, or tag operations
(`matrixFilter(fn)` returns a marked function), or require all operations to
have the same `(matrix) => matrix` signature and offer `filterBy(predicate)` as
the adapter.

### Minor: housekeeping

**H1. The root `index.js` re-exports ~40% dead weight.** Cross-referencing the
root export list against production usage shows that roughly half of the ~80
root exports are used only in libskill's own tests or internally within libskill
itself. Examples: `buildSkillTypeMap` (M5), `findMaxBaseSkillProficiency`,
`getLevelRank`, `isSeniorLevel`, `calculateDriverCoverage`,
`prepareBaseProfile`, `prepareAgentProfile`, `deriveShortInterview`,
`deriveBehaviourQuestions`, `deriveFocusedInterview`, `GAP_SCORES` (alias for
`SCORE_GAP`, both exported), `MatchTier`, `CONFIG_MATCH_TIER`, and nearly every
individual `WEIGHT_*`, `LIMIT_*`, and predicate (`isPrimary`, `isSecondary`,
`hasMinLevel`, `allOf`, `anyOf`, `not`). Each dead export is a hazard: it has to
be preserved across refactors, it inflates the apparent surface area for new
consumers reading the index, and it mis-signals what the library is _for_. A
reduced index and `@internal` annotations on anything not needed outside
libskill would make the real API obvious.

**H2. The index re-exports policies twice.** Root `index.js:140` re-exports the
policy surface for "convenience," and consumers can also import from
`@forwardimpact/libskill/policies`. Both paths are in use. Pick one — the
subpath is the documented way and avoids inflating the root index.

**H3. Pathway consumers alternate between root and subpath imports
inconsistently.** Some files use `@forwardimpact/libskill/derivation`; others
import the same symbols from the root. Unified convention would make grep-based
navigation easier and make unused-export detection feasible.

## What a good outcome looks like

After this cleanup, a new consumer reading the root `index.js` should see a
deliberate, documented surface of functions they are expected to call. The JSDoc
should point at real type modules and light up IntelliSense across the public
API. Every multi-argument function should take a destructured object. There
should be one way to pass validation rules. `getOrCreateJob` should either key
the cache correctly or be replaced with an injected cache factory. The
duplicated `deriveStageTransitions` and agent helpers should exist in one file.
`estimateBestFitLevel` should have a signature that matches its callers. The
pathway product's orphan `job-cache.js` should be gone.

None of this changes the library's behaviour for any production call site that
is not exercising a silent bug — the derivation, matching, progression, and
agent-generation logic is correct. The cleanup is entirely about shape: making
the API honest about what it is, what it requires, and what it returns.

## Out of scope

This spec does not propose rewriting the derivation engine, changing match
scoring semantics, introducing TypeScript, changing the policy abstraction,
splitting libskill into sub-packages, or touching `@forwardimpact/map`. It
proposes fixing the defects listed above and aligning the surface. Larger
questions about libskill's long-term architecture — for example whether the
interview, checklist, and toolkit modules belong in libskill at all — are worth
asking but are a separate spec.
