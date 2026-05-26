# plan-a(910): Pathway agent `--level` flag

Implementation plan for [spec(0910)](spec.md) per [design-a](design-a.md). Adds
the missing `--level` calibration knob to `fit-pathway agent`, opening the
expectations seam in `interpolateTeamInstructions` while preserving SC2
byte-identity for invocations that omit the flag.

## Approach

Declare `--level=<id>` on the `agent` CLI definition symmetric with `--track`.
In `runAgentCommand`, resolve the user-supplied id through the existing
`requireEntity` helper against `data.levels`; fall through to
`deriveReferenceLevel` when the flag is absent. Skills, behaviours, and the
profile already accept and consume the resolved level — leave those call sites
unchanged. The new seam is the two `interpolateTeamInstructions` call sites
inside `runAgentCommand`: pass the resolved `level` **only** when
`options.level` was explicit. Gating expectations on the explicit flag, not on
the entity, is the seam that preserves SC2 byte-identity when the user-visible
behaviour today does not change. Design § Risk 2 delegates the expectations
rendering rules to this plan: a `## Level Expectations` section composed of one
bullet per populated `expectations` key (`impactScope`, `autonomyExpectation`,
`influenceScope`, `complexityHandled`), inserted between the interpolated
`teamInstructions` body and the `## Organizational Context` section that
`formatTeamInstructions` appends.

Libraries used: none (modifies existing `libskill` export; CLI option declared
inline against the existing `libcli` definition).

## Constraints (apply across the plan)

| #   | Constraint                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 | The `interpolateTeamInstructions` call shape **must not change** at the two out-of-scope sites (`products/pathway/src/commands/build-packs.js:114` and `products/pathway/src/pages/agent-builder-preview.js:129`). `git diff origin/main -- products/pathway/src/commands/build-packs.js products/pathway/src/pages/agent-builder-preview.js` is empty at every commit in the plan, and `grep -n interpolateTeamInstructions products/pathway/src` outside `commands/agent.js` reports exactly those two pre-change shapes. |
| C-2 | SC2 byte-identity tests stay passing without fixture edits. `agent-baseline.test.js` case 1 (absent slot, no `--level`) reads `claude-md-baseline-se-platform.md` unchanged; case 2 (populated starter, no `--level`) keeps its tiAnchor → `## Organizational Context` ordering. Both cases run with `options.level` absent, so `levelForInstructions` is `null` and the new section never appears. |
| C-3 | The `--level` libcli option carries the identical key set as the existing `--track` entry on the same command: `{ type: "string", description: "<one line>" }`. No `default`, no `short`, no `choices`. Verifies SC6 by construction.                                                                                                                                                                                                                |
| C-4 | Level resolution runs **before** the `options.skills` and `options.tools` short-circuits, so `--skills` and `--tools` honour the explicit level too (already passed through `deriveAgentSkills` today).                                                                                                                                                                                                                                                      |
| C-5 | `options.list` short-circuit precedes level resolution. `--level` together with `--list` is silently ignored; the SC1 test directly covers this by asserting `--level=BOGUS --list` exits 0 with the same combinations as plain `--list`.                                                                                                                                                                                                                                |

## Steps

### Step 1 — Declare `--level` on the `agent` CLI definition

- **Created**: —
- **Modified**: `products/pathway/bin/fit-pathway.js`
- **Deleted**: —

Insert a `level` entry inside the `agent` command's `options` block,
immediately after `track` (preserves `--help` slot adjacency for SC6):

```js
options: {
  track: { type: "string", description: "Track specialization" },
  level: { type: "string", description: "Level calibration (see `fit-pathway level --list`)" },
  output: { type: "string", description: "Output directory for generated files" },
  skills: { type: "boolean", description: "Output skill IDs" },
  tools: { type: "boolean", description: "Output tool names" },
},
```

