# Plan 1640 — Outpost brief mode separated from draft-on-behalf at init

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Add a posture record at `~/.fit/outpost/posture.json`, written only by `init`
(default `brief`) and a new `posture` command (SC5). A static
`config/skill-postures.json` manifest classifies every bundled skill; a new
`src/posture.js` module reads the record and manifest and resolves the
draft-side deny set. `AgentRunner.wake` reads the posture and, under `brief`,
appends `--disallowedTools Skill(<name>)` for every draft-side skill plus an
`--append-system-prompt` brief directive — the deterministic gate that carries
SC1/SC3/SC12 under `bypassPermissions`. `status` emits the posture line (SC6).
The landing page gains a posture subsection above the first `init` (SC7/SC8).

Libraries used: libcli (command/dispatch), libutil (runtime fs/clock), none new.

## Step 1 — Skill-posture manifest

Intent: ship the design's membership table as deterministic data. Files: create
`products/outpost/config/skill-postures.json`. Change: a flat object keyed by
every bundled skill directory name (the 26 under `templates/.claude/skills/`),
value `"brief"` or `"draft"`. Draft set: `draft-emails`, `send-chat`,
`organize-files`, `deck-create`, `doc-create`, `candidate-report`. All others
`"brief"`. Verify:
`node -e "const m=require('./products/outpost/config/skill-postures.json'); const fs=require('fs'); const dirs=fs.readdirSync('products/outpost/templates/.claude/skills',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name); const miss=dirs.filter(d=>!(d in m)); if(miss.length) throw new Error('unclassified: '+miss); console.log('all',dirs.length,'classified')"`

## Step 2 — `posture.js` module

Intent: pure read/write of the record and deny-set resolution.
Files: create `products/outpost/src/posture.js`.
Change: export an injectable class/functions using `runtime.fs`:

- `readPosture(fs, posturePath)` → `"brief" | "brief+draft" | null` (null when
  the file is absent or unparseable; the file shape is
  `{ "posture": <value> }`).
- `writePosture(fs, posturePath, value)` → validates `value` is one of the two
  strings (throws otherwise) and writes `{ posture }` JSON + newline.
- `effectivePosture(stored)` → `stored ?? "brief"` (interim-window default,
  SC1).
- `draftSkills(manifest)` → array of skill names whose manifest value is
  `"draft"`.
- `loadManifest(fs, manifestPath)` → parsed manifest object.

Verify: unit test below (Step 7) exercises each.

## Step 3 — `init` records default posture

Intent: a fresh `init` defaults the posture to `brief` (SC11).
Files: modify `products/outpost/src/outpost.js` (the `init` command handler).
Change: after `kbManager.init(...)` returns `ok`, if no posture is recorded,
write `brief` to `CONFIG`-sibling `POSTURE_PATH = join(OUTPOST_HOME,
"posture.json")` via `writePosture`. Add `POSTURE_PATH` to the Paths block.
`init` only writes when the record is absent, so re-running never flips an
existing posture.
Verify: `bun ./bin/fit-outpost.js init <tmp> && cat ~/.fit/outpost/posture.json`
on a clean `HOME` shows `{"posture":"brief"}` (covered by CLI test, Step 7).

## Step 4 — `posture` command (SC5)

Intent: discoverable one-shot affordance to record a posture. Files: modify
`products/outpost/src/outpost.js`. Change: add to `buildDefinition` commands:
`{ name: "posture", args: "[brief|brief+draft]", description: "Show or set the adoption posture (brief or brief+draft)" }`.
Add a `posture` handler to `COMMANDS`: with no arg, print the current effective
posture; with an arg, validate and `writePosture`, then confirm. Invalid arg →
`cli.usageError`, exit 2. Verify: `--help` lists `posture`;
`fit-outpost posture brief+draft` then `fit-outpost status` shows
`posture: brief+draft` (Step 7 CLI test).

## Step 5 — `status` emits the posture line (SC6)

Intent: posture observable as the committed strings.
Files: modify `products/outpost/src/outpost.js` (`showStatus`).
Change: before the agent list, read the record via `readPosture`; emit
`posture: <value>` when present, `posture: unset` when absent. Line matches
`^posture: (brief|brief\+draft|unset)$`.
Verify: Step 7 asserts the regex on `status` output for each state.

## Step 6 — Wake-path gate (SC1, SC3, SC4, SC12)

Intent: under `brief`, deny draft-side skills and inject the brief directive;
under `brief+draft`, spawn unchanged. Files: modify
`products/outpost/src/agent-runner.js`; thread `posturePath`
(`join(OUTPOST_HOME, "posture.json")`) + `manifestPath`
(`join(PKG_DIR, "config", "skill-postures.json")`, both already in `run()`
scope) into `AgentRunner` from `outpost.js`'s single construction site
(`new AgentRunner(...)`). Change: in `wake`, before building `spawnArgs`,
compute `posture = effectivePosture(await readPosture(...))`. When
`posture === "brief"`, append to `spawnArgs`:

