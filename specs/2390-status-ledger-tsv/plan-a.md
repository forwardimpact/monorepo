# Plan 2390-a: a rows-only ledger, a declared removal, and an update procedure

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The plan follows the design's two-merge order. Part 01 is the first merge. It
changes `libwiki` only: one name constant, one exported sub-row fragment, a kind
classifier, a loader that reads every line as a row, one non-markdown
predicate, and `gemba-wiki push --remove`. Part 02 is the release chain that
puts part 01 on every runner: the npm packages, the gear bundle, the bootstrap
installer, `kata-agent`, and this repository's workflow pins. Part 03 is the
second merge. It carries every instruction, page, and pack change, the
gate-pattern invariant, the `kata-setup` update procedure with its changelog,
and the rehearsal transcripts. Part 04 converts this repository's wiki after
part 03 merges and closes the success criteria that need the converted wiki.

Libraries used: libwiki (WikiSync.declareRemoval, scanConflictMarkers,
classifyPath, buildContext), libutil (GitClient.lsFiles and GitClient.status,
through the existing `unmatchedPaths` helper).

## Decisions the design leaves open

| Decision                         | Detail                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library names                    | `STATUS_FILE = "STATUS.tsv"` in `constants.js` beside `MEMORY_FILE`. `STATUS_SUB_ROW_FRAGMENT`, `STATUS_ID_REGEX`, `STATUS_GATE_PATTERN`, and `statusRowKind` in `status.js`. The package entry gains no export, because the only outside reader, the invariant, imports the source module by path as `model-defaults` does.                        |
| Gate-pattern string              | `STATUS_GATE_PATTERN` is the literal text `^${spec_id}(/\d{2})?\t`, the same characters Step 6 carries inside `grep -P "…"`. The invariant composes `` grep -P "<pattern>" wiki/<STATUS_FILE> `` from both exports and compares strings.                                                                                                              |
| One grammar for both kinds       | `statusRowKind` routes on the `exp:` prefix. The `exp-id-format` rule tests `STATUS_ID_REGEX`, so the regex holds the only copy of each id form.                                                                                                                                                                                                        |
| Non-markdown predicate           | `isFenceExemptPath(filePath)` in `conflict-markers.js` returns `filePath.endsWith(".md")`. The publish path and every audit conflict subject take their flag from it.                                                                                                                                                                                  |
| `--remove` rule, write-set, report | `--paths` keeps the existing `unmatchedPaths` rule. A `--remove` path must be a file the index tracks, so a directory, an untracked file, or a deletion already staged with `git rm` is a usage error. A file deleted by hand passes. `--remove` alone scopes the commit to the removed paths. With `--paths`, the write-set is the union. A landed push prints one `push: removed <path>` line per path.                 |
| The bare word STATUS             | Prose keeps `STATUS` as the ledger's short name (`the STATUS row`, `Write STATUS`). Every path spelling becomes `wiki/STATUS.tsv` or `STATUS.tsv`.                                                                                                                                                                                                      |
| The absent-ledger rule           | The team protocol owns it and names the one remedy, `/kata-setup Update my installation`. `kata-spec` and `ship-it` stop on it and point at the protocol.                                                                                                                                                                                              |
| Sub-rows in Step 9               | Step 9 sets the part's sub-row when the spec has sub-rows, and sets the master row to `plan implemented` only after every sub-row reads it.                                                                                                                                                                                                             |
| `kata-setup` step shape          | Step 1 and Step 2 each gain one update sentence, so an agent that reads in order meets them first. A new `### Step 6: Apply the Changelog` holds the detection loop. The report becomes Step 7. Step 5 reruns Steps 3 and 4, so the order is the design's diagram.                                                                                  |
| Pack manager floor               | `apm` 0.13.0. Its changelog moves the binary's self-updater to `apm self-update`, and `apm update` refreshes project dependencies from that release on. The getting-started page and the `kata-setup` prerequisites state it.                                                                                                                           |
| Changelog history link           | The changelog names its retired entries' home as `https://github.com/forwardimpact/monorepo/commits/main/.claude/skills/kata-setup/references/changelog.md`, the canonical-URL form the genericity invariant sanctions.                                                                                                                                |
| This spec's own rows           | The master row tracks every part, as for specs 2350 and 2360, because parts 01 to 03 merge under the Step 9 on `main`, which sets the master row. Part 01's merge sets `2390 plan implemented`, so the staff engineer's Assess route no longer selects this spec. Each part's hand-off therefore names the next part's owner and pull request target explicitly. |

Amendments to the spec and the design, carried by this pull request. The user
approved them in the planning session on 2026-10-08.

- **The first entry also creates a missing ledger.** On a Kata installation set
  up from the getting-started page, `gemba-wiki init` creates no ledger, so
  `kata-spec` would stop for good. Spec item 11 and the design's detection row
  now read "`wiki/STATUS.md` exists, or `wiki/.git` exists without
  `STATUS.tsv`", and the entry creates the ledger when it is absent. A writer
  that finds no ledger names the update procedure only (spec item 5, S7). The
  getting-started page runs the update prompt once after `gemba-wiki init`.
