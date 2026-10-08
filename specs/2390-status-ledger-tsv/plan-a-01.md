# Plan 2390-a Part 01: The library, one grammar home and a declared removal

The first merge. It changes `libraries/libwiki` and the `gemba-wiki` push help
golden. No instruction file changes here.

Depends on: nothing. Route: `staff-engineer`. Pull request title:
`feat(libwiki): rows-only approval ledger and push --remove (#2390)`. After the
merge, post a comment on the pull request that hands part 02 to
`release-engineer`.

Comments in every touched module say "the approval ledger". Only the
`STATUS_FILE` constant spells the file name, and no test spells the old one, so
S4 holds.

## Step 1: The name constant and the grammar home

Make `status.js` the one home of the id grammar, and give the ledger one name.

Modified: `libraries/libwiki/src/constants.js`,
`libraries/libwiki/src/status.js`

- `constants.js`: add `export const STATUS_FILE = "STATUS.tsv";` after
  `MEMORY_FILE`. Rewrite the `SINGLETON_PATHS` comment so it keeps MEMORY.md as
  the founding member and says the approval ledger is not a member: a contended
  row there is a conflict refusal. Delete the sentence that says the ledger's
  phase rows will join.
- `status.js`: replace the file with:

  ```js
  // Approval-ledger rows come in two kinds. A spec row is
  // `{id}<TAB>{phase}<TAB>{status}`. Its id is four digits, with an optional
  // two-digit suffix that names the plan part the row tracks. An experiment
  // row is `exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}`. The `exp:`
  // namespace cannot match the spec id's four-digit anchor, so the two kinds
  // never collide. This module is the one home of the id grammar. A merge gate
  // that reads the ledger with a line pattern carries STATUS_GATE_PATTERN.

  /** The sub-row suffix of a spec id: an optional `/` and a two-digit plan part. */
  export const STATUS_SUB_ROW_FRAGMENT = "(/\\d{2})?";

  /** Matches a status-row id: a four-digit spec id (optional sub-row) or `exp:<issue>`. */
  export const STATUS_ID_REGEX = new RegExp(
    `^(\\d{4}${STATUS_SUB_ROW_FRAGMENT}|exp:\\d+)$`,
  );

  /** The merge gate's `grep -P` pattern for one spec id, as its instruction spells it. */
  export const STATUS_GATE_PATTERN = `^\${spec_id}${STATUS_SUB_ROW_FRAGMENT}\\t`;

  /**
   * Classify a row by its first cell. An `exp:` prefix routes to the
   * experiment rules, whatever follows, so a malformed experiment id still
   * reaches the rule that flags it. A spec id must match STATUS_ID_REGEX.
   * @param {string} id - The first tab cell of a row.
   * @returns {"spec"|"experiment"|null}
   */
  export function statusRowKind(id) {
    if (id.startsWith("exp:")) return "experiment";
    return STATUS_ID_REGEX.test(id) ? "spec" : null;
  }
  ```

- `src/index.js` gains no export. The invariant in part 03 imports
  `src/status.js` and `src/constants.js` by path, as `model-defaults` imports
  `libutil`'s models module.

Verify:
`bun -e 'import("./libraries/libwiki/src/status.js").then(m => console.log(m.STATUS_GATE_PATTERN))'`
prints `^${spec_id}(/\d{2})?\t`.

## Step 2: The audit reads every line as a row

Drop the fence loop and the per-file skip, and admit the ledger by the constant.

Modified: `libraries/libwiki/src/audit/scopes.js`,
`libraries/libwiki/src/audit/status-row.js`,
`libraries/libwiki/src/audit/grammar.js`, `libraries/libwiki/src/audit/rules.js`

- `scopes.js`:
  - Import `STATUS_FILE` and `statusRowKind`. Drop the
    `parseStatusRowId` import.
  - `classifyFile`: delete the two-line comment and the old-name skip.
  - `parseStatusRows`: replace the body. Every line is a row, and the final
    newline opens no row:

    ```js
    function parseStatusRows(statusText) {
      const lines = statusText.split("\n");
      if (lines.at(-1) === "") lines.pop();
      return lines.map((line, i) => {
        const cells = line.split("\t");
        return {
          lineNo: i + 1,
          text: line,
          cells,
          id: cells[0],
          phase: cells[1],
          status: cells[2],
          kind: statusRowKind(cells[0]),
        };
      });
    }
    ```

    Rewrite its JSDoc: every line is a row, an empty line is a row with one
    empty cell, and empty text holds no rows.
  - `buildContext`:
    `status: readOptional(path.join(wikiRoot, STATUS_FILE), fs)`. The memory
    ledger's literal stays, as the design scopes it out.
  - Rewrite the `readOptional` comment to name "the memory, approval-ledger, and
    storyboard loads".
