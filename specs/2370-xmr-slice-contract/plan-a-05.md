# Plan 2370-a Part 05: The history rewrite under the killswitch

P11. In every metrics CSV of this wiki under either schema header, a cell
under `event_type` whose trimmed value is an old basename (`kata-shift`,
`kata-dispatch`, `kata-coaching`, or `kata-storyboard`, which the storyboard
workflow may stamp between tier 4 and the rename) takes the new basename.
No other byte changes. Rows outside the schema's field range stay. The file
with its own six-column header stays. The rewrite lands as one publish while
the agent workflows are halted and no run is in flight.

Depends on: part 04 merged. Not a pull request. Route: an operator session
with `gh variable` write access on `forwardimpact/monorepo`, run right after
the merge. A session that an agent workflow hosts cannot run this part: the
spec forbids an old-name host, the workflow token holds `contents: write`
only, and its own run would never leave the wait in step 1.

Every command below runs from the repository root on `main` after part 04's
merge. The CLIs run from source (`bun products/gemba/bin/gemba-xmr.js`,
`bun products/gemba/bin/gemba-wiki.js`) so the step does not depend on the
gear binary or a `node_modules/.bin` shim; a fresh checkout runs
`bun install` first, because the bins and the `@forwardimpact/libxmr`
imports resolve through the root `node_modules` workspace links. The helper
scripts live under `tmp/`, which `.gitignore` excludes; `mkdir -p tmp`
creates it. They import package-root exports from `@forwardimpact/libxmr`
and the module-level constants by path. One module holds the name map, the
file list, and the `list` spawn; the baseline is one JSON index keyed by
file; every script reads them from there, and no shell loop restates a name.

The two `gh variable` commands below (step 1 and step 6) are the human
operator's: the team protocol lets no agent write the killswitch. The rest
of the part an agent may run in the operator's interactive session once the
variable is set.

## Step 1: Halt the writers and wait

Stop every writer so the rewrite is the only change in flight.

1. Record the current value:
   `gh variable get KATA_KILLSWITCH --repo forwardimpact/monorepo` (absent is
   a value too).
2. The human operator runs
   `gh variable set KATA_KILLSWITCH --body 1 --repo forwardimpact/monorepo`.
3. Wait until

   ```sh
   for s in queued waiting requested pending in_progress; do
     gh run list --repo forwardimpact/monorepo --status "$s" --limit 100 --json workflowName --jq '.[].workflowName'
   done
   ```

   prints nothing that starts with `Agent:`, `Kata:`, or `Eval:`. One query per
   non-terminal status with a limit well above any day's run count, so an old
   queued run cannot hide behind newer check runs. `Eval: Guide` is
   dispatch-only and pushes wiki changes without a killswitch gate, so it waits
   too; `Curate wiki` is read-only and needs no wait. A run that started under
   an old name before part 04 merged still appears under its old display name;
   wait for it too.

Verify: the listing is empty of agent, interview, and old-name runs.

## Step 2: The shared module and the baseline

Pull the tip, fix the names and the file set in one place, and capture what
each old name reads today.

Created (gitignored): `tmp/2370-names.mjs`

```js
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { HEADER, LEGACY_HEADER } from "../libraries/libxmr/src/constants.js";

export const RENAME = {
  "kata-shift": "agent-shift",
  "kata-dispatch": "agent-dispatch",
  "kata-coaching": "agent-coaching",
  "kata-storyboard": "agent-storyboard",
};
export const OLD_NAMES = Object.keys(RENAME);
export const INDEX = "tmp/2370-before.json";

const XMR = ["products/gemba/bin/gemba-xmr.js"];

/** Run one gemba-xmr command from source and return { status, stdout, stderr }. */
export function xmr(...args) {
  return spawnSync("bun", [...XMR, ...args], { encoding: "utf-8" });
}

/** `list` one slice of one file as JSON. */
export function list(file, slice) {
  return xmr("list", file, "--event-type", slice, "--format", "json");
}

// Every CSV one level under wiki/metrics (the one level `record` writes)
// whose header is one of the two schema headers; the header test excludes
// the experiment files at that level. The rewrite and every check read this
// one list, so the proof covers exactly the files the rewrite may touch.
export function schemaFiles() {
  const out = [];
  for (const dir of readdirSync("wiki/metrics", { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const name of readdirSync(`wiki/metrics/${dir.name}`)) {
      if (!name.endsWith(".csv")) continue;
      const file = `wiki/metrics/${dir.name}/${name}`;
      const header = (readFileSync(file, "utf-8").split("\n")[0] || "").replace(/\r$/, "").trim();
      if (header === HEADER || header === LEGACY_HEADER) out.push(file);
    }
  }
  return out.sort();
}
```