The description is level-id-agnostic; downstream installations may rebrand
their level ladder via standard YAML without making the `--help` text wrong.

Verify SC4 + SC6 via a single capture:

```sh
bunx fit-pathway agent --help | grep -nE '^\s*--(track|level)='
```

Output must show two lines, in order, both under the same options heading
(line numbers within ±1 line of each other), shape
`/^\s*--(track|level)=<string>\s+[^\n]+$/` — same `--name=<type>` shape and a
non-empty one-line description.

### Step 2 — Resolve level and gate expectations threading in `runAgentCommand`

- **Created**: —
- **Modified**: `products/pathway/src/commands/agent.js`
- **Deleted**: —

Inside `runAgentCommand` (between `resolveAgentEntities(...)` and the
`options.skills` short-circuit per C-4), replace the single line
`const level = deriveReferenceLevel(data.levels);` with:

```js
let level;
let levelForInstructions = null;
if (options.level) {
  level = data.levels.find((l) => l.id === options.level);
  requireEntity(
    level,
    `Unknown level: ${options.level}`,
    "Available levels:",
    data.levels,
  );
  levelForInstructions = level;
} else {
  level = deriveReferenceLevel(data.levels);
}
```

The existing `level` param threaded into `deriveAgentSkills`,
`deriveAgentBehaviours`, and `generateAgentProfile` is unchanged in shape and
position; the new `levelForInstructions` is the explicit-only thread.

There are exactly two `interpolateTeamInstructions` call sites in `agent.js`:
one in `printTeamInstructions` at line 138 (stdout path) and one in
`handleAgent` at line 253 (file-output path). Each is rewritten to receive
`level: levelForInstructions`.

`printTeamInstructions` — decouple the header decision from the composed
return string. The existing ternary picks "Team Instructions" / "+
Organizational Context" / "Organizational Context" from `teamInstructions`
truthiness; after this change, `teamInstructions` may also carry the
`## Level Expectations` block alone (when `agentTrack.teamInstructions` is
absent), and the existing chain would mislabel the stdout block as
"Organizational Context". Recompose the header from an explicit "team
instructions content (track body OR level expectations) is present" boolean
so the umbrella label remains accurate. Signature gains a fifth positional
`levelForInstructions`:

```js
// before
function printTeamInstructions(agentTrack, humanDiscipline, orgSection, template) {
  const teamInstructions = interpolateTeamInstructions({ agentTrack, humanDiscipline });
  const content = formatTeamInstructions(teamInstructions, orgSection, template);
  if (!content) return;
  const header =
    teamInstructions && orgSection
      ? "# Team Instructions + Organizational Context (CLAUDE.md)"
      : teamInstructions
        ? "# Team Instructions (CLAUDE.md)"
        : "# Organizational Context (CLAUDE.md)";
  // …print header + content…
}

// after
function printTeamInstructions(
  agentTrack,
  humanDiscipline,
  orgSection,
  template,
  levelForInstructions,
) {
  const teamInstructions = interpolateTeamInstructions({
    agentTrack,
    humanDiscipline,
    level: levelForInstructions,
  });
  const content = formatTeamInstructions(teamInstructions, orgSection, template);
  if (!content) return;
  const hasTeamInstructionsContent = Boolean(teamInstructions);
  const hasOrgSection = Boolean(orgSection);
  const header =
    hasTeamInstructionsContent && hasOrgSection
      ? "# Team Instructions + Organizational Context (CLAUDE.md)"
      : hasTeamInstructionsContent
        ? "# Team Instructions (CLAUDE.md)"
        : "# Organizational Context (CLAUDE.md)";
  // …print header + content…
}
```

The umbrella label "Team Instructions" applies whenever either the track body
or the level expectations contributes content, since the rendered file
contains both layers as "team instructions" in the published-guide sense.
The `# Organizational Context` branch fires only when both layers are empty
and `orgSection` is the sole content — the pre-change semantics.

