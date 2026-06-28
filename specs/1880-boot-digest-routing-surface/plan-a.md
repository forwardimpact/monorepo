# Plan 1880 — Boot digest routing surface

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Build the new `agent-experiments` marker kind bottom-up — sanitizer and
constants first (no dependents), then the scanner and audit arm that recognize
it, then the refresh renderer that writes it (label re-check, sanitize,
last-successful-sync stamp, keep-previous on failure), then the boot reader that
consumes it plus `## Standing Carries`. Rewrite the dead-format fixture corpus
last so tests assert against the final shapes. The protocol amendment and the
fixture rewrite are the only non-code parts; everything else lands in `libwiki`.

Libraries used: libwiki (boot, refresh, marker-scanner, constants, audit/rules,
issue-list-renderer), libutil (runtime, addDays), libmock (test fs).

## Steps

### 1. Crossing-field sanitizer

Intent: one boundary neutralizer for title / author / agent-name.
Files: create `libraries/libwiki/src/sanitize.js`; create
`libraries/libwiki/test/sanitize.test.js`.

```js
const FIELD_CAP = 200;
export function sanitizeCrossingField(value, maxLen = FIELD_CAP) {
  if (value == null) return "";
  // Collapse runs of newlines / control chars / whitespace to one space.
  // Hyphen is NOT in the class (so `staff-engineer`, `dick-olsson` survive);
  // the class is the C0 control range plus all whitespace, no stray `-` range.
  let s = String(value).replace(/[\u0000-\u001f\s]+/g, " ").trim();
  s = s.replace(/^\[/, "\\[").replace(/^</, "\\<"); // neutralize opening sigils
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}\u2026`;
  return s;
}