- **A sub-row with a non-numeric part always gets a two-digit part.** The old
  item 11 let the operator cancel such a row in place, but the new audit
  rejects its id. The entry asks for a two-digit part and whether to cancel the
  row, so a cancelled row keeps a valid id.

Deviations from the design, with reasons:

- **`--remove` checks the clone.** The design makes a path absent from the clone
  and the remote tip a usage error. Part 01 makes a path the clone's index does
  not track a usage error, and the message says to pull first. A path only the
  remote holds would come back in the push's own rebase, after the deletion was
  staged.
- **`statusRowKind` routes on the prefix.** The design's classifier validates
  the id. The classifier validates a spec id, and the `exp-id-format` rule
  validates an experiment id, so a malformed `exp:` row still gets the
  experiment findings.
- **This repository's audit repins too.** The design repins `kata-agent` in this
  repository. `curate-wiki.yml` runs the daily audit on its own
  `gemba-bootstrap` pin, and the old binary reports `STATUS.tsv` as an
  unadmitted file. Part 02 repins that workflow's bootstrap as well. The other
  bootstrap pins never audit, and Dependabot moves them.
- **The rehearsal copies the branch's skills.** S10 runs `apm update` on an
  installation from the previous pack. Before part 03 merges, `apm update`
  cannot fetch the new pack. The rehearsal runs `apm update`, then copies the
  branch's changed skills and agent files over the installed copies, as plan
  2360-a did. The pull request states this.

## Parts

| Part               | Title                                                          | Depends on        |
| ------------------ | -------------------------------------------------------------- | ----------------- |
| [01](plan-a-01.md) | The library: one grammar home and a declared removal           | nothing           |
| [02](plan-a-02.md) | The release chain and this repository's repins                 | part 01 merged    |
| [03](plan-a-03.md) | Instructions, pages, pack, invariant, and the update procedure | part 02 complete  |
| [04](plan-a-04.md) | This repository's cutover and closing checks                   | part 03 merged    |

## Execution

- **Agent route.** Parts 01 and 03 go to `staff-engineer`. Part 03's website
  pages can go to `technical-writer` on the same branch, after step 1 of
  part 03 lands. Parts 02 and 04 go to `release-engineer`. Part 03's rehearsals
  need a session with a human operator's `gh` login, as plan 2360-a's did.
  Writes under `.claude/` go through `echo … | bunx gemba-selfedit <path>` when
  the harness blocks them.
- **Order.** Strictly sequential. Part 03 may be drafted beside parts 01 and 02,
  but it opens its pull request only after part 02's last tier merges, because
  S19 needs the gear tag and the workflow repin to be ancestors of part 03's
  merge. Part 04 runs in the session that merges part 03.
- **Merge gate.** Part 01 and part 03 follow the normal gate. Part 02's workflow
  repins follow the gate's rule for `.github/` changes.
- **Verify before each merge.** `bun run check`, `bun run test`, and
  `bunx jidoka invariants` pass on parts 01 and 03.
- **Success criteria.**

  | Criterion                                | Verifies at                                    |
  | ---------------------------------------- | ---------------------------------------------- |
  | S3, S4, S9, S18, and the S21 help golden | Part 01's branch                               |
  | S19                                      | Part 02's tags, then part 03's merge commit    |
  | S5–S8, S10–S15, S17, S21, S22            | Part 03's branch and its rehearsal transcripts |
  | S1, S2, S16, S20                         | Part 04, after the conversion                  |
  | S23                                      | Part 03's last step                            |

## Risks

| Risk                                                                                                                                                                                | Mitigation                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Between part 01's merge and part 04, this repository's local `gemba-wiki` (the workspace library) does not audit `STATUS.md` rows, and the publish path reads that file's fence as prose. | The window is days. Writers keep the old instructions, and the gate keeps reading the old file, until part 03 merges. Part 04 audits the converted wiki.                                                                                              |
| An installation whose session hook pins an older gear release has a `gemba-wiki` without `--remove`, so the first entry's push fails. | The failure is loud: the option is unknown and nothing publishes, and the report names the entry. The operator moves the pin and runs the update again, which is safe because the entry's Detect decides. |
| `declareRemoval` keeps its sidecar until a push lands. A refused `--remove` push leaves the declaration for the next push from that clone.                                         | The library already behaves this way for retries. The first changelog entry is the only caller, and the design's recovery is to reset the clone to the remote tip and re-run the entry, which re-declares it.                                       |
| This repository's ledger holds two `0160` rows, and a writer replaces only one row per id.                                                                                          | Part 04 reports duplicate ids before it publishes and asks the human who merged part 03 which row stays.                                                                                                                                              |
| An unrelated release lands during part 02, so the expected version numbers are taken.                                                                                               | The tag space is append-only. Take the next patch above the highest tag at each tier.                                                                                                                                                                 |
| `kata-setup` lands about 11 words under its cap, so the next change to its body breaches it.                                                                                        | The changelog is a reference with its own budget. A new entry never touches `SKILL.md`.                                                                                                                                                              |

— Staff Engineer 🛠️