- `status-row.js`: import `STATUS_SUB_ROW_FRAGMENT` beside `STATUS_ID_REGEX`.
  Rewrite the header comment: the scope yields one subject per line of the
  approval ledger.

  | Rule                        | Change                                                                                                                                       |
  | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
  | `status-row.id-format`      | message: `` `Bad id '${r.id}' (expected ^\\d{4}${STATUS_SUB_ROW_FRAGMENT}$)` ``. hint: `` `a spec id is four digits. A sub-row adds the plan part as ${STATUS_SUB_ROW_FRAGMENT}, e.g. 1370/02` `` |
  | `status-row.exp-id-format`  | `check: (s) => (STATUS_ID_REGEX.test(s.id) ? null : { id: s.id })`. Delete its `/^exp:\d+$/` literal, and rewrite its comment to name `statusRowKind`. |

- `grammar.js`: import `STATUS_FILE` from `../constants.js`.
  `const NAMED_LEDGERS = new Set(["Home.md", "MEMORY.md", STATUS_FILE]);`
- `rules.js`: rename the section comment to
  `// -- approval-ledger rows (status-row scope) --`.

Verify: `bun run test` in `libraries/libwiki` passes after step 5.

## Step 3: One non-markdown predicate

One rule decides fence exemption on the publish path and in the audit.

Modified: `libraries/libwiki/src/conflict-markers.js`,
`libraries/libwiki/src/wiki-sync.js`, `libraries/libwiki/src/audit/scopes.js`

- `conflict-markers.js`: add

  ```js
  /**
   * Whether a fenced block in this file quotes content. Only a markdown file
   * quotes, so only a markdown file is fence-exempt.
   * @param {string} filePath
   * @returns {boolean}
   */
  export function isFenceExemptPath(filePath) {
    return filePath.endsWith(".md");
  }
  ```

  Rewrite the two comments that name the old file: a non-markdown surface is
  not fence-exempt, because a fence there quotes nothing. Callers pass
  `isFenceExemptPath(path)`.
- `wiki-sync.js`: delete `pushFenceExempt` and its comment. Import
  `isFenceExemptPath`, and call it in `#refuseIfIntroducedMarkers`. In
  `#assertConserved`, the refusal's last sentence becomes "Pull and re-apply,
  or declare a deliberate removal with `gemba-wiki push --remove=<path>`."
- `scopes.js` `conflictScanSubjects`: every subject takes
  `fenceExempt: isFenceExemptPath(<its path>)`, and the function comment says
  the flag comes from the path.

Verify: `rg -n 'fenceExempt: (true|false),' libraries/libwiki/src/audit`
prints nothing.

## Step 4: `gemba-wiki push --remove`

Give `declareRemoval` its command-line face.

Modified: `libraries/libwiki/src/cli-definition.js`,
`libraries/libwiki/src/commands/sync.js`

- `cli-definition.js`, `push.options`, after `paths`:

  ```js
  remove: {
    type: "string",
    multiple: true,
    description: "Wiki file(s) to delete, declared as a deliberate removal",
  },
  ```

- `sync.js` `runPushCommand`:

  | Stage     | Behavior                                                                                                                                                                                                                                                         |
  | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Read      | `paths = ctx.options?.paths ?? []` and `removes = ctx.options?.remove ?? []`. Resolve `wikiDir` once.                                                                                                                                                            |
  | Check     | `--paths` keeps the existing `unmatchedPaths` helper and its message. Each `--remove` path must be a file the index tracks: `gitClient.lsFiles([p], { cwd: wikiDir })` prints exactly `p`. A file deleted by hand stays in the index, so it passes. A directory, an untracked file, or a deletion already staged with `git rm` fails, because the later `git add -- <p>` cannot stage a path the index has dropped. Each miss returns `{ ok: false, code: 2, error: 'push: --remove "<p>" is not a tracked wiki file. Pull first if only the remote holds it' }`. |
  | Delete    | Unlink each removed path that still exists, through `runtime.fsSync`.                                                                                                                                                                                            |
  | Declare   | `wikiSync.declareRemoval(removes)` when any.                                                                                                                                                                                                                     |
  | Write-set | `[...new Set([...paths, ...removes])]` when that list is non-empty. Otherwise `undefined`, which keeps the session's dirty set.                                                                                                                                  |
  | Report    | On a landed push, print `push: removed <p>` for each removed path after `push: committed and pushed`.                                                                                                                                                            |

  Update the function's JSDoc with one sentence on `--remove`.

Verify: step 5's integration tests.

## Step 5: Tests

Every test that seeds or names the old file moves to the new one, and each new
behavior gets a case.

