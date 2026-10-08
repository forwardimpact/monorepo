# Plan 2400-a Part 04: Setup provisions, Jidoka writes the check homes, and `monorepo-setup` retires

`kata-setup` gains a provisioning step and three references, runs the scaffold
in its update procedure, and gains one changelog entry. `jidoka-setup` writes
the manifest, the lockfile, and the check workflow when absent. `monorepo-setup`
and its pack go, with every matrix, invariant, and allowlist line that named
them. Branch `feat/2400-setup-provisions`. Route: `staff-engineer`, in a session
with a human operator's own `gh` login. Depends on part 03 and on spec 2390's
second merge. Edit `kata-setup` by step title. Renumber the step
cross-references after the new step lands.

## Step 1: The three provisioning references

Created:

- `.claude/skills/kata-setup/references/labels.md`
- `.claude/skills/kata-setup/references/gitignore.md`
- `.claude/skills/kata-setup/references/settings-hooks.md`

`labels.md`: a header line that states the idempotence rule, then one table.

> Read `gh label list --json name`. Create each absent name with
> `gh label create <name> --description "<purpose>"`. Never edit or delete a
> present label. Add one `agent:<name>` row per agent on the sheet.

| Label             | Purpose                                | Written by                                           | Read by                                     |
| ----------------- | -------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| `product`         | The change serves an external persona  | the spec and triage skills, every phase PR           | the merge gate, the product-mix metric      |
| `internal`        | The change serves contributors         | same                                                 | same                                        |
| `obstacle`        | A storyboard obstacle issue            | triage and the storyboard session                    | `gemba-wiki refresh`                        |
| `experiment`      | A storyboard experiment issue          | same                                                 | same                                        |
| `triaged`         | Triage read the issue                  | triage                                               | triage                                      |
| `wontfix`         | Triage declined the issue              | triage                                               | triage                                      |
| `needs-spec`      | The issue waits for a spec             | triage                                               | the spec skill                              |
| `retention`       | A retention pull request               | the archive skill                                    | the merge gate                              |
| `spec:approved`   | A trusted human approved the spec      | a human                                              | the active agent, which writes the ledger   |
| `design:approved` | A trusted human approved the design    | a human                                              | same                                        |
| `plan:approved`   | A trusted human approved the plan      | a human                                              | same                                        |
| `agent:<name>`    | Routes an issue or thread to one agent | participants on experiment issues, the dispatch flow | `gemba-wiki refresh`, the dispatch workflow |

`gitignore.md`: the block and the rule.

```gitignore
wiki/
```

> Append the line when no line of `.gitignore` equals `wiki/`. Create the file
> when it is absent. Change no other line.

`settings-hooks.md`: the block, the merge rule, the pin, and the stop.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -fsSL https://github.com/forwardimpact/monorepo/releases/download/{{GEAR_RELEASE}}/fit-install.sh | bash"
          },
          {
            "type": "command",
            "command": "test ! -f scripts/bootstrap.sh || bash scripts/bootstrap.sh"
          },
          { "type": "command", "command": "gemba-wiki init" },
          { "type": "command", "command": "gemba-wiki pull" }
        ]
      }
    ],
    "WorktreeCreate": [
      { "hooks": [{ "type": "command", "command": "gemba-wiki init" }] }
    ],
    "Stop": [{ "hooks": [{ "type": "command", "command": "gemba-wiki push" }] }]
  }
}
```

- Merge rule: for each event, add each command the file lacks, in this order,
  after the commands it has. Never remove or reorder a present command. Create
  the file when it is absent. The installer line is matched by its URL up to
  `/download/`, and its tag follows the `{{GEAR_RELEASE}}` row on every run.
- The installer places the toolchain in its bin directory, which the session's
  `PATH` holds, so every later command is bare. `init` and `pull` are
  idempotent, so a `scripts/bootstrap.sh` that also calls them costs one line of
  output.
- The stop: `gemba-wiki init` left no `wiki/.git`. Create the first wiki page in
  the repository's web interface, titled `Home`, then rerun setup. An
  authentication or network failure prints the clone's own message instead.

Verify: `bunx jidoka instructions` passes, and `bunx jidoka invariants` passes
once step 6's allowlist row is in place.

## Step 2: The guard reference and the action refs

Modified:

- `.claude/skills/kata-setup/references/parameters-guard.md`
- `.claude/skills/kata-setup/references/action-refs.md`

`parameters-guard.md` gains `## Repository` before `## Variables`:

