# Plan 1010-a — Teams Using Agents persona, canonical JTBD entry

Execution plan for [design 1010-a](./design-a.md). Spec:
[spec.md](./spec.md).

## Approach

Land one PR that adds the fourth surface (`products/kata/` as a metadata-only
product carrying the new `<job>` source), extends the generator allowlist by
one literal, adds the policy carve-out in `products/CLAUDE.md`
§ `package.json` metadata, expands the generator tests, runs
`bun run context:fix` so JTBD.md and `products/README.md` regenerate from
the new source, and replaces the inline CLAUDE.md persona bullet with a
JTBD anchor link. Step ordering follows the validator: the new
`products/kata/package.json` cannot validate until the new persona is in
`VALID_USERS`, so the allowlist edit precedes the regen.

Libraries used: none.

## Steps

### Step 1 — Edit `libraries/libcoaligned/src/jtbd.js` allowlist

**Intent.** Admit the new persona before any source data references it,
otherwise `validate()` short-circuits the regen in Step 6.

**Files modified.**

- `libraries/libcoaligned/src/jtbd.js`

**Change.** In the `VALID_USERS` array literal at the top of the file
(currently a three-entry array), append one literal entry so the array
reads:

```js
const VALID_USERS = [
  "Engineering Leaders",
  "Empowered Engineers",
  "Platform Builders",
  "Teams Using Agents",
];
```

`USER_ORDER` (the `new Map(...)` immediately following) derives its sort
index from array position; Teams Using Agents takes index 3.

**Verification.** `cd libraries/libcoaligned && bun test test/jtbd.test.js`
all green — confirms the existing suite still admits `"Platform Builders"`
and the allowlist change is syntactically valid. (New behaviour added in
this step is exercised by the Step 5 cases that depend on this edit; this
verification is a regression smoke test only.)

### Step 2 — Create `products/kata/package.json`

**Intent.** Provide the upstream source the generator reads to emit the
Teams Using Agents `<job>` block (design D1).

**Files created.**

- `products/kata/package.json`

**Content.** Author-input fields below; `check-metadata.mjs --fix` (run in Step
6) canonicalizes by injecting `homepage`, `repository`, `license`, `author`,
`engines`, and key ordering. With `"private": true`, no `publishConfig` is added
(check-metadata.mjs `if (!pkg.private) next.publishConfig = …`).

```jsonc
{
  "name": "@forwardimpact/kata",
  "private": true,
  "description": "Run an autonomous, continuously improving development team via a daily Plan-Do-Study-Act loop, shipped as a skill pack under .claude/skills/kata-*/.",
  "jobs": [
    {
      "user": "Teams Using Agents",
      "goal": "Run a Continuously Improving Agent Team",
      "trigger": "Agents are shipping work but nobody can tell whether the team is getting better — the only feedback loop is reading every diff.",
      "bigHire": "run an autonomous, continuously improving development team that plans, ships, studies its own traces, and acts on findings.",
      "littleHire": "onboard a Kata installation that runs the Plan-Do-Study-Act loop without per-team prompt engineering.",
      "competesWith": "bespoke per-agent system prompts; manual orchestration scripts; not measuring agent outcomes; abandoning agent investment after a failed pilot",
      "forces": {
        "push": "Agent regressions are silent until users complain.",
        "pull": "A closed loop that surfaces what improved and what regressed, grounded in evidence.",
        "habit": "Treating each agent run as a one-off rather than an iteration.",
        "anxiety": "Autonomy might amplify bad patterns faster than humans can intervene."
      },
      "firedWhen": "the autonomous loop becomes harder to operate than direct prompting; or organizational policy bans autonomous agent execution."
    }
  ]
}
```

**Verification.** `bunx coaligned jtbd` (no `--fix`). Stderr lists only
the two stale-block lines (`JTBD.md out of date. Run \`coaligned jtbd
--fix\` to regenerate.` and `products/README.md out of date. …`). No
validation error lines (no `…/package.json .jobs[…]: invalid user …` or
similar) — only the two stale messages. The process exits with status
`1` (`coaligned.js` returns non-zero whenever `errors.length > 0 ||
stale.length > 0`); the non-zero exit with only stale messages is the
expected post-Step-2 state. Do **not** run `--fix` here — that is
Step 6's job.

