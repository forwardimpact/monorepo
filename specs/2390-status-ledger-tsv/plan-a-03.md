# Plan 2390-a Part 03: Instructions, pages, pack, invariant, and the update procedure

The second merge. Every instruction, page, and pack surface names the rows-only
ledger, the gate's pattern sits under an invariant, and `kata-setup` gains the
update procedure with its first changelog entry.

Depends on: part 02 complete (S19). Route: `staff-engineer`, with the website
pages in step 9 open to `technical-writer` on the same branch. Pull request
title: `feat(kata): rows-only approval ledger and the installation update
procedure (#2390)`.

**Renames.** Where a step says "rename", replace `wiki/STATUS.md` with
`wiki/STATUS.tsv` and a bare `STATUS.md` with `STATUS.tsv`. The rename is
word-neutral, so it is safe in a file at its word cap. The bare word `STATUS`
stays as the ledger's short name.

## Step 1: The gate reads the new file, under an invariant

The gate's copy of the sub-row fragment and the check that holds it land
together, so the check passes from its first commit.

Created: `.jidoka/invariants/status-gate-pattern.rules.mjs`
Modified: `.claude/skills/kata-release-merge/SKILL.md`

- `status-gate-pattern.rules.mjs`: the header comment says the rule keeps the
  gate's copy of the ledger read equal to the library's exports, because
  markdown cannot import a constant. The module follows `model-defaults`:

  ```js
  import { resolve } from "node:path";
  import { pathToFileURL } from "node:url";

  const LIBWIKI = "libraries/libwiki/src";
  const GATE_PATH = ".claude/skills/kata-release-merge/SKILL.md";
  const GATE_HEADING = /^### Step \d+: Approval Gate$/;

  // The text from the Approval Gate heading to the next `### ` heading.
  function gateSection(text) {
    const lines = text.split("\n");
    const start = lines.findIndex((l) => GATE_HEADING.test(l));
    if (start === -1) return null;
    const end = lines.findIndex((l, i) => i > start && l.startsWith("### "));
    return lines.slice(start, end === -1 ? undefined : end).join("\n");
  }

  const load = (root, file) =>
    import(pathToFileURL(resolve(root, LIBWIKI, file)));

  export default {
    name: "status-gate-pattern",

    async build({ root, readText }) {
      const { STATUS_GATE_PATTERN } = await load(root, "status.js");
      const { STATUS_FILE } = await load(root, "constants.js");
      const text = readText(GATE_PATH);
      return {
        subjects: {
          gate: [
            {
              path: resolve(root, GATE_PATH),
              section: text == null ? null : gateSection(text),
              want: `grep -P "${STATUS_GATE_PATTERN}" wiki/${STATUS_FILE}`,
            },
          ],
        },
      };
    },

    rules: () => [
      {
        id: "status-gate-pattern.drift",
        scope: "gate",
        severity: "fail",
        check: (s) => (s.section?.includes(s.want) ? null : { want: s.want }),
        message: (_s, r) =>
          `the kata-release-merge Approval Gate step does not carry ${r.want}`,
        hint: `copy the read from ${LIBWIKI}/status.js and constants.js`,
      },
    ],
  };
  ```

- `kata-release-merge/SKILL.md`:
  - Rename in the frontmatter description, the DO-CONFIRM item, and Step 9.
  - Step 6, the paragraph that starts "Read `wiki/STATUS.md` for the PR's spec
    id": replace its first four sentences, through the roll-up sentence, with
    the text below. Keep the inline code span on one line. The rest of the
    paragraph stays.

    > Read the PR's spec id rows with
    > `grep -P "^${spec_id}(/\d{2})?\t" wiki/STATUS.tsv`, which matches the
    > master row and its `NNNN/NN` plan-part sub-rows. Any non-zero exit is an
    > absent row, so a missing `wiki/STATUS.tsv` is an absent row too. Pass
    > when the row shows the classified phase at `approved`, or at
    > `implemented` for the terminal plan row.

  - Step 9, the bullet that starts "Update `wiki/STATUS.md` before you merge":
    replace it with

    > Update `wiki/STATUS.tsv` before you merge. Set the spec's row to
    > `{NNN}\tplan\timplemented`. When the spec tracks plan parts on sub-rows,
    > set the part's sub-row instead, and set the master row only after every
    > sub-row reads `plan implemented`. Commit the wiki change. The Stop hook
    > pushes it.

Verify: `bunx jidoka invariants` passes. On a scratch copy of the repository
where Step 6 reads `(/\d{3})?`, it fails with `status-gate-pattern.drift` (S6).
`rg -n 'absent' .claude/skills/kata-release-merge/SKILL.md` matches the new
Step 6 sentence (S8).

## Step 2: The gate's references

Modified: in `.claude/skills/kata-release-merge/references/`:
`experiment-path.md`, `comment-gate.md`, `metrics.md`, `templates.md`

Rename in each. `experiment-path.md` keeps its state table. Its approval read
names `wiki/STATUS.tsv` and reads the `exp:{issue}` row the same whole-file way.

Verify: `rg -n 'STATUS\.md' .claude/skills/kata-release-merge` prints nothing.

## Step 3: The team protocol and the work-trackers reference

Modified: `.claude/agents/x-team-protocol.md`,
`.claude/agents/x-work-trackers.md`

- `x-team-protocol.md` § Approval: replace the first paragraph with

  > `wiki/STATUS.tsv` is the approval record. It holds tab-separated rows and
  > nothing else. `gemba-wiki audit` defines the id forms, the row kinds, and
  > the phase and status words. A spec row reads `{id}\t{phase}\t{status}`, and
  > `implemented` applies to a plan row only. A writer replaces the row it finds
  > and appends the row it does not. A writer that finds no `wiki/STATUS.tsv`
  > writes nothing, stops, and names `/kata-setup Update my installation`,
  > which creates it. No human edits the file by hand.

  The bullets stay.
- `x-work-trackers.md`: rename.

Verify:
`rg -n 'fenced|STATUS\.md' .claude/agents/x-team-protocol.md .claude/agents/x-work-trackers.md`
prints nothing, and `rg -n -e 'NNNN/' -e 'd\{4\}' -e 'a-z0-9-' .claude/agents`
prints nothing.

## Step 4: The writer skills and profiles

Each writer names the file and shows the literal row it writes. The two writers
that create a first row stop on an absent ledger and point at the protocol.

Modified: `.claude/skills/kata-spec/SKILL.md`,
`.claude/skills/kata-design/SKILL.md`, `.claude/skills/kata-plan/SKILL.md`,
`.claude/skills/kata-archive/SKILL.md`,
`.claude/skills/kata-session/references/issue-lifecycle.md`,
`.claude/skills/ship-it/SKILL.md`, `.claude/agents/product-manager.md`,
`.claude/agents/archivist.md`

| File                 | Change                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kata-spec`          | Rename throughout. Step 1's first three sentences become: "Read `wiki/STATUS.tsv`. If it is absent, stop as [team protocol § Approval](../../agents/x-team-protocol.md#approval) says. Otherwise pick the next available id: the next multiple of 10 above the current highest. Append the row `{NNN}\tspec\tdraft`." The rest of Step 1 stays. |
| `kata-design`        | Rename throughout. In § Approval, "writes that signal to STATUS" becomes "writes the row `{NNN}\tdesign\tapproved`".                                                                                                                                                                                                                                    |
| `kata-plan`          | Rename throughout.                                                                                                                                                                                                                                                                                                                                     |
| `kata-archive`       | Rename. The frontmatter's "Remove past-period wiki files directly." becomes "Remove past-period wiki files with a declared removal." The Step 3 bullet "remove directly with an ordinary wiki write" becomes "remove it with `gemba-wiki push --remove=<path>`, which declares the removal to the conservation guard".                                 |
| `issue-lifecycle.md` | "its memory's `STATUS.md`" becomes "`wiki/STATUS.tsv`".                                                                                                                                                                                                                                                                                                |
| `ship-it`            | Rename throughout. The paragraph "Locate the row for the spec id in the fenced code block …" becomes: "Replace the spec id's row in `wiki/STATUS.tsv` in place, or append it for a new spec. If the file is absent, stop as the team protocol § Approval says."                                                                                         |
| `product-manager.md` | Rename.                                                                                                                                                                                                                                                                                                                                                |
| `archivist.md`       | Rename. The frontmatter's "storyboards directly in the wiki" becomes "storyboards from the wiki with a declared removal". "Remove them directly in `wiki/`." becomes "Remove them as `kata-archive` Step 3 says."                                                                                                                                     |