| Parameter          | Default                                                           | Home                                 | Why                                              |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| Wiki               | `on`                                                              | `repository · hasWikiEnabled`        | The team's memory is the wiki repository         |
| Discussions        | `on`                                                              | `repository · hasDiscussionsEnabled` | The team protocol routes Unsettled findings here |
| Labels             | `template` (`labels.md`)                                          | `label · *`                          | The gate, triage, and routing read them          |
| Wiki checkout      | `wiki/`                                                           | `.gitignore · wiki/`                 | The wiki is a separate checkout                  |
| Session hooks      | `template` (`settings-hooks.md`)                                  | `.claude/settings.json · hooks`      | Two phase skills and the gate rely on the push   |
| `{{GEAR_RELEASE}}` | `derived:` `action-refs.md`                                       | `.claude/settings.json · hooks`      | Pins the toolchain the hooks and CI share        |
| Profiles           | `derived:` one `<agent>.md` or `<agent>.agent.md` per sheet agent | `.claude/agents/`                    | The roster of every wiki command                 |

The Wiki and Discussions Values read from
`gh repo view --json hasWikiEnabled,hasDiscussionsEnabled`. The Labels Value is
`complete` or the absent names. A refused feature or label reads `refused` and
the report names it.

`action-refs.md` gains a section of its own, `## The toolchain release`, after §
Steps. The placeholder table stays as it is, because its steps resolve `vX.Y.Z`
tags of action repositories and this placeholder is a release tag of another
shape:

> `{{GEAR_RELEASE}}` is the newest `gear@vX.Y.Z` release of
> `forwardimpact/monorepo`. Resolve it with
> `gh release list -R forwardimpact/monorepo --limit 200 --exclude-drafts --exclude-pre-releases --json tagName -q '[.[].tagName|select(startswith("gear@v"))][0]'`.
> If the result is empty, stop and ask the operator.

Verify: `bunx jidoka instructions` passes.

## Step 3: `SKILL.md` gains the provisioning step and gives up its room

Modified: `.claude/skills/kata-setup/SKILL.md`

The word ledger. The body sits at 1279 of 1280 words today, and 2390 leaves it
at or under the cap. The counts are whitespace tokens, as `jidoka instructions`
counts them, and a bullet's `-` is a token. Removed: 84. Added: 81. The design's
verify bullet is left out, because the sheet's Repository table and the
checklist item verify the same objects. Fit is `bunx jidoka instructions`.

| Removed                                                                                                                                                                                                                               | Added                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generation step: `Discussion replies need the ghbridge service in references/github-app.md.` (8)                                                                                                                                      | Prerequisites: `- CLAUDE.md, CONTRIBUTING.md, and JTBD.md, from jidoka-setup` (7)                                                                                                                                                                                                                                                     |
| Verify step: `, and the named profiles in the repository or the pinned packs` (11)                                                                                                                                                    | Heading `### Step 2: Provision the Repository` (6)                                                                                                                                                                                                                                                                                    |
| Apply step: `A template row is the template's own shape. Answer a change to it with its Home, which the operator edits by hand.` (22)                                                                                                 | Step body: `Turn on the wiki and Discussions, create each absent label in references/labels.md, and merge references/gitignore.md and references/settings-hooks.md. Confirm one profile under .claude/agents/ per sheet agent; with a remote, run gemba-wiki init, and no clone stops the run per references/settings-hooks.md.` (39) |
| Report step: the watchdog-gaps bullet (31)                                                                                                                                                                                            | Report step: `Add each missing credential that Step 1 listed` (8) becomes `Add each missing credential and wiki item the report lists; set KATA_KILLSWITCH truthy until then` (15) (+7)                                                                                                                                               |
| Report step: the kata.team site bullet (11)                                                                                                                                                                                           | Update step, before its rerun sentence: `Unless the ledger entry was declined, run gemba-wiki scaffold, refresh, and push first.` (13)                                                                                                                                                                                                |
| Control-plane step: `When the repository has no remote yet, list each missing credential in the report and continue.` (16) becomes `With no remote, list each missing credential and wiki item in the report and continue.` (15) (−1) | Generation step: `Change no other existing file or repository object before Step 6.` (+3). Sheet step: `plus one for variables and the repository,` (+3). Checklist: `equals the file, key, or repository object its Home names` (+2)                                                                                                 |