`handleAgent` — add `levelForInstructions` to the destructured params object.
Replace the single `interpolateTeamInstructions({ agentTrack, humanDiscipline })`
call at line 253 with the `level: levelForInstructions` form. Update the
`printTeamInstructions(agentTrack, humanDiscipline, orgSection, claudeTemplate)`
call to pass `levelForInstructions` as the fifth positional.

`runAgentCommand`'s call to `handleAgent({...})` at line 366 gains
`levelForInstructions` alongside `level`.

Verify:

- `git diff origin/main -- products/pathway/src/commands/agent.js` shows
  changes only inside `runAgentCommand`, `handleAgent`, and
  `printTeamInstructions`.
- `git diff origin/main -- products/pathway/src/commands/build-packs.js products/pathway/src/pages/agent-builder-preview.js`
  is empty (C-1).
- `grep -n 'interpolateTeamInstructions(' products/pathway/src` outside
  `commands/agent.js` (i.e., excluding the import lines via
  `| grep -v '^[^:]*:.*[ ,{]interpolateTeamInstructions,*$'`) shows exactly
  two pre-change call shapes: `build-packs.js:114` and `agent-builder-preview.js:129`.

### Step 3 — Extend `interpolateTeamInstructions` to compose expectations

- **Created**: —
- **Modified**: `libraries/libskill/src/agent.js`
- **Deleted**: —

Add a private `renderLevelExpectations(level)` helper (not exported) and
update the existing exported `interpolateTeamInstructions` to consume an
optional `level`:

```js
// Keys mirror products/map/starter/levels.yaml expectations schema.
// Adding a new key to that schema requires a matching entry here.
function renderLevelExpectations(level) {
  const e = level?.expectations;
  if (!e || typeof e !== "object") return null;
  const bullets = [];
  if (e.impactScope) bullets.push(`- **Impact scope:** ${e.impactScope}`);
  if (e.autonomyExpectation) bullets.push(`- **Autonomy:** ${e.autonomyExpectation}`);
  if (e.influenceScope) bullets.push(`- **Influence scope:** ${e.influenceScope}`);
  if (e.complexityHandled) bullets.push(`- **Complexity:** ${e.complexityHandled}`);
  if (bullets.length === 0) return null;
  return `## Level Expectations\n\n${bullets.join("\n")}\n`;
}

export function interpolateTeamInstructions({
  agentTrack,
  humanDiscipline,
  level,
}) {
  const ti = agentTrack?.teamInstructions
    ? substituteTemplateVars(agentTrack.teamInstructions, humanDiscipline)
    : null;
  const expectations = level ? renderLevelExpectations(level) : null;
  if (!ti && !expectations) return null;
  if (ti && expectations) return `${ti}\n\n${expectations}`;
  return ti || expectations;
}
```

Notes for the implementer:

- The `ti && !expectations` branch returns the same string the current
  function returns for the same inputs (SC2 byte-identity for absent `--level`).
- `formatTeamInstructions` still appends `orgSection` after the composed
  return, so the org-context guide's "last `## Organizational Context`
  occurrence" marker contract is preserved by construction — the new section's
  heading is `## Level Expectations`, not `## Organizational Context`.
- Keys are enumerated explicitly (not iterated via `Object.entries`) so a
  future starter that adds an unrecognised key to `expectations` produces a
  test failure (Step 4 case unknown-key) rather than silently dropping the
  key. See Risk row 3.

Verify: `bun test libraries/libskill` exits 0; existing libskill tests green.

### Step 4 — Add libskill unit tests for `interpolateTeamInstructions`

Cover the shape combinations Risk 2 names, plus the null-input baseline and an
unknown-key guard.

- **Created**: `libraries/libskill/test/agent-team-instructions.test.js`
- **Modified**: —
- **Deleted**: —

Test shape (node:test, constructed inputs — no starter dependency):