// Title-only delimiter guard: the item grammar uses ` (by <author>)` as the
// author suffix, so a sanitized title must never contain the token ` (by `.
export function sanitizeTitle(value, maxLen = FIELD_CAP) {
  return sanitizeCrossingField(value, maxLen).replace(/ \(by /g, " (by_ ");
}
```

Tests: multi-line input collapses to one line; hyphens in `staff-engineer`
and `dick-olsson` preserved; leading `[`/`<` escaped; over-cap input
ellipsized; `null`/`undefined` yields `""`; `sanitizeTitle` defuses an embedded
` (by ` so it cannot be mistaken for the author suffix.
Verification: `cd libraries/libwiki && bun test sanitize`.

### 2. New marker constants

Intent: regex pair for the `agent-experiments` open/close marker and the
last-successful-sync stamp.
Files: modify `libraries/libwiki/src/constants.js`.

```js
export const AGENT_EXPERIMENTS_OPEN_RE =
  /^<!--\s*agent-experiments(?:\s+[^>]*?)?\s*-->\s*$/;
export const AGENT_EXPERIMENTS_CLOSE_RE =
  /^<!--\s*\/agent-experiments(?:\s+[^>]*?)?\s*-->\s*$/;
export const LAST_SYNC_RE = /^<!--\s*last-successful-sync:\s*(\d{4}-\d{2}-\d{2})\s*-->\s*$/;
export const AGENT_EXPERIMENT_ITEM_RE =
  /^- #(\d+) \[([a-z][a-z-]*)\] (.*) \(by (.+)\)$/;
```

The author suffix is mandatory and anchored at end; the title group is greedy.
This round-trips unambiguously because `sanitizeTitle` (step 1) guarantees a
title never contains the literal ` (by ` token, so the trailing `(by …)` is
always the author.
Verification: `node -e "import('./libraries/libwiki/src/constants.js')"` imports
clean; `AGENT_EXPERIMENT_ITEM_RE` matches the step-5 sample line.

### 3. Scanner recognizes the new kind

Intent: `scanMarkers` returns
`{ kind: "agent-experiments", openLine, closeLine }`. Files: modify
`libraries/libwiki/src/marker-scanner.js`; modify `libraries/libwiki/test/` (add
a case to the existing marker-scanner test, or `issue-list-block.test.js` if
that is where scanner cases live — locate with `grep -rl scanMarkers test/`).

- `tryOpen`: after the issue-list branch, match `AGENT_EXPERIMENTS_OPEN_RE` →
  return `{ kind: "agent-experiments", openLine: i }`.
- `matchClose`: when `open.kind === "agent-experiments"`, test
  `AGENT_EXPERIMENTS_CLOSE_RE`.
- `closePair`: add an `agent-experiments` case returning
  `{ kind, openLine, closeLine }`.

Verification: scanner test asserts a paired `agent-experiments` block is
returned with correct line numbers and that a dangling open warns.

### 4. Audit balance-check arm

Intent: the audit treats the block as a known, balanced marker (criterion 12).
Files: modify `libraries/libwiki/src/audit/rules.js`.

Add a rule object after `storyboard.markers-balanced.issues`:

```js
{
  id: "storyboard.markers-balanced.agent-experiments",
  scope: "storyboard",
  severity: "fail",
  when: storyboardExists,
  check: markersBalanced({
    openRe: AGENT_EXPERIMENTS_OPEN_RE,
    closeRe: AGENT_EXPERIMENTS_CLOSE_RE,
    label: "agent-experiments",
  }),
  message: (_s, r) => `${r.reason} agent-experiments marker${r.label ? ` (${r.label})` : ""}`,
  hint: "every '<!-- agent-experiments -->' needs a matching '<!-- /agent-experiments -->'",
}
```

Verification: `audit-engine.test.js` — a balanced block yields no finding; an
unclosed open yields one `storyboard.markers-balanced.agent-experiments`.

### 5. Attributed-experiment renderer

Intent: fetch labeled experiment issues and emit attributed, sanitized lines.
Files: modify `libraries/libwiki/src/issue-list-renderer.js`; modify
`libraries/libwiki/test/` renderer test.

Add `renderAgentExperiments({ cwd, repo, token, runtime })`:

- `gh issue list --label experiment --state open --json number,title,labels,author --limit 100`
  (add `--repo` when `repo` set; `GH_TOKEN` env from `token`).
- On non-zero exit or JSON parse failure: throw a sentinel
  `TrackerQueryError` (new export) so refresh can catch and keep-previous —
  do **not** return `[]` (that path wipes the surface).
- For each issue: find the first label matching `^agent:([a-z][a-z-]*)$`; skip
  issues with none. Emit
  `- #<number> [<agent>] <sanitizeTitle(title)> (by <sanitizeCrossingField(author?.login)>)`,
  where `author?.login` is read defensively (a deleted account yields null →
  `""`) and lower-cased. `sanitizeTitle` defuses any ` (by ` token in the title
  so the trailing suffix is unambiguously the author. Bodies are never read.

Verification: renderer test with a stubbed `runtime.subprocess` returning two
labeled + one unlabeled issue → two attributed lines, unlabeled dropped; a
hostile multi-line title rendered single-line and sigil-escaped; a title
containing `(by hand)` round-trips (parses back to the original author, not the
embedded text); a non-zero exit throws `TrackerQueryError`.

### 6. Refresh writes the block with keep-previous + stamp

Intent: materialize at the existing sync point; preserve prior items on failure.
Files: modify `libraries/libwiki/src/commands/refresh.js`; modify
`libraries/libwiki/test/cli-refresh.integration.test.js`.

- `renderForBlock`: add an `agent-experiments` case calling
  `renderAgentExperiments(...)` and composing the spliced body:
  - Success → `[`<!-- last-successful-sync: ${today} -->`, ...itemLines]`.
  - On `TrackerQueryError` → read the prior body
    `lines.slice(block.openLine + 1, block.closeLine)` and return it unchanged
    (timestamp + items frozen); write the existing stderr warning. Return the
    prior body so `spliceBlock` is a no-op-equivalent rewrite.
- Keep the `BlockRenderError` path (XmR) as-is.

Verification: integration test — first refresh writes a stamped block dated
day 1 with items; a second refresh on day 2 whose `gh` stub drops the
`agent:{name}` label from one issue removes that item from the re-rendered block
(criterion 3) and advances the stamp to day 2; a third refresh on day 3 with a
failing `gh` stub leaves the block body byte-identical AND the stamp still
reading day 2 (asserted against day 3, so a regenerated-but-identical date would
fail) and emits a warning; a fourth successful refresh on day 4 advances the
stamp to day 4.

### 7. Boot reads experiments + standing carries

Intent: surface attributed items and verbatim carries in the digest.
Files: modify `libraries/libwiki/src/boot.js`; modify
`libraries/libwiki/test/boot.test.js`.

- Extend `parseStoryboardItems(text, agent)` in two parts:
  - **Block scan.** Locate the `agent-experiments` block (open/close via the
    step-2 regexes), skip the `LAST_SYNC_RE` line, parse each line with
    `AGENT_EXPERIMENT_ITEM_RE`, and for lines whose `[agent]` equals the booting
    agent push the unified shape: `{ dim: agent, threshold: title, status:
    "open", link: null, issue: Number(n), author, source: "experiment" }`.
  - **h3-bullet scan (fix existing double-parse).** The current loop keeps
    `inAgent` true across `##` headings and block markers, so the block's own
    `- #NNN [agent] …` bullets would also be captured and misattributed to the
    last `### {agent}`. Reset `inAgent = false` on any `^##` heading and on the
    `AGENT_EXPERIMENTS_OPEN_RE`/`_CLOSE_RE` lines so the h3 scan never reads
    inside the block or past the agent sections. Surviving bullet items get
    `source: "bullet", issue: null, author: null`.
- Add `extractStandingCarries(summaryText)`: find `## Standing Carries`, collect
  each `-` bullet's body verbatim (text after `- `, byte-equal, no trim of
  inner content) until the next `##` or EOF. Absent section → `[]`.
- `buildDigest`: add
  `standing_carries: extractStandingCarries(summaryText ?? "")`.
  `extractSummary` is unchanged (Last-run paragraph only).

Verification: boot test — a fixture wiki with a materialized block yields a
`storyboard_items` entry for the booting agent (criterion 1) and not for others;
an h3 bullet still yields an item (criterion 8); items carry `issue`/`author`
(criterion 6); `## Standing Carries` bullets appear byte-equal in
`standing_carries`, absence yields `[]`, and `summary` is still the first
paragraph (criterion 9). buildDigest is constructed with only `fs` — no
subprocess/network (criterion 2).

### 8. Round-trip test

Intent: prove boot consumes exactly what the renderer writes (criterion 7).
Files: modify `libraries/libwiki/test/cli-refresh.integration.test.js` (or a new
`agent-experiments-roundtrip.test.js`).

Render the block via `renderAgentExperiments` + the refresh composer into a
storyboard file, then run `buildDigest` against that file and assert the parsed
items match the rendered issues. No hand-built lookalike.
Verification: the test passes; deleting a field from the renderer breaks it.

### 9. Negative fixture

Intent: a hostile issue materializes inert and body-free (criterion 5).
Files: add to the step-5 renderer test or a dedicated negative test.

Stub a `gh` response with one issue whose title, author login, and (ignored)
body carry `[ask#1]`, `<!-- /agent-experiments -->`, `## Heading`, and a
multi-line newline-injection attempt. Assert the rendered line is single-line,
the leading sigils are escaped, no body text appears, and the line still parses
under `AGENT_EXPERIMENT_ITEM_RE`.
Verification: `cd libraries/libwiki && bun test`.

### 10. Rewrite the dead-format fixture corpus

Intent: no test surface retains `### {agent} — backlog` (criterion 11). Files:
modify `libraries/libwiki/test/golden/fit-wiki/fixture/storyboard-2026-M05.md`,
`libraries/libwiki/test/golden/fit-wiki/boot-json.stdout.txt`,
`libraries/libwiki/test/helpers.js` (the `seedCleanWiki` writer + its
module-level `STORYBOARD_AGENTS` map),
`libraries/libwiki/test/audit-engine.test.js`,
`libraries/libwiki/test/audit-cli.test.js`, and any inline test storyboards
(`grep -rln -- '— backlog' libraries/libwiki/test/`).

Each storyboard fixture becomes the live shape: per-agent `### {agent}` h3 with
an h4 metric + fenced XmR block, a team-wide `##` h2 immediately after the last
agent section, an `agent-experiments` block (with a stamp line and at least one
attributed item), and at least one live-format agent-section bullet. Regenerate
`boot-json.stdout.txt` from the rewritten golden fixture so the golden matches
the new digest shape (now including `standing_carries`). Preserve PR #1669's
h2-after-last-agent regression intent.
Verification: `cd libraries/libwiki && bun test` green and
`grep -rn -- '— backlog' libraries/libwiki/test/` returns no matches.

### 11. Protocol amendment

Intent: memory-protocol.md matches the shipped mechanism (criterion 10).
Files: modify `.claude/agents/references/memory-protocol.md`.

- § On-Boot Routing level 2: describe the materialized `agent-experiments`
  surface (rendered at refresh from `agent:{self}`-labeled experiment issues),
  the freshness bound (as fresh as the last successful sync, stamp auditable in
  the file), and that boot reads it file-only.
- § On-Boot Read Set: add the `## Standing Carries` summary section and its
  distinct `standing_carries` digest field; note `summary` stays the Last-run
  paragraph and carries act under their own predicate (no new routing level).
- § CLI Contract Map: reflect the `standing_carries` field on the `boot` row.

Use `bunx fit-selfedit` if direct `.claude/**` writes are blocked. Technical-
writer review is recorded on the implementation PR (criterion 10).
Verification: re-read the three sections; they name `agent-experiments`,
`standing_carries`, and the freshness bound.

## Execution

Single engineering agent, sequential — each step depends on the prior
(constants → scanner/audit → renderer → refresh → boot → fixtures). Step 11
(protocol) and step 10 (fixtures) may be done by `technical-writer` if routed,
but both depend on the code shape being final, so run them after step 9.

## Risks

- **Budget (criterion 12).** Materializing ~30 attributed items into the live
  storyboard may push it over `storyboard.word-budget`. If `fit-wiki audit`
  fails on the refreshed wiki, trim per-item title length via the sanitizer cap
  before considering a structural change; do not silently relocate the block
  off the storyboard (that reopens the rejected sidecar trade-off).
- **`gh author` field shape.** `gh issue list --json author` returns
  `{ login, ... }`; read `issue.author?.login` defensively (a deleted account
  can yield null) and sanitize to `""` when absent.
- **Golden regeneration.** `boot-json.stdout.txt` is a byte-exact golden; after
  rewriting the fixture, regenerate it from the actual command output rather
  than hand-editing, or the golden test will report spurious drift.

— Staff Engineer 🛠️