The step sits after the control-plane step. The report bullet's killswitch
clause is spec item 10's sentence. The READ-DO item
`Use npm/npx in all generated content. Never use bun/bunx/just.` reads
`Use npm/npx in generated workflows. Never use bun/bunx/just.` (−1), because the
hooks reference writes bare commands after the installer. The update sentence
leaves the absent-clone case to the bin's guard, which exits 0 with a warning
when no `wiki/` exists.

Verify: `bunx jidoka instructions` passes, and
`rg -n -e 'ghbridge' -e 'Watchdog --event' -e 'PDSA rhythm' .claude/skills/kata-setup/SKILL.md`
prints nothing.

## Step 4: The changelog entry

Modified: `.claude/skills/kata-setup/references/changelog.md`

Newest first, so the row goes at the top of the table. The `--paths` pathspec is
wiki-relative, as the publish command reads it:

| Change         | Detect                                                                                                         | Do                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board sections | The current `wiki/storyboard-<YYYY>-M<NN>.md` lacks a `### <agent>` line for a profile under `.claude/agents/` | Append `### <agent>` under `## Current Condition`, after the last agent section, for each missing profile, then `gemba-wiki push --paths storyboard-<YYYY>-M<NN>.md` |

Verify: the entry is under eighty words, and `bunx jidoka` passes.

## Step 5: `jidoka-setup` writes the check homes

Modified: `.claude/skills/jidoka-setup/SKILL.md` Created:
`.claude/skills/jidoka-setup/references/check-ci.md`

Step 4 of the skill gains two paragraphs after the entry-point text:

> When the repository has no manifest for its package manager, write one from
> [`references/check-ci.md`](references/check-ci.md), run the package manager's
> install so the lockfile exists, and commit both. The manifest holds the
> `check` task and the CLI dependency, and nothing else. Today that manifest is
> npm's.
>
> When no workflow runs the check task, write the one in the same reference. It
> runs on push and pull request with SHA-pinned actions, and it brings the
> `github-actions` Dependabot entry. The Kata setup skill merges the same entry
> under the same rule, so a repository with both packs holds one entry.

`check-ci.md` holds three blocks, each with its rule:

```json
{
  "name": "<repo>",
  "private": true,
  "scripts": { "check": "jidoka" },
  "devDependencies": { "@forwardimpact/jidoka": "^<version>" }
}
```

> Resolve `<version>` with `npm view @forwardimpact/jidoka version`. Write the
> file only when none exists. Then run `npm install` and commit
> `package-lock.json` beside it, because the workflow's `npm ci` needs it.

```yaml
name: Check
on:
  push:
    branches: [<default-branch>]
  pull_request:
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # <tag>
      - uses: actions/setup-node@<sha> # <tag>
        with:
          node-version: "22"
      - run: npm ci
      - run: npm run check
```

> Resolve each `<sha>` with `gh api repos/<action>/git/ref/tags/<tag>`. Write
> `.github/workflows/check.yml` only when no workflow under `.github/workflows/`
> runs the check task.

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

> When `.github/dependabot.yml` is absent, write this file. When it exists and
> has no `github-actions` entry for directory `/`, add the entry under its
> `updates:` list and keep every other entry.

The jidoka pack cannot cite the kata pack's `dependabot.md`, so the entry and
its rule have one home per pack. The entry and the rule are the same, with the
interval fixed at `weekly` here and a placeholder there.