Verify:
`rg -n 'STATUS\.md|files directly|directly in' .claude/skills/kata-archive/SKILL.md .claude/agents/archivist.md`
prints nothing.

## Step 5: The scaffold

Modified: `.claude/skills/monorepo-setup/SKILL.md`,
`.claude/skills/monorepo-setup/references/wiki-init.md`,
`.claude/skills/monorepo-setup/references/repo-skeleton.md`

- `SKILL.md` and `repo-skeleton.md`: rename.
- `wiki-init.md`:
  - Rename in the opening paragraph.
  - "Each file holds only a scaffold: a heading, a one-line description of what
    the surface is for, and an empty table or fence." becomes "Each markdown
    file holds only a scaffold: a heading, a one-line description of what the
    surface is for, and an empty table. `STATUS.tsv` is empty."
  - In the `Home.md` block, the bullet becomes
    `- [STATUS.tsv](STATUS.tsv) — canonical approval record, rows only.`
  - Replace the whole `### wiki/STATUS.md` section, through its closing fence,
    with:

    ```markdown
    ### wiki/STATUS.tsv

    The approval record. It holds tab-separated rows and nothing else, and
    `gemba-wiki audit` defines the row shape. Scaffold it as an empty file:
    `: > wiki/STATUS.tsv`. The first spec adds the first row.
    ```