Created (gitignored): `tmp/2370-baseline.mjs`

```js
import { writeFileSync } from "node:fs";
import { OLD_NAMES, INDEX, schemaFiles, list, xmr } from "./2370-names.mjs";

// One index: per file, the metric inventory each old name reads today (absent
// when the read fails) and the validator's full output.
const index = {};
for (const file of schemaFiles()) {
  const entry = { reads: {}, validate: "" };
  for (const old of OLD_NAMES) {
    const r = list(file, old);
    if (r.status === 0) entry.reads[old] = JSON.parse(r.stdout).metrics;
  }
  const v = xmr("validate", file);
  entry.validate = `${v.stdout}${v.stderr}`;
  index[file] = entry;
}
writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n");
console.log(`files=${Object.keys(index).length}`);
```

```sh
mkdir -p tmp
bun products/gemba/bin/gemba-wiki.js pull
bun tmp/2370-baseline.mjs
```

A `list` for an old name exits 2 where the slice is absent from a non-empty
file and 0 with an empty metric list on a header-only file, so the index
holds an inventory for every pair that did not fail.

Verify: the script prints `files=<n>` with `n` at most 24, and the index's
`validate` texts report the six out-of-range rows the spec counts (one
nine-field row and five short rows), none of which holds an old name at
field 7.

## Step 3: Rewrite

Change the cell and nothing else, and write nothing until every edit is
planned.

Created (gitignored): `tmp/2370-rewrite.mjs`

```js
import { readFileSync, writeFileSync } from "node:fs";
import { parseLine } from "@forwardimpact/libxmr";
import { MIN_FIELDS, MAX_FIELDS } from "../libraries/libxmr/src/constants.js";
import { RENAME, OLD_NAMES, schemaFiles } from "./2370-names.mjs";

// Groups: head to the comma before field 7, padding, the old name, padding,
// an optional field 8, and a CR. The CR group only matches on seven-field
// rows; on eight-field rows field 8 carries it. Both rebuild the line intact.
const TAIL = new RegExp(`^(.*,)([ \\t]*)(${OLD_NAMES.join("|")})([ \\t]*)((?:,[^,]*)?)(\\r?)$`);

// Pass 1 plans every edit and throws before any write, so a surprise (a
// quoted cell, a tail that disagrees with the parsed cell) leaves every file
// untouched.
const plans = [];
for (const file of schemaFiles()) {
  const lines = readFileSync(file, "utf-8").split("\n");
  const edits = [];
  const left = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const row = parseLine(line);
    const next = Object.hasOwn(RENAME, row.eventType) ? RENAME[row.eventType] : null;
    if (!next) continue;
    const count = row.raw.fields.length;
    if (count < MIN_FIELDS || count > MAX_FIELDS) {
      left.push(i + 1);
      continue;
    }
    const m = line.match(TAIL);
    // The tail must be field 7: the head before it parses to six fields and
    // the trailing comma. A host_run that equals an old name would otherwise
    // bind the greedy head one field too late.
    if (!m || m[3] !== row.eventType || parseLine(m[1]).raw.fields.length !== 7) {
      throw new Error(`${file}:${i + 1}: tail did not match the parsed cell`);
    }
    edits.push([i, `${m[1]}${m[2]}${next}${m[4]}${m[5]}${m[6]}`]);
  }
  plans.push({ file, lines, edits, left });
}

// Pass 2 writes.
const changed = [];
for (const { file, lines, edits, left } of plans) {
  for (const [i, line] of edits) lines[i] = line;
  if (edits.length > 0) {
    writeFileSync(file, lines.join("\n"));
    changed.push(file);
  }
  console.log(`${file}\tcells=${edits.length}\tleft=${left.join(",") || "-"}`);
}
if (changed.length === 0) throw new Error("no old-name cell found; nothing to rewrite or publish");
writeFileSync("tmp/2370-changed.txt", changed.join("\n") + "\n");
```