Modified: in `libraries/libwiki/test/`: `status.test.js`,
`audit-status-row.test.js`, `audit-engine-admission.test.js`,
`audit-grammar.test.js`, `lane-files.test.js`,
`audit-engine-conflict-markers.test.js`, `wiki-sync-guards.test.js`,
`wiki-sync.outcome.test.js`, `conflict-markers.test.js`,
`cli-sync.integration.test.js`

| File                                    | Change                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status.test.js`                        | Replace. `STATUS_ID_REGEX` accepts `0010`, `1370/02`, `exp:1351`, and rejects `1370/libutil`, `1370/2`, `1370/002`, `1370/`, `137`, `exp:`, `exp:abc`. `STATUS_GATE_PATTERN` equals the literal `'^${spec_id}(/\\d{2})?\\t'`. `statusRowKind` returns `spec` for `1370/02`, `experiment` for `exp:abc`, and `null` for `1370/libutil`.            |
| `audit-status-row.test.js`              | Seed `` `${WIKI}/${STATUS_FILE}` `` with rows joined by newlines and no fence. Delete the "ignores prose outside the fence" case. The "master and sub-rows" case uses `1370/02`. Add: `1370/libutil\tplan\tapproved` flags `status-row.id-format` (S3); `exp:1351\tapproved\t<40-hex>\t#1351` flags nothing (S9); `exp:abc` still flags `status-row.exp-id-format`; an empty line flags `status-row.shape`; a last line with no newline is a row; empty text yields zero subjects. |
| `audit-engine-admission.test.js`        | Seed a root `STATUS.tsv` that holds one valid row. Assert no `admission` finding names it (S4).                                                                                                                                                                                                                                              |
| `audit-grammar.test.js`                 | Iterate `["Home.md", "MEMORY.md", STATUS_FILE]`.                                                                                                                                                                                                                                                                                                 |
| `lane-files.test.js`                    | `STATUS.tsv` in place of the old name.                                                                                                                                                                                                                                                                                                           |
| `audit-engine-conflict-markers.test.js` | C4 seeds `STATUS.tsv` rows with a marker block and asserts the finding names `STATUS.tsv`.                                                                                                                                                                                                                                                       |
| `wiki-sync-guards.test.js`              | C9 introduces markers into `STATUS.tsv` and asserts the push path refuses (`would-publish-markers`).                                                                                                                                                                                                                                             |
| `wiki-sync.outcome.test.js`             | The three mock file names become `STATUS.tsv`.                                                                                                                                                                                                                                                                                                   |
| `conflict-markers.test.js`              | `isFenceExemptPath("a.md")` is true. `isFenceExemptPath("STATUS.tsv")` and `isFenceExemptPath("metrics/x/2026.csv")` are false.                                                                                                                                                                                                                  |
| `cli-sync.integration.test.js`          | Four cases on a seeded bare repo. `--remove=<seeded file>` alone exits 0, prints `push: removed <file>`, and `git ls-tree origin/master` lacks the file (S18). The same deletion by hand, pushed with `--paths=<file>` and no `--remove`, exits 1 and prints `wiki-conservation: refusal` on stderr (S18). `--remove` after a `git rm` of the file exits 2. `--remove=nope.md` and `--remove` on an untracked file each exit 2 and change nothing. |

Verify: `cd libraries/libwiki && bun run test` passes, and
`rg -n 'STATUS\.md' libraries/libwiki --glob '!CHANGELOG.md'` prints nothing.

## Step 6: The push help golden and the changelog

Modified: `products/gemba/test/golden/gemba-wiki/push-help.stdout.txt`,
`libraries/libwiki/CHANGELOG.md`

- The golden: add one line after the `--paths=<string>` line, aligned as the
  renderer aligns it:
  `--remove=<string>     Wiki file(s) to delete, declared as a deliberate removal`.
  Do not run the capture script from the repository root. It reads the golden
  directory from its working directory, and without `--exec` it spawns the
  `gemba-wiki` on PATH, which is the released binary.
- `CHANGELOG.md`: under `## Unreleased`, add entries for the rows-only approval
  ledger (`STATUS.tsv`, every line a row, sub-row ids `NNNN/NN` only) and for
  `push --remove`, in the file's existing style.

Verify: `bun test products/gemba/test/golden.test.js` passes, and
`rg -n -- '--remove' products/gemba/test/golden/gemba-wiki/push-help.stdout.txt`
matches.

## Step 7: Whole-repository checks

Modified: nothing.

Verify: `bun run check`, `bun run test`, and `bunx jidoka invariants` pass. A
scratch wiki, a `git init` directory with the row committed, holding
`1370/libutil\tplan\tapproved` in `STATUS.tsv` gives a `status-row.id-format`
finding from `bunx gemba-wiki audit --wiki-root <dir>`, and
`1370/02\tplan\tapproved` gives none.

— Staff Engineer 🛠️
