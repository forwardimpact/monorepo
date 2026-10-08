# Plan 2390-a Part 04: This repository's cutover and closing checks

This repository's wiki is not tracked by the repository, so part 03's merge
cannot carry the conversion. The release engineer that merges part 03 runs the
first changelog entry's steps by hand, in the same session, right after the
merge. Part 03's pull request body carries the procedure below verbatim. The
changelog entry is the canonical procedure. The commands below are its hand
form for this repository, whose sub-rows all have two-digit parts.

Depends on: part 03 merged. Route: `release-engineer`.

The gate merges part 03 under the instructions on `main` before the merge, so
any Step 9 write lands in the markdown ledger. The conversion carries it over.
From the merge to step 4, every gated merge blocks on an absent ledger, and
`kata-spec` stops on one. Nothing is wrong in that window.

Run every command from the repository root.

## Step 1: Pull the wiki

Modified: nothing.

```sh
bunx gemba-wiki pull
```

Verify: `pull: up to date`, and `test -e wiki/STATUS.md` passes. If
`wiki/STATUS.tsv` already exists, a writer created it, and step 2 keeps its
rows.

## Step 2: Convert the rows

Modified: `wiki/STATUS.tsv` (created)

```sh
fenced=$(mktemp)
touch wiki/STATUS.tsv
awk '/^```/ { f = !f; next } f && NF' wiki/STATUS.md > "$fenced"
awk -F'\t' '{ n[$1]++ } END { for (k in n) if (n[k] > 1) print "duplicate: " k }' "$fenced"
awk -F'\t' 'FILENAME == ARGV[1] { seen[$1] = 1; next } ($1 in seen) { print "in both: " $1 }' \
  wiki/STATUS.tsv "$fenced"
awk -F'\t' 'FILENAME == ARGV[1] { seen[$1] = 1; next } !($1 in seen)' \
  wiki/STATUS.tsv "$fenced" >> wiki/STATUS.tsv
```

`FILENAME == ARGV[1]` keeps the seen-set correct when `STATUS.tsv` is empty,
where `NR == FNR` would load the fenced rows into it. The `duplicate:` lines
name ids that the old fence holds more than once, such as `0160`. Show them to
the human who merged part 03, delete the row they do not keep, and run step 2's
verify.

Verify: `grep -c '' wiki/STATUS.tsv` equals the non-empty fenced rows, plus the
rows `STATUS.tsv` held before, minus the `in both:` lines and the deleted
duplicates. `awk -F'\t' 'NF != 3 && NF != 4 { exit 1 }' wiki/STATUS.tsv`
exits 0.

## Step 3: Point the index and memory pages at the new file

Modified: `wiki/Home.md`, `wiki/MEMORY.md`

| File        | Old                      | New                        |
| ----------- | ------------------------ | -------------------------- |
| `Home.md`   | `[STATUS](STATUS)`       | `[STATUS.tsv](STATUS.tsv)` |
| `MEMORY.md` | `[STATUS.md](STATUS.md)` | `[STATUS.tsv](STATUS.tsv)` |

Verify: `rg -n 'STATUS\.tsv' wiki/Home.md` matches, and
`rg -n '\]\(STATUS(\.md)?\)' wiki/Home.md wiki/MEMORY.md` prints nothing.

## Step 4: Publish with the declared removal

Modified: the wiki remote

```sh
bunx gemba-wiki push --remove=STATUS.md --paths=STATUS.tsv --paths=Home.md --paths=MEMORY.md
```

On any refusal, such as a conservation refusal or a rebase conflict from a
session that wrote the old file during the cutover, reset the clone to the
remote tip (`git -C wiki reset --hard origin/master`), which restores the old
file, and run steps 2 to 4 again.

Verify: the output ends with `push: removed STATUS.md`, and
`git -C wiki ls-tree --name-only origin/master` lists `STATUS.tsv` and not
`STATUS.md`.

## Step 5: Closing checks

Modified: nothing.

| Criterion | Command                                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1        | `test ! -e wiki/STATUS.md` passes, and `awk -F'\t' 'NF != 3 && NF != 4 { exit 1 }' wiki/STATUS.tsv` exits 0.                                                                                  |
| S2        | `grep -c '' wiki/STATUS.tsv` equals `.checked["status-row"]` in `bunx gemba-wiki audit --format json`, and the audit reports no `status-row` finding and no finding whose path names `STATUS.tsv`. |
| S16       | Step 3's verify.                                                                                                                                                                              |
| S20       | `curl -fsSL -o /dev/null https://github.com/forwardimpact/monorepo/wiki/STATUS.tsv` exits 0.                                                                                                    |
| S19       | `git merge-base --is-ancestor <commit> <part 03 merge commit>` passes for the `gear@v0.3.11` tag commit and for part 02's tier 4 merge commit, both named in part 02's hand-off.                |
| Gate      | The next gated pull request's Step 6 read finds its row in `wiki/STATUS.tsv`.                                                                                                                 |
| Audit     | The next `Curate wiki` run's issue comment, if any, names no finding on `STATUS.tsv`.                                                                                                         |

## Step 6: Report the cutover

Modified: nothing.

Post one comment on part 03's pull request with each step 5 row's result and
the `duplicate:` and `in both:` output. The master `2390` row already reads
`plan implemented` from the earlier merges.

Verify: the comment exists, and
`grep -P '^2390\t' wiki/STATUS.tsv` prints `2390\tplan\timplemented`.

— Staff Engineer 🛠️