| Case | `agentTrack.teamInstructions` | `level.expectations`                                          | Expected return                                                                       |
| ---- | ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A    | populated                     | omitted (`level` arg undefined)                               | interpolated `teamInstructions` body unchanged                                        |
| B    | populated                     | populated (all 4 keys)                                        | `${ti}\n\n## Level Expectations\n\n- **Impact scope:** …`                             |
| C    | absent                        | populated                                                     | the `## Level Expectations` section alone                                             |
| D    | absent                        | omitted                                                       | `null`                                                                                |
| E    | populated                     | `level` present but `expectations: {}`                        | **byte-equal to case A** (empty expectations suppressed, no trailing `\n\n`)          |
| F    | populated                     | only `impactScope` populated                                  | only the Impact-scope bullet appears under the heading                                |
| G    | populated                     | object with `impactScope` AND an unknown key (`futurismScope`) | section contains the Impact-scope bullet; **does not** contain `futurismScope` text — guards against future schema additions silently leaking through |

Verify: `bun test libraries/libskill/test/agent-team-instructions.test.js`
exits 0; 7 tests pass.

### Step 5 — Add pathway integration tests for SC1 / SC3 / `--list` interaction

End-to-end coverage for the new flag through `runAgentCommand`.

- **Created**: `products/pathway/test/agent-level.test.js`
- **Modified**: —
- **Deleted**: —

Mirror the `agent-command.test.js` staging pattern: `stageDataDir` copies the
starter into a temp dir; `runAgent` accepts a `levelId` and passes
`options: { track: "platform", level: levelId, output: outputDir }` to
`runAgentCommand`. To isolate SC1 to the expectations field (avoid org-context
noise in the byte-comparison assertions), `stageDataDir` removes
`organizational-context.yaml` from the staged copy before each test run —
mirrors `agent-baseline.test.js` case 1.

The existing `silent` helper only patches `console.log`. The new tests need
stub helpers that intercept `process.stdout.write` (for the `--list` path) and
`process.stderr.write` (for the `--level=BOGUS` path). Add helpers in the new
test file:

```js
function captureWrite(stream) {
  const original = stream.write.bind(stream);
  const chunks = [];
  stream.write = (chunk) => { chunks.push(String(chunk)); return true; };
  return {
    restore: () => { stream.write = original; },
    text: () => chunks.join(""),
  };
}
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
```

ANSI handling: `libcli` `formatError` (via `libcli/src/color.js`) gates colour
on `process.stdout?.isTTY` — when running under a TTY both stdout and stderr
output may carry escapes. Assertions on captured text run `stripAnsi(...)`
first so the test is TTY-independent. Stub `process.exit` to throw
`new Error(`exit ${code}`)`, asserted via `assert.rejects`. Restore both
`process.exit` and any captured stream in `finally` to guard against
cross-test pollution; in tests that run two captures (LIST baseline vs
BOGUS), each capture's `restore()` must run before the next `captureWrite()`
or the second capture sees the first capture's stub as the "original."