### Step 3 — Create `products/kata/README.md`

**Intent.** Provide a folder landing for human readers without giving
`buildDescription` a heading to anchor an injected block on
(`buildDescription` returns `null` when no `^# .+\n` heading matches; the
returned `null` is a no-op in `commitUpdate`).

**Files created.**

- `products/kata/README.md`

**Content (exact).** One sentence, no leading `# heading`, no
`BEGIN:description` marker, trailing newline:

```text
Metadata-only — Kata ships as a skill pack under `.claude/skills/kata-*/` per CLAUDE.md § Distribution Model.
```

**Verification.** Re-run `bunx coaligned jtbd` (no `--fix`). Stderr
lists the same files as Step 2 (`JTBD.md`, `products/README.md`)
with the same `… out of date.` message; `products/kata/README.md` does
**not** appear in that list, confirming `buildDescription` no-ops on the
bare body. Exit code remains `1` (still stale). Do not run `--fix` in
this step.

### Step 4 — Add the metadata-only carve-out to `products/CLAUDE.md`

**Intent.** Permit the metadata-only packaging shape `products/kata/`
uses (design D3 / Components row 6 places the carve-out under
§ `package.json` metadata, which resolves the § Audience contradiction
by narrowing the allowable packaging shape).

**Files modified.**

- `products/CLAUDE.md`

**Change.** Append one paragraph at the end of § `package.json` metadata
(after the line `After editing, regenerate: \`bun run context:fix\`.`):

```md
A `products/<name>/` may carry `"private": true` with `description` + `jobs` only — no `bin/`, `src/`, or CLI — when the product ships outside the `npx fit-<name>` channel (e.g., Kata's skill-pack distribution under `.claude/skills/kata-*/`). Such directories are catalogued for JTBD and product-list purposes only and are exempt from § Audience's "reached via `npx fit-<product>`" claim.
```

The sentence explicitly references § Audience so a future reader sees the
exemption when they read the audience-reach claim.

**Verification.** `bun run lint` and `bun run format` pass. The new
paragraph appears under § `package.json` metadata; § Audience reads
top-to-bottom without contradicting the existence of `products/kata/`
because of the explicit exemption reference.

### Step 5 — Expand `libraries/libcoaligned/test/jtbd.test.js`

**Intent.** Cover the four behaviors design § Components row 8 lists:
(a) persona admitted when in allowlist; (b) persona rejected when absent
(regression guard for D2); (c) Kata-fixture render satisfies spec
criterion 1 substrings; (d) idempotency satisfies spec criterion 3.

**Files modified.**

- `libraries/libcoaligned/test/jtbd.test.js`

**Change.** Append four `test(...)` calls inside the existing
`describe("checkJtbd", …)` block (after the current third test). Reuse the
`makeRepo()` helper and the existing `validJob` template where useful.

Each new case below states (i) the fixture written into the temp repo, and
(ii) the exact assertions added (`assert.*` call shapes are explicit so
the implementer does not invent verification).

**Case 5a — `accepts Teams Using Agents as a job-author value`.**