- `"--disallowedTools", draftSkills(manifest).map(s => \`Skill(${s})\`).join(" ")`
  (one space-joined token list per the CLI's documented format).
- `"--append-system-prompt", BRIEF_DIRECTIVE` where `BRIEF_DIRECTIVE` is a
  fixed string: run only read-and-brief work; do not draft or send content on
  the user's behalf, move files outside the knowledge base, or write the posture
  record.

When `posture === "brief+draft"`, add nothing (SC4).
Verify: Step 7 asserts the recorded spawn `args` contain the deny tokens and
directive under `brief`, and contain neither under `brief+draft`.

## Step 7 — Tests

Intent: cover every implementation-time SC. Note the test seams: `posture.js`
is pure/injectable (unit); `agent-runner.test.js` already uses a mock-fs
runtime and a stubbed spawn (unit); but `outpost-cli.test.js` only exercises
the libcli **parser** against a duplicated inline `definition` and never calls
`run()`, so `init`/`posture`/`status` behaviour cannot live there — it goes in
a new `run()`-driven integration test (`run()` derives `OUTPOST_HOME` from
`homedir()`, which honours `$HOME`, so the test points `$HOME` at a temp dir
and uses a real-fs runtime).
Files: create `products/outpost/test/posture.test.js`,
`products/outpost/test/posture-cli.integration.test.js`; modify
`products/outpost/test/agent-runner.test.js`,
`products/outpost/test/outpost-cli.test.js`.
Change:

- `posture.test.js`: `readPosture` (present/absent/garbage), `writePosture`
  (valid + rejects invalid), `effectivePosture` default, `draftSkills` returns
  the 6, `loadManifest` parses.
- `agent-runner.test.js`: extend `makeRuntime`/`createMockFs` so `posture.json`
  resolves; assert spawn args under `brief` (deny tokens + directive present;
  SC1/SC3) and `brief+draft` (absent; SC4); assert a `brief` wake never writes
  `posture.json` (SC12).
- `posture-cli.integration.test.js`: set `$HOME` to a `mkdtemp` dir, call
  `run(createDefaultRuntime(), version)` with a captured-stdout proc. Assert:
  `init <tmpkb>` records `brief` (SC11); `posture brief+draft` then `status`
  matches `^posture: brief\+draft$` (SC5/SC6); `status` before any record
  matches `^posture: unset$`; an unknown posture arg returns exit 2.
- `outpost-cli.test.js`: add the `posture` command to the inline `definition`
  so the parser fixture stays in sync with `buildDefinition`.

Verify: `cd products/outpost && bun test` green.

## Step 8 — Landing page (SC7, SC8)

Intent: name both postures before the first `fit-outpost init`.
Files: modify `websites/fit/outpost/index.md`.
Change: add a subsection (e.g. `### Choosing your posture`) above the
`## Getting Started` section (the first `fit-outpost init` is in that section).
Name `brief` and `brief+draft`, describe each via the boundary rule, and frame
`brief+draft` draft capability as staged-for-review/explicit-approval. Include
one of the exact substrings _"stage for review"_, _"staged for review"_, or
_"explicit approval"_; avoid _"sends automatically"_, _"sends on your behalf"_,
_"moves files automatically"_.
Verify: `grep -n "fit-outpost init" websites/fit/outpost/index.md` — the
posture subsection's line number precedes the first match; `grep` confirms the
required substring is present and the forbidden ones are absent.

## Step 9 — Regenerate the help golden

Intent: keep the captured `--help` snapshot honest after the new command. Files:
modify `products/outpost/test/golden/fit-outpost/help.stdout`. Change:
re-capture via
`cd products/outpost && node ../../scripts/capture-cli-golden.mjs --bin fit-outpost --exec bin/fit-outpost.js`.
Verify:
`node ../../scripts/capture-cli-golden.mjs --bin fit-outpost --exec bin/fit-outpost.js --verify`
clean.

## Step 10 — Full suite

Intent: green gate for the touched package.
Verify: from repo root, `bun run format && bun run lint && bun run jsdoc` and
`cd products/outpost && bun test`, all green.

## Risks

- `--disallowedTools Skill(<name>)` token shape: confirmed the installed CLI
  exposes `--disallowed-tools <tools...>` taking comma/space-separated names.
  Before wiring (Step 6), verify a `Skill(<name>)` entry is honoured; if the CLI
  names skills differently, adjust the token format — the gate's structure is
  unchanged.
- `agent-runner.test.js` uses a stubbed spawn that records `args`; the new
  assertions read those recorded args, so no real `claude` binary is needed.

## Execution

Single engineering agent, steps in order (2 before 3-6; 7 after 2-6; 8-9
independent of code; 10 last). No parallel parts.

— Staff Engineer 🛠️