| Test       | Asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC1-file   | Two runs against the same staged starter (org-context removed) — `levelId = "J040"` then `levelId = "J060"`, both with `output: outputDir`. Read `.claude/CLAUDE.md` from each `outputDir`. Assert the two files differ byte-for-byte; assert J060 output contains `- **Impact scope:** Features and small projects`; assert J040 output contains `- **Impact scope:** Individual tasks with guidance` (anchors verbatim from `products/map/starter/levels.yaml`). Assert J060 output contains BOTH the starter's platform teamInstructions anchor text (`"Treat the platform as a"`) AND the `## Level Expectations` heading, with the heading appearing AFTER the anchor — guards against the header-picker / composition-order regression. |
| SC1-stdout | Staged starter with `organizational-context.yaml` **removed** (matches SC1-file staging — keeps the header assertion deterministic regardless of the starter's org-context contents at the time the test runs). One run with `levelId = "J060"`, **no** `output` option (stdout path). Capture `process.stdout.write` via the helper. Assert captured text contains `## Level Expectations`, contains `# Team Instructions (CLAUDE.md)`, and does **not** contain `# Team Instructions + Organizational Context` (org-context was removed) — guards the umbrella-label rewrite in Step 2 and Risk row 2.                                                                                                                                                                                                                                                                                                                                                |
| SC3a       | Stage starter, leave org-context as shipped. Run with `levelId = "BOGUS"`. Apply `stripAnsi` to captured stderr, then assert it matches (in order) `/Unknown level: BOGUS/`, `/Available levels:/`, and bulleted lines containing `J040` and `J060`. Assert `runAgentCommand` rejects with the stubbed `Error(`exit 1`)`.                                                                                                                                                                                                                                                                                                                                                            |
| SC3b       | Regression: `levelId = undefined`, `trackId = "BOGUS"`. Apply `stripAnsi` then assert the `--track` rejection still produces its existing error shape (`Unknown track: BOGUS` then `Available tracks:` …). Confirms the shared `requireEntity` helper was not broken in Step 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| LIST       | `args: []`, `options: { list: true, level: "BOGUS" }`. Capture stdout via the helper; restore before capturing the baseline (see ANSI-handling paragraph). Assert captured stdout matches the captured stdout of a parallel `args: [], options: { list: true }` run (baseline). No `process.exit` rejection — `--list` short-circuit precedes level resolution (C-5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Verify: `bun test products/pathway/test/agent-level.test.js` exits 0; 5 tests pass.

### Step 6 — Confirm SC2 baseline regression intact

No code edits — guard step.

- **Created**: —
- **Modified**: —
- **Deleted**: —

Command:

```sh
bun test products/pathway/test/agent-baseline.test.js
```

Verify: both existing cases pass without fixture edits (C-2). Case 1 (absent
slot, no `--level`) re-runs against `claude-md-baseline-se-platform.md`
unchanged; case 2 (populated starter, no `--level`) still finds the org-context
section appended after the `tiAnchor`. Both invocations omit `--level`, so
`levelForInstructions=null` and the new section never appears. If either case
diverges, Step 2's "pass `level` only when explicit" gating is wrong.

### Step 7 — Update `agent-teams/index.md` guide with `--level`

- **Created**: —
- **Modified**: `websites/fit/docs/products/agent-teams/index.md`
- **Deleted**: —

Confirm the target heading exists:

```sh
grep -n '^## Preview the agent configuration$' websites/fit/docs/products/agent-teams/index.md
```

Insert a new H3 subsection (`### Calibrate the agent's level`) **after** the
existing prose block under `## Preview the agent configuration` and **before**
the `## Generate the agent team` heading. Section carries:

- One sentence framing: the `--level` flag picks which level's expectations
  the generated agent encodes; without it, Pathway selects a default level
  based on core-skill proficiency.
- One worked invocation:

  ```sh
  npx fit-pathway agent software_engineering --track=platform --level=J060
  ```

- One sentence answering "when do I set this explicitly?" — when generating
  agents that should meet different expectations (separate profiles for a
  J040 vs. J060 engineer on the same team).
- One sentence stating: when omitted, output is byte-identical to today's
  default-resolved behaviour.

Verify: file contains one occurrence of `--level=J060` in a code block and one
of `--level` in body prose; `## Generate the agent team` heading still follows
the new section; `bun run check` exits 0.

### Step 8 — Update `organizational-context/index.md` guide with `--level` note

- **Created**: —
- **Modified**: `websites/fit/docs/products/agent-teams/organizational-context/index.md`
- **Deleted**: —

Confirm the target heading exists:

```sh
grep -n '^## Place guidance in the correct layer$' websites/fit/docs/products/agent-teams/organizational-context/index.md
```

Insert two paragraphs **after** the existing "Who needs it" table (and before
`Preview what Pathway generates for a given role to confirm placement:`)
covering:

- One sentence introducing `--level` as the per-invocation calibration surface
  — distinct from `teamInstructions` (per-track-shared) and the org-context
  slot (per-installation).
- One worked invocation showing the three-axis pattern:

  ```sh
  npx fit-pathway agent software_engineering --track=platform --level=J060
  ```

- One sentence answering "when do I set `--level` explicitly?" — when two
  agents on the same team must reflect different role-level expectations, run
  the command once per level rather than encoding the difference in
  `teamInstructions` (which contaminates every team using the track).

Verify: file contains one `--level=J060` invocation; the `## Place guidance in
the correct layer` heading and its table are byte-unchanged in structure;
`bun run check` exits 0.

### Step 9 — Capture SC5 evidence

Spec SC5 requires the documented invocation (J060 in the guides) differ from
the same command without `--level` on at least one SC1 field. The
`--level=J060` invocation threads expectations (gating), while the absent-flag
invocation does not — so the explicit case produces the `## Level
Expectations` section and the absent case does not, even though both
default-resolve to the same level entity in the shipped starter.

- **Created**: —
- **Modified**: —
- **Deleted**: —

Commands (run from the repo root; evidence captured in the PR body):

```sh
NO_FLAG=$(mktemp -d -t 910-no-flag.XXXXXX)
EXPLICIT=$(mktemp -d -t 910-explicit.XXXXXX)
bunx fit-pathway agent software_engineering --track=platform \
  --data "$PWD/products/map/starter" --output "$NO_FLAG" > /dev/null
bunx fit-pathway agent software_engineering --track=platform --level=J060 \
  --data "$PWD/products/map/starter" --output "$EXPLICIT" > /dev/null
diff "$NO_FLAG/.claude/CLAUDE.md" "$EXPLICIT/.claude/CLAUDE.md"
```

Verify: `diff` exit code is non-zero; the divergence is exactly the appended
`## Level Expectations` section present in the explicit output and absent in
the no-flag output.

### Step 10 — Run the full check suite

End-to-end closure.

- **Created**: —
- **Modified**: —
- **Deleted**: —

Commands, in order:

1. `bun run format`
2. `bun run check`
3. `bun test`

Verify: each exits 0. Particular regressions to watch — `build-packs.test.js`,
`agent-builder-install.test.js`, and the existing `agent-command.test.js`
cases 1–7.

## Risks

| Row | Risk                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Starter `levels.yaml` ships only `J040` and `J060` today. The SC1 test hard-codes both ids; if either is renamed or removed in a future starter edit, the test fails loudly at import time. No silent passes.                                                                                                                                                                |
| 2   | The two `interpolateTeamInstructions` call sites in `agent.js` are syntactically identical today; a half-edit risks divergent stdout-vs-file output, and the existing header-picker in `printTeamInstructions` couples header text to the now-composed return value. The `hasTeamInstructions` boolean (Step 2) and the SC1-stdout test (Step 5) both guard against this.    |
| 3   | `renderLevelExpectations` enumerates four `expectations` keys. A downstream installation that extends `expectations` with a custom key will see it silently dropped. Step 4 case G asserts this — but the assertion is a guard, not a fix; if the schema ever changes, the helper, the unit test, and possibly the two published guides must update in lockstep. |

## Execution

Single-agent sequential — land Step 3 (library signature extension) before
Step 2 (caller pass-through), so `bun test` stays green at every commit. Steps
4 and 5 (tests) follow their respective code changes. Steps 7 + 8 (docs) are
independent of code and can run in any order. Step 9 (SC5 evidence) requires
Steps 1–3 complete. Step 10 closes after all prior steps.

Route to `staff-engineer` via `kata-implement` on branch
`feat/spec-0910-pathway-agent-level-flag`. No parts decomposition.

— Staff Engineer 🛠️