Verify: `rg -n 'STATUS\.tsv' .claude/skills/monorepo-setup` matches (S15),
`rg -n 'fence' .claude/skills/monorepo-setup/references/wiki-init.md` prints
nothing, and `wiki-init.md` has 128 lines or fewer.

## Step 6: The `gemba-wiki` surfaces

Modified: `.claude/skills/gemba-wiki/SKILL.md`,
`websites/gemba/docs/predictable-team/wiki-operations/index.md`

- `SKILL.md`: replace the three-line pathspec paragraph with three lines:

  ```markdown
  `push --paths=<pathspec>` (repeatable) scopes the commit. A pathspec that
  matches no tracked path or pending change is a usage error. `--remove=<path>`
  deletes a wiki file and declares the removal, so the guard lets it land.
  ```

- `wiki-operations/index.md`: after the paragraph that ends "`pull` exits
  non-zero with a diagnostic when it detects a conflict.", add:

  ````markdown
  `push --remove=<path>` deletes a wiki file and declares the removal, so the
  conservation guard lets the deletion land. Without the option, the guard
  refuses a push that deletes a file the remote holds. A path the clone does
  not track is a usage error, so pull first when only the remote holds it.

  ```sh
  npx gemba-wiki push --remove=old-page.md
  ```

  ```text
  push: committed and pushed
  push: removed old-page.md
  ```
  ````

Verify: `rg -n -- '--remove'` matches in the skill, the page, and part 01's
golden (S21). The skill has 192 lines or fewer.

## Step 7: The `kata-setup` update procedure and its changelog

Created: `.claude/skills/kata-setup/references/changelog.md`
Modified: `.claude/skills/kata-setup/SKILL.md`,
`.claude/skills/kata-setup/references/schedules.md`,
`.claude/skills/kata-setup/references/parameters-agents.md`