Verify: `bunx jidoka instructions` passes, and rehearsal R5 below.

## Step 6: Retire `monorepo-setup` and its pack

Deleted: `.claude/skills/monorepo-setup/` (the skill and its three references)

Modified:

- `.github/workflows/publish-skills.yml`
- `.jidoka/invariants/skill-template.rules.mjs`
- `.jidoka/invariants/instruction-scripts.allow.yml`
- `tests/instruction-scripts-invariant.test.js`

| File                                    | Change                                                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publish-skills.yml`                    | Delete the `.claude/skills/monorepo-*/**` path trigger and the `prefix: monorepo` matrix entry.                                                                                                                                             |
| `skill-template.rules.mjs`              | `PACK_SKILL` reads `(kata\|jidoka)`. Both glob lists drop `.claude/skills/monorepo-*/**`. The header comment names two packs and the bare-CLI rule for `jidoka-*` only.                                                                     |
| `instruction-scripts.allow.yml`         | The key becomes `.claude/skills/kata-setup/references/settings-hooks.md` with the same `scripts/bootstrap.sh` entry. The comment reads: the reference writes this SessionStart hook into the installation's settings; nothing runs it here. |
| `instruction-scripts-invariant.test.js` | The `prose names a root script` case uses `.claude/skills/setup/SKILL.md`.                                                                                                                                                                  |

Verify: `test ! -e .claude/skills/monorepo-setup` and the S14 `rg` line from the
spec print nothing, and `bun run test` passes.

## Step 7: The getting-started page names setup

Modified: `websites/kata/docs/getting-started/index.md`

§ Initialize shared memory loses the `npx gemba-wiki init` block and its
expectation paragraph. It reads: enable Wikis in the repository settings and
create the first page, titled `Home`; the `kata-setup` skill then turns the
feature on when it is off, clones the wiki, and creates the ledgers and one
summary per agent; the skill stops once when the page is missing and says so.
Keep the link to the Gemba wiki guide and the sentence on what a skipped wiki
costs. 2390's update commands stay where they are.

Verify: `rg -l 'npx gemba-wiki init' websites/kata` prints nothing (S17).

## Step 8: Rehearse

Five rehearsals in the harness plan-a.md names. A fresh sub-agent follows the
skill. The implementer answers as the operator and records each transcript on
the pull request.

| Run | Setup                                                                                                                                         | Expected                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A local repository with no remote                                                                                                             | Generation completes. The report lists each missing credential and each wiki item as pending, and names the killswitch. No stop.                                                                                                                                                                                                                                                                                                               |
| R2  | A remote with the wiki and Discussions off, no vocabulary label, no first page; a read-only token for the first attempt, then the human login | With the read-only token the report names each refused feature and label and continues. With the login both features turn on, every label exists, `.gitignore` and the hooks are merged, each sheet agent has a profile, and the run stops with the first-page instruction. In a fresh shell whose `PATH` holds the installer's bin directory and no other gear binary, `command -v gemba-wiki` resolves, which proves the bare hook commands. |
| R3  | R2's repository after the operator creates the `Home` page                                                                                    | The run completes. `gh repo view --json hasWikiEnabled,hasDiscussionsEnabled` reads both true, `gh label list` holds the vocabulary, and the wiki remote holds the three ledgers, the month's board with one section per profile, and one summary per profile (S9).                                                                                                                                                                            |
| R4  | R3's repository, rerun                                                                                                                        | The same sheet. No file or repository object changes (S10).                                                                                                                                                                                                                                                                                                                                                                                    |
| R5  | An empty repository, `jidoka-setup`                                                                                                           | The manifest, the lockfile, `check.yml`, and `dependabot.yml` exist. `git clone` into a fresh directory, then `npm ci && npm run check`, exits 0. The workflow's two actions are SHA-pinned (S13).                                                                                                                                                                                                                                             |

Verify: the five transcripts are on the pull request, and `bun run check`,
`bun run test`, and `bunx jidoka` pass on the branch. The pull request body says
`Closes #2202`.

— Staff Engineer 🛠️