```sh
bun tmp/2370-rewrite.mjs
```

A `left` row is one whose field count is outside the schema range and whose
seventh field holds an old name; P11 leaves it and P5 reports it. A quoted
`"kata-shift"` cell parses to the bare value but fails `TAIL`, and the first
pass throws before any write; the operator then quotes that row's shape
here and extends `TAIL`.

Verify: the listing prints one line per schema-header file with `left=-` on
every line (the six out-of-range rows hold no old name at field 7);
`wc -l < tmp/2370-changed.txt` is at most the schema count.

## Step 4: Verify the write-set before the push

Prove that only the one cell moved, and moved to its mapped name, line by
line, and that the validator's reports did not move.

Created (gitignored): `tmp/2370-verify-pairs.mjs`

```js
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseLine } from "@forwardimpact/libxmr";
import { RENAME, INDEX, schemaFiles, xmr } from "./2370-names.mjs";

const index = JSON.parse(readFileSync(INDEX, "utf-8"));
const files = readFileSync("tmp/2370-changed.txt", "utf-8").trim().split("\n").filter(Boolean);
if (files.length === 0) throw new Error("tmp/2370-changed.txt is empty; step 3 wrote nothing");
let pairs = 0;
for (const f of files) {
  const rel = f.replace(/^wiki\//, "");
  const before = execFileSync("git", ["-C", "wiki", "show", `HEAD:${rel}`], { encoding: "utf-8" }).split("\n");
  const after = readFileSync(f, "utf-8").split("\n");
  if (before.length !== after.length) throw new Error(`${f}: line count moved`);
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    if (before[i].endsWith("\r") !== after[i].endsWith("\r")) throw new Error(`${f}:${i + 1}: CR moved`);
    const a = parseLine(before[i]).raw.fields;
    const b = parseLine(after[i]).raw.fields;
    if (a.length !== b.length) throw new Error(`${f}:${i + 1}: field count moved`);
    for (let k = 0; k < a.length; k++) {
      if (k !== 6 && a[k] !== b[k]) throw new Error(`${f}:${i + 1}: field ${k + 1} moved`);
    }
    const old = a[6].trim();
    if (!Object.hasOwn(RENAME, old) || b[6].trim() !== RENAME[old]) throw new Error(`${f}:${i + 1}: cell ${a[6]} -> ${b[6]}`);
    pairs++;
  }
}
for (const file of schemaFiles()) {
  const v = xmr("validate", file);
  if (`${v.stdout}${v.stderr}` !== index[file].validate) throw new Error(`${file}: validate output moved`);
}
console.log(`pairs=${pairs}; validate unchanged`);
```

```sh
sed 's|^wiki/||' tmp/2370-changed.txt | xargs git -C wiki diff --numstat -- | awk '$1 != $2 { print "line count moved:", $0; bad = 1 } END { exit bad }'
bun tmp/2370-verify-pairs.mjs
```