- `changelog.md`:

  ```markdown
  # Installation Changelog

  Each entry is a convention change an installation takes that a regeneration
  does not deliver. Entries are newest first, and the Apply the Changelog step
  of `SKILL.md` runs them oldest first. Detect reads the installation, so an
  entry is safe to apply twice. The file holds at most eight entries of at most
  eighty words each. Retired entries stay in the
  [file's history](https://github.com/forwardimpact/monorepo/commits/main/.claude/skills/kata-setup/references/changelog.md).

  | Change | Detect | Do |
  | --- | --- | --- |
  | The ledger is `wiki/STATUS.tsv`, rows only. | `wiki/STATUS.md` exists, or `wiki/.git` exists without `STATUS.tsv`. | Run `gemba-wiki pull`. Create `wiki/STATUS.tsv` if absent. Append each non-empty fenced `STATUS.md` row whose id it lacks, and report each id in both. For a sub-row whose part is not two digits, ask for one, and whether to cancel the row. Link `STATUS.tsv` wherever `Home.md` or `MEMORY.md` names the old file. Run `gemba-wiki push --paths=STATUS.tsv` with `--remove=STATUS.md` when it exists and `--paths=` for each edited page. |
  ```

- `SKILL.md`:

  | Place              | Change                                                                                                                                                                                                                                                                                 |
  | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Frontmatter        | Append "Use it to update an installation after a pack update." to the description.                                                                                                                                                                                                     |
  | `## When to Use`   | Add `- Update an installation after \`apm update\`: \`Update my installation\``.                                                                                                                                                                                                       |
  | `## Prerequisites` | Add `- \`apm\` 0.13.0 or later`.                                                                                                                                                                                         |
  | Step 1             | After the opening two sentences, add "On `Update my installation`, read these answers from the files and ask nothing."                                                                                                                                                                 |
  | Step 2             | Delete the **Timezone** paragraph and the **Killswitch** paragraph. After the paragraph that ends "Change no other existing file before Step 5.", add "On an update, go on to Step 5 with every generated file named as a change. A file the operator declines keeps its shape." |
  | New Step 6         | Insert before the report step, which becomes `### Step 7: Report`. Text below.                                                                                                                                                                                                         |
  | Step 7             | Add a first bullet: "On an update, name each file regenerated or declined, and each changelog entry applied, or say that none applied."                                                                                                                                               |

  ```markdown
  ### Step 6: Apply the Changelog

  On every run, after Step 5, take the entries of
  [`references/changelog.md`](references/changelog.md) oldest first. Run each
  Detect in the installation. When one fires, show what its Do changes, and run
  Do when the operator accepts. When the oldest entry fires, say that retired
  entries may apply too, and link the changelog's history. Then rerun Step 3.
  ```

- `schedules.md`: "The `SKILL.md` timezone rule picks a block by offset."
  becomes "The timezone rule below picks a block by offset." After that
  paragraph, add the deleted Timezone paragraph from `SKILL.md`, with its bold
  label, and with "Pick the `references/schedules.md` zone whose summer or
  winter offset is nearest." changed to "Pick the zone below whose summer or
  winter offset is nearest."
- `parameters-agents.md`: "`derived:` the `SKILL.md` timezone rule" becomes
  "`derived:` the `schedules.md` timezone rule".

Verify: the entry's three cells hold 80 words or fewer
(`awk -F'|' '/^\| The ledger/ {print $2 $3 $4}' changelog.md | wc -w`).
`bunx jidoka instructions` passes, and its `kata-setup/SKILL.md` count is at
most 1,280 words (about 1,261 by simulation).
`rg -n 'SKILL\.md|references/schedules' .claude/skills/kata-setup/references/schedules.md .claude/skills/kata-setup/references/parameters-agents.md`
prints nothing.

## Step 8: The obligation

Modified: `.claude/skills/CLAUDE.md`, `libraries/CLAUDE.md`