- Fixture: `products/kata/package.json` whose `.jobs` is the verbatim
  single-entry array from Step 2 (use the exact same constant — define a
  `kataJob` const at file scope reused by Cases 5a, 5c, 5d so Step 5
  fixtures stay in sync with Step 2's authored data). Also write
  `JTBD.md` containing exactly `<!-- BEGIN:jobs -->\n<!-- END:jobs -->\n`.
- Assertions:
  - `assert.deepStrictEqual(result.errors, []);`
  - `assert.ok(result.stale.includes("JTBD.md"));`

**Case 5b — `rejects an unknown persona value`.**

- Fixture: `await mkdir(join(root, "products", "foo"))`, then write
  `products/foo/package.json` whose `.jobs[0]` clones `validJob` but
  sets `user: "Teams of Agents"` (typo of the new persona). Mirror the
  existing test's `mkdir` + `writeFile` shape.
- Assertions:
  - `assert.ok(result.errors.some((e) => e.includes('invalid user "Teams of Agents"')));`
  - `assert.ok(result.errors.some((e) => e.includes("Teams Using Agents")));`
    — proves the rejection message enumerates the four current allowlist
    values, guarding D2's "hardcoded literal allowlist" choice.

**Case 5c — `renders a Big Hire that satisfies criterion 1 substrings`.**

- Fixture: `products/kata/package.json` from Case 5a (verbatim bigHire
  string). `JTBD.md` containing `<!-- BEGIN:jobs -->\n<!-- END:jobs -->\n`.
- Run: `await checkJtbd({ root, fix: true });`
- Read and isolate the Big Hire paragraph so the criterion-1 assertions
  do not pick up substrings from elsewhere in the block (the Little
  Hire mentions `Plan-Do-Study-Act`, and the heading contains
  `Continuously Improving`):

  ```js
  const jtbd = await readFile(join(root, "JTBD.md"), "utf8");
  const start = jtbd.indexOf("**Big Hire:**");
  assert.ok(start >= 0, "Big Hire label missing from JTBD.md");
  const end = jtbd.indexOf("\n\n", start);
  const bigHire = jtbd.slice(start, end);
  ```

- Assertions on `bigHire` (the Big Hire paragraph only):
  - `assert.ok(bigHire.toLowerCase().includes("autonomous"));`
  - For each of `["plan", "ship", "stud", "act"]`:
    `assert.ok(bigHire.toLowerCase().includes(token));`
  - `assert.match(bigHire, /→ \*\*Kata\*\*$/);` — proves the Big Hire
    paragraph's final non-whitespace tokens are `→ **Kata**`,
    independent of where Prettier inserts wraps (spec criterion 1c).

**Case 5d — `regeneration is idempotent across two fix runs`.**

- Fixture: Same as Case 5c.
- Run: `await checkJtbd({ root, fix: true });` then
  `const second = await checkJtbd({ root, fix: true });`
- Assertions:
  - `assert.deepStrictEqual(second.fixed, []);`
  - `assert.deepStrictEqual(second.stale, []);`
  - `assert.deepStrictEqual(second.errors, []);`

**Verification.** `cd libraries/libcoaligned && bun test test/jtbd.test.js`
shows three pre-existing passes plus four new passes. `bun test` from repo
root also green.

### Step 6 — Regenerate JTBD.md and products/README.md

**Intent.** Apply the source-of-truth edits to the generated surfaces.
This step's diff is mechanical — no hand-editing of `JTBD.md` or
`products/README.md`.

**Files modified by this step.** (`products/kata/package.json` was
created in Step 2; this step rewrites it in place. The other two are
modified by the JTBD regen.)

- `products/kata/package.json` — `check-metadata.mjs --fix` reorders keys per
  the canonical order and injects `homepage`, `repository`, `license`, `author`,
  `engines`. No `publishConfig` because `"private": true`. Hand-authored fields
  from Step 2 (`name`, `private`, `description`, `jobs`) are preserved verbatim.
- `JTBD.md` — `coaligned jtbd --fix` inserts the new
  `<job user="Teams Using Agents" goal="Run a Continuously Improving Agent Team">`
  block inside the `BEGIN:jobs … END:jobs` body, after the existing Platform
  Builders blocks (per `USER_ORDER` index 3 from Step 1).
- `products/README.md` — `coaligned jtbd --fix` inserts a new row in the
  `BEGIN:catalog … END:catalog` table, alphabetically between `**guide**` and
  `**landmark**`. The description cell is the verbatim `pkg.description` string
  from Step 2, namely:
  `"Run an autonomous, continuously improving development team via a daily Plan-Do-Study-Act loop, shipped as a skill pack under .claude/skills/kata-*/."`

**Command.**

```sh
bun run context:fix
```

This runs `check-metadata.mjs --fix` (which canonicalizes the new
`products/kata/package.json`) and then `coaligned jtbd --fix`.

**Expected JTBD.md insert** — described structurally because Prettier's
`proseWrap: always` at `printWidth: 80` chooses the line breaks, and
exact wrap positions depend on the field strings; do not assert against
specific column widths. After regen, JTBD.md contains, after the
existing Platform Builders blocks and before the closing
`<!-- END:jobs -->`, a block whose structural shape is:

- Outer
  `<job user="Teams Using Agents" goal="Run a Continuously Improving Agent Team">`
  … `</job>` markers.
- `## Teams Using Agents: Run a Continuously Improving Agent Team` heading
  inside the block.
- `**Trigger:**` paragraph whose content matches
  `products/kata/package.json .jobs[0].trigger` verbatim, wrapped by Prettier.
- `**Big Hire:**` paragraph that begins `Help me` and whose final
  non-whitespace token is the literal `→ **Kata**` (Prettier may wrap the
  paragraph onto two or three lines; `→` and `**Kata**` always appear as the
  trailing tokens, regardless of wrap position).
- `**Little Hire:**` paragraph that begins `Help me onboard` and ends with
  `→ **Kata**` (same wrap-independent shape).
- `**Competes With:**` paragraph carrying the four `;`-separated fragments
  joined with `;` and a trailing `.` (per `mergeCompetesWith`).
- `**Forces:**` heading followed by four bullets — `- **Push:**`, `- **Pull:**`,
  `- **Habit:**`, `- **Anxiety:**` — each carrying the matching `forces.*`
  string verbatim.
- `**Fired When:**` paragraph carrying `firedWhen` verbatim.

**Verification.** Precondition: every other `package.json` in the repo is
already canonical (so `check-metadata.mjs --fix` only touches the new
file), and prior steps (1, 2, 3, 4, 5) are already committed.
`products/kata/package.json` is in HEAD in its hand-authored shape from
Step 2. Then run `bun run context:fix` and check:

1. `bun run context` exits 0.
2. `git status --short` lists exactly three lines —
   `M products/kata/package.json`, `M JTBD.md`,
   `M products/README.md` (all modifications; no untracked or deleted
   files). Commit those three files as the Step 6 commit.
3. Re-running `bun run context:fix` then `git status --short` shows a
   clean tree (idempotency — spec criterion 3).
4. Spec criterion 1: `rg -n '→ \*\*Kata\*\*' JTBD.md` returns exactly two
   matches — the Big Hire and Little Hire lines, both inside the new
   `<job user="Teams Using Agents">` block.
5. Spec criterion 2: `bun run context:check-jtbd` exits 0 (the
   repo-root wrapper for `bunx coaligned jtbd`).
6. Spec criterion 6: extract the block and count `→ **Kata**` matches:

   ```sh
   start=$(rg -n '^<job user="Teams Using Agents"' JTBD.md | cut -d: -f1)
   end=$(rg -n '^</job>' JTBD.md | awk -F: -v s="$start" '$1 > s {print $1; exit}')
   sed -n "${start},${end}p" JTBD.md | rg -c '→ \*\*Kata\*\*'
   # → 2
   rg -n '→ \*\*Kata\*\*' JTBD.md | awk -F: -v s="$start" -v e="$end" \
     '$1 < s || $1 > e {bad=1} END {exit bad}'
   # exit 0 (every match is between lines s and e)
   ```

### Step 7 — Replace the CLAUDE.md persona bullet

**Intent.** Satisfy spec criterion 4 — the Teams Using Agents bullet in
§ Primary Products links to the JTBD entry instead of restating the Big
Hire inline. Other persona bullets stay untouched (out of scope per spec
and design D5).

**Files modified.**

- `CLAUDE.md`

**Change.** Replace the existing two-line bullet (the one whose first
line is `- **Teams Using Agents** — Run an autonomous, continuously
improving development` and whose second line continues `team that plans,
ships, studies its own traces, and acts on findings.`) with:

```md
- **Teams Using Agents** —
  [Run a continuously improving agent team](JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).
```

Anchor is the GitHub-flavored slug of `## Teams Using Agents: Run a
Continuously Improving Agent Team` (emitted in Step 6).

**Verification.**

1. Spec criterion 4 shape check: `rg -n '^- \*\*Teams Using Agents\*\*'
   CLAUDE.md` shows exactly one match; the bullet contains exactly one
   markdown link, and `rg -A1 '^- \*\*Teams Using Agents\*\*' CLAUDE.md`
   shows neither the substring `autonomous` nor `Plan-Do-Study-Act`
   outside the link text.
2. Anchor resolves: `rg -n '^## Teams Using Agents: Run a Continuously
   Improving Agent Team$' JTBD.md` returns one match (the heading whose
   slug Step 7's link targets).
3. Spec criterion 5 audit, executed via three concrete commands.
   Persona names live in CLAUDE.md as `- **<persona>** —` bullets in
   § Primary Products (Engineering Leaders, Empowered Engineers, Teams
   Using Agents) and as `**<persona>**` paragraph-leading bold in
   § Secondary Products (Platform Builders), so the audit does not
   regex CLAUDE.md as a single pattern — it grep-checks the four known
   persona strings directly:
   - For each of `Engineering Leaders`, `Empowered Engineers`, `Teams
     Using Agents`, `Platform Builders`:
     `rg -F "$persona" CLAUDE.md` returns ≥ 1 match (proves CLAUDE.md
     still mentions the persona, in either § Primary or § Secondary).
   - For each of the same four:
     `rg -nF "<job user=\"$persona\"" JTBD.md` returns ≥ 1 match
     (proves every CLAUDE.md persona has at least one JTBD block).
   - `rg -oP '(?<=<job user=")[^"]+' JTBD.md | sort -u` returns
     exactly those four lines (proves no JTBD persona is absent from
     CLAUDE.md).

### Step 8 — Full repo verification

**Intent.** Confirm the change set lands as one coherent unit (spec
§ Scope's "one coherent unit" requirement).

**Files modified.** None.

**Commands.**

```sh
bun run check
bun test
```

**Verification.** Both green. `git status` shows a clean working tree
(implementer commits each step's edits before this final check).

## Risks

- **Forward drift on `goal` rewording.** A future spec that rewords
  `products/kata/package.json .jobs[0].goal` changes the JTBD heading
  slug, which silently rots the CLAUDE.md link Step 7 hand-codes.
  `bun run check` does not currently include `markdown-link-check`, so
  the rot would land without CI detecting it. Mitigation: record the
  hand-coded coupling in the PR description so the next `kata-spec`
  author who touches `goal` knows to update the CLAUDE.md anchor in the
  same commit. Do not add link-check tooling in this PR — that is
  scope creep against spec § Out of scope.
- **Acknowledged drift in two unscoped hand-curated strings.** Landing
  `products/kata/` makes two prose statements numerically inaccurate
  that neither the spec § Scope table nor the design § Components touch:
  (a) `products/CLAUDE.md` lead paragraph reads "Products are the seven
  end-user applications (Map, Pathway, Guide, Landmark, Summit, Outpost,
  Gear) consumed via `npm install` and `npx fit-<product>`"; (b)
  `products/README.md` lead paragraph reads "The seven products serve
  external users …". Both lines live outside the generator's BEGIN/END
  markers, so `bun run context:fix` does not heal them. By the same
  scope discipline applied to design D5 ("other persona bullets" out of
  scope), this plan does **not** edit them — the implementer must
  leave both lines untouched. A follow-up spec is the right venue to
  reconcile the count and the enumeration.

## Execution recommendation

Single PR, sequential steps, single `kata-implement` agent. The plan
does not decompose into parts — every step's verification is local and
each later step depends on an earlier step's output (Step 6 needs the
allowlist edit and the source files from Steps 1–4; Step 7 needs the
heading slug emitted in Step 6). No part is independently executable in
parallel.

— Staff Engineer 🛠️