Verify: the `awk` prints nothing (adds equal removes per file), and the
script prints `pairs=<n>; validate unchanged` and throws nothing (every
changed line differs only in field 7, that cell moved to its mapped name,
and P5's reports are unchanged, so no out-of-range row moved). These are
S24's local proof.

## Step 5: S23 before the push

Prove that no old name reads and every renamed slice keeps its points, over
the files the rewrite could touch.

Created (gitignored): `tmp/2370-verify-s23.mjs`

```js
import { readFileSync } from "node:fs";
import { RENAME, OLD_NAMES, INDEX, schemaFiles, list } from "./2370-names.mjs";

const index = JSON.parse(readFileSync(INDEX, "utf-8"));
for (const file of schemaFiles()) {
  for (const old of OLD_NAMES) {
    // Every old name is a zero-match read or an empty file.
    const r = list(file, old);
    if (r.status === 0 && JSON.parse(r.stdout).metrics.length > 0) {
      throw new Error(`${file}: ${old} still reads`);
    }
    if (r.status !== 0 && !/cannot resolve slice/.test(r.stderr)) {
      throw new Error(`${file} ${old}: unexpected failure\n${r.stderr}`);
    }
    // Every renamed slice keeps at least the points the old name had.
    const before = index[file].reads[old];
    if (!before || before.length === 0) continue;
    const n = list(file, RENAME[old]);
    if (n.status !== 0) throw new Error(`${file}: ${RENAME[old]} reads nothing after the rewrite\n${n.stderr}`);
    const after = JSON.parse(n.stdout).metrics;
    for (const m of before) {
      const a = after.find((x) => x.metric === m.metric);
      if (!a || a.n < m.n) throw new Error(`${file}: ${old} ${m.metric} ${m.n} -> ${a ? a.n : 0}`);
    }
  }
}
console.log("no old name reads; every renamed slice keeps every point");
```

```sh
bun tmp/2370-verify-s23.mjs
rg -n 'event_type=kata-' wiki/storyboard-*.md
```

Verify: the script prints
`no old name reads; every renamed slice keeps every point` (S23 at the local
commit; S23 names three old basenames, and the fourth, `kata-storyboard`,
is the defensive superset for the tier 4 window), and the `rg` returns no
match. If a
participant seeded `event_type=kata-shift` on a board between part 02 and
now, change that token to `agent-shift` and add the board to step 6's
`--paths` list.

## Step 6: Publish once and resume

Land the rewrite as one commit and let the writers back in.

```sh
[ -s tmp/2370-changed.txt ] || { echo "nothing to publish"; exit 1; }
sed 's|^wiki/|--paths=|' tmp/2370-changed.txt | xargs bun products/gemba/bin/gemba-wiki.js push
```

`xargs` builds the argument list from the file, which works in bash and zsh
alike (zsh does not word-split an unquoted command substitution). The publish
rebases on the remote tip (nothing moved: the writers are halted), runs the
secret and budget gates over the commit, and lands one commit whose write-set is
the listed CSVs (plus any board from step 5). A secret-gate finding stops the
publish and names the row; resolve it as for any push.

Then the human operator restores the killswitch to the value recorded in
step 1 (`gh variable set KATA_KILLSWITCH --body <value>`, or
`gh variable delete` when it was absent; KATA.md § Killswitch says what a
deletion forfeits).

Verify: `git -C wiki log --oneline -1` is the rewrite commit;
`git -C wiki show --stat HEAD` lists only `metrics/*/*.csv` paths and any
board from step 5; `git -C wiki diff --numstat HEAD~1 HEAD | awk '$1 != $2'`
prints nothing (S24, with step 4's pair check for the cell-only claim);
`rg -n 'event_type=kata-' wiki/storyboard-*.md` returns no match (S25).

## Step 7: Close

Record the outcome and advance the row.

1. Note in the weekly log that every lane's next boot-time integrity sweep
   reports its prior rows as absent once (detection only; the rows are
   present under the new names).
2. Set `wiki/STATUS.md` to `2370\tplan\timplemented` and record the
   `kata-implement` metrics row. Off-workflow, `record` stamps it
   `interactive`, which is its honest stream.
3. Push `STATUS.md`, the log, and the metrics paths with
   `bun products/gemba/bin/gemba-wiki.js push --paths=<each>`.
4. Delete `tmp/2370-*`.

Verify: `rg -n '^2370\t' wiki/STATUS.md` prints `2370    plan    implemented`.