- `.claude/skills/CLAUDE.md`: replace the `## \`## Documentation\` section` and
  `## Parity with CLIs` sections, through the end of the file, with:

  ```markdown
  ## `## Documentation` section

  A `fit-*` or `gemba-*` skill with a matching CLI ends with a
  `## Documentation` section. Its list and the CLI's `documentation` array carry
  the same entries in the same order. A change to one updates the other in the
  same commit. [libraries/CLAUDE.md](../../libraries/CLAUDE.md) and
  [products/CLAUDE.md](../../products/CLAUDE.md) own the rest of the link rule.

  ## Conventions an installation carries

  A convention an installation carries is anything a published skill, agent
  profile, or agent reference tells an installation to hold that neither a pack
  update nor a `kata-setup` regeneration delivers. Examples are wiki ledger
  files and their row shapes, settings keys, secret, variable, and label names,
  and a rename of a generated file. A change to such a convention adds an entry
  to `kata-setup/references/changelog.md` in the same change, in the shape that
  file states. An entry's Detect decides, so the entry is safe to apply twice.
  The changelog holds at most eight entries, and the change that adds a ninth
  retires the oldest.
  ```

- `libraries/CLAUDE.md`: add a third paragraph to `## Audience`:

  > A library change can move a convention an installation carries, such as a
  > wiki file name or a row shape. Such a change follows the changelog rule in
  > [.claude/skills/CLAUDE.md](../.claude/skills/CLAUDE.md#conventions-an-installation-carries).

Verify: `rg -n 'changelog' .claude/skills/CLAUDE.md libraries/CLAUDE.md`
matches in both (S14), and `bunx jidoka instructions` passes.

## Step 9: KATA.md, the references CLAUDE.md, and the `www.kata.team` pages

Modified: `KATA.md`, `references/CLAUDE.md`, and in `websites/kata/docs/`:
`getting-started/index.md`, `spec-to-shipped/index.md`,
`spec-to-shipped/approval-gates/index.md`, `continuous-improvement/index.md`,
`continuous-improvement/team-memory/index.md`,
`continuous-improvement/findings-to-action/index.md`

| File                        | Change                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KATA.md` § Shared Memory   | `**STATUS.tsv** — canonical approval record for every spec, rows only (see § Approval Signal).`                                                                                                                                                                                                                                                                                   |
| `KATA.md` § Trust Boundary  | "Trusted humans translate those findings into `wiki/STATUS.md` writes." becomes "Trusted humans give approval signals, and agents record them in `wiki/STATUS.tsv`." In the diagram, the human node reads `Trusted Human<br/>approval signal`, and its edge label reads `wiki/STATUS.tsv`.                                                                                      |
| `KATA.md` § Approval Signal | The first sentences become "`wiki/STATUS.tsv` records approval state. It holds tab-separated rows and nothing else, one row per spec: `{id}\t{phase}\t{status}`."                                                                                                                                                                                                                  |
| `references/CLAUDE.md`      | Rename.                                                                                                                                                                                                                                                                                                                                                                           |
| `getting-started`           | Rename. The `apm` prerequisite reads "The `apm` agent package manager, 0.13.0 or later, and the authenticated `gh` CLI". At the end of § Initialize shared memory, add "Then run the update prompt in § Keep the installation current, linked by its anchor, once. It creates the approval record, `wiki/STATUS.tsv`." Add the section below before `## What's next`. |
| `approval-gates`            | Rename in the prerequisites, the diagram, and the verify list. In § How the signal reaches STATUS, the first paragraph becomes "`wiki/STATUS.tsv` is the canonical record. It holds tab-separated rows and nothing else, and one row holds one specification." The example and the lifecycle legend stay.                                                                          |
| `spec-to-shipped`           | Rename. "A wiki checkout holds `wiki/STATUS.md`. Gemba ships the commands that create and sync it." becomes "A wiki checkout holds `wiki/STATUS.tsv`. The `kata-setup` update creates it, and Gemba ships the commands that sync it." "STATUS is a tab-separated file with one row per change" becomes "STATUS holds tab-separated rows and nothing else, one row per change". |
| The other three pages       | Rename. Keep the `team-memory` tree's column alignment.                                                                                                                                                                                                                                                                                                                           |

The new getting-started section:

````markdown
## Keep the installation current

A pack update changes the skills and the agent profiles. It does not change
your workflow files or your wiki. Two commands take both:

```sh
apm update
echo "/kata-setup Update my installation" | claude
```

`apm update` refreshes the packs from `apm` 0.13.0 on. Older versions update
the `apm` binary instead. The setup skill regenerates each file it generates
and shows the difference before it writes. It then applies each changelog
entry your installation has not taken, and it asks before each change. Review
the result and open one pull request.
````

Verify: `rg -n 'STATUS\.md' KATA.md websites references/CLAUDE.md` prints
nothing, and the getting-started page shows `apm update` followed by the
`Update my installation` prompt (S17).

## Step 10: Delete the one-off migration script

Deleted: `scripts/spec-1060-migrate-wiki.mjs`

Verify:
`rg -n --hidden 'spec-1060-migrate-wiki' --glob '!specs/**' --glob '!wiki/**'`
prints nothing.

## Step 11: Rehearsals

Two transcripts, each from a fresh sub-agent that runs the branch's skills. The
implementer answers as the operator. Both run in the scratchpad, outside the
repository, with the part 02 `gemba-wiki` on PATH (`gemba-wiki push --help`
lists `--remove`).

| Rehearsal     | Setup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Run and expected result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 (S10, S11) | A `git init` repository with one commit and no remote. `apm install` both packs at the last `kata-skills` and `gemba-skills` tags before this branch, then run that `kata-setup` once, self-hosted, to generate the workflows. A bare repository serves as the wiki remote through `FIT_WIKI_URL`, and `gemba-wiki init` clones it. Seed the wiki with `STATUS.md` (a header, then a fence holding `0010\tspec\tapproved`, `0020/libutil\tplan\tapproved`, an empty line, and `0030\tdesign\tdraft`), `STATUS.tsv` holding `0030\tdesign\tapproved`, `Home.md` linking `[STATUS](STATUS)`, and `MEMORY.md` linking `[STATUS.md](STATUS.md)`. Push it. Then run `apm update`, and copy every skill and agent file this branch changes over the installed copies. | `/kata-setup Update my installation`. Check that Step 1 asks no question. Accept every regeneration, accept the entry, and give `0020/libutil` the part `01`. Expected: the generated files regenerate with diffs shown, the sheet appears, the report names `0030` as present in both, and the wiki remote's tip holds `STATUS.tsv` with `0010\tspec\tapproved`, `0020/01\tplan\tapproved`, and `0030\tdesign\tapproved`, links to `STATUS.tsv` in both pages, and no `STATUS.md`. A second run changes no file in the repository or the wiki remote, and reports that no entry applied. |
| R2 (S7)       | The same shape with a wiki that holds `Home.md` and `MEMORY.md` only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ask the branch's `kata-spec` for a spec of a small change. Expected: the wiki clone and its remote are unchanged, no `specs/` directory exists, and the reply stops and names `/kata-setup Update my installation`. Then run that prompt. Expected: the entry fires on the missing file, the remote's tip holds an empty `STATUS.tsv`, and a second `kata-spec` request claims `0010`.                                                                                                                                       |

Post each transcript, trimmed to the prompts, the decisions, and the final
report, as a comment on the pull request. The R1 comment states that the
branch's skills were copied over the updated install, because `apm update`
cannot fetch an unmerged pack.

Verify: both comments exist, and each expected result holds.

## Step 12: Closing checks and the pull request

Modified: nothing beyond the pull request.

- Run `bun run check`, `bun run test`, `bunx jidoka invariants`, and
  `bunx jidoka instructions`.
- Run the spec's S5 and S22 commands verbatim. Each prints nothing beyond the
  matches it allows.
- The pull request body carries part 04's cutover procedure verbatim, under a
  heading that names the release engineer as its runner, and asks for an
  acknowledgement of the plan's deviations from the design.

Verify: CI is green, and the body holds the cutover procedure.

## Step 13: Point the superseded patch and the issues here

Modified: nothing in the repository.

Post one comment on PR #2180, on
[kata-skills#24](https://github.com/forwardimpact/kata-skills/issues/24), and on
[kata-skills#25](https://github.com/forwardimpact/kata-skills/issues/25). Each
names spec 2390 and part 03's pull request, says the ledger becomes the
rows-only `wiki/STATUS.tsv` with the sub-row grammar `NNNN/NN` in one library
home, and says an installation takes it through `apm update` and
`/kata-setup Update my installation`. The comment on PR #2180 leaves closing it
to its author.

Verify: each of the three threads carries the comment (S23).

— Staff Engineer 🛠️
