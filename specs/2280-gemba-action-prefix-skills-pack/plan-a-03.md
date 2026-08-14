# Plan 2280-a Part 03: gemba-skills Pack and Setup Skills

Splits the platform skills out of the fit-skills pack into their own sibling
pack. Updates the two setup skills to install it and to name the renamed
actions. Runs after [part 05 step 1](plan-a-05.md).

This part owns every line of `.github/workflows/publish-skills.yml`.

## Step 1: Split the pack legs in the publish workflow

File modified: `.github/workflows/publish-skills.yml`.

Add `products/gemba/package.json` to the `paths:` trigger (after line 15), so a
Gemba version bump alone republishes and retags the pack:

```yaml
      - "products/gemba/package.json"
```

Line 26 reads `One job body, three packs`. The file already carries five legs
and this step adds a sixth, so make the comment count-free:
`One job body, one leg per pack.`

Repoint the bootstrap pin on line 135 (this part owns the file, so part 02
leaves it alone):

```yaml
      - uses: forwardimpact/gemba-bootstrap@a5d9098c2a1e68277f02fad39583a34ee003d9c9 # v1.0.18
```

Replace the fit leg (lines 37-50). Drop the second prefix and the
repeated-prefix bootstrap note. Add the moved-skills note to `readme-intro`,
following the `jidoka-skills` rename-note precedent on lines 56-62:

```yaml
          - prefix: fit
            repo: fit-skills
            version-file: products/gear/package.json
            sync-agents: "false"
            readme-title: Forward Impact Skills
            readme-intro: >-
              Agent skills for the [Forward Impact](https://forwardimpact.team)
              engineering standard. The `gemba` platform skills moved to
              [`forwardimpact/gemba-skills`](https://github.com/forwardimpact/gemba-skills).
              Install that pack to keep them.
            apm-description: >-
              Agent skills for the Forward Impact engineering standard.
```

Add the new pack leg after the fit leg. The `gemba` prefix selects the exact
`gemba` skill plus every `gemba-*` skill (`libpack/src/skill-pack.js:33-35`),
so all six platform skills stage from one prefix:

```yaml
          - prefix: gemba
            repo: gemba-skills
            version-file: products/gemba/package.json
            sync-agents: "false"
            readme-title: Gemba Skills
            readme-intro: >-
              Skills for [Gemba](https://forwardimpact.team), the agent-runtime
              platform. They teach the `gemba-*` command family and the
              published composite actions that run the same loop in CI.
            apm-description: >-
              Gemba platform skills: stand up and operate an agent team with
              the harness, trace, benchmark, wiki, and xmr commands and their
              CI actions.
```

Leave the jidoka, kata, monorepo, and outpost legs unchanged.

Verify: `rg -n 'prefix: (fit|gemba)$' .github/workflows/publish-skills.yml`
shows one leg each, the `gemba` leg's `version-file` is
`products/gemba/package.json`, and `rg -n 'forwardimpact/bootstrap'
.github/workflows/publish-skills.yml` returns nothing.

## Step 2: Retire the two-prefix example in the pack action

File modified: `.github/actions/publish-skill-pack/action.yml`.

Line 21 documents the `pack-prefix` input with the example
`(e.g. "fit", "kata", "fit gemba")`. The `fit gemba` arrangement is exactly
what design-a.md § Clean break removes, so the example must not survive it.

| Line | Old | New |
| ---- | --- | --- |
| 21 | `(e.g. "fit", "kata", "fit gemba"). Each prefix selects the <prefix> and` | `(e.g. "fit", "kata"). Each prefix selects the <prefix> and` |

Verify: `rg -n 'fit gemba' .github/` returns nothing.

## Step 3: Rename the placeholder tokens and the template refs

Do this step **before** step 4. Step 4 inserts a line into
`kata-setup/SKILL.md` § Prerequisites, which shifts the token lines this step
cites from 123-124 down by one.

Files modified:

- `.claude/skills/kata-setup/SKILL.md`
- `.claude/skills/kata-setup/references/workflow-dispatch.md`
- `.claude/skills/kata-setup/references/workflow-shift.md`

| File:line | Old | New |
| --------- | --- | --- |
| `SKILL.md:123-124` | `{{FIT_BOOTSTRAP_REF}}` / `{{FIT_HARNESS_REF}}` / `{{FIT_WIKI_REF}}` | `{{GEMBA_BOOTSTRAP_REF}}` / `{{GEMBA_HARNESS_REF}}` / `{{GEMBA_WIKI_REF}}` |
| `workflow-dispatch.md:6-7` | same three tokens | same three tokens renamed |
| `workflow-dispatch.md:78` | `# harness runs gemba-harness off PATH and installs nothing; bootstrap` | `# gemba-harness runs the CLI off PATH and installs nothing; gemba-bootstrap` |
| `workflow-dispatch.md:79` | `# installs the CLIs the harness, cost, and wiki-push steps invoke directly.` | `# installs the CLIs the run, cost, and wiki-push steps invoke directly.` |
| `workflow-dispatch.md:80` | `uses: forwardimpact/bootstrap@{{FIT_BOOTSTRAP_REF}}` | `uses: forwardimpact/gemba-bootstrap@{{GEMBA_BOOTSTRAP_REF}}` |
| `workflow-dispatch.md:87` | `uses: forwardimpact/harness@{{FIT_HARNESS_REF}}` | `uses: forwardimpact/gemba-harness@{{GEMBA_HARNESS_REF}}` |
| `workflow-dispatch.md:105` | `uses: forwardimpact/wiki@{{FIT_WIKI_REF}}` | `uses: forwardimpact/gemba-wiki@{{GEMBA_WIKI_REF}}` |
| `workflow-dispatch.md:112` | `` This workflow uses `harness` rather than `kata-agent` `` | `` This workflow uses `gemba-harness` rather than `kata-agent` `` |
| `workflow-dispatch.md:123` | `` the checkout `token:`, the bootstrap `token:`, and the `Assess and `` | `` … the `gemba-bootstrap` `token:` … `` |
| `workflow-shift.md:125-126` | ``List tags with `gh api repos/forwardimpact/kata-agent/tags` (also `bootstrap`, `harness`, and `wiki` for `workflow-dispatch.md`).`` | ``… (also `gemba-bootstrap`, `gemba-harness`, and `gemba-wiki` for `workflow-dispatch.md`).`` |

The `{{KATA_AGENT_REF}}` token stays. The `skill-ref-placeholder` invariant
flags `owner/repo@{{UPPER_SNAKE}}` refs **outside** kata-setup
(`globs: ["**/*.md", "!**/kata-setup/**"]`), so it never sees these files and
needs no rule change.

Leave the bare words that name workflow inputs or concepts rather than actions:
`wiki: "false"`, `Push wiki changes`, `harness-based dispatch`,
`workflow-shift.md:18,63` (`wiki:` input).

Verify with two decidable checks. Ripgrep uses the Rust regex engine, which has
no lookaround, so the second check is a fixed allow-list rather than a clever
pattern:

```sh
rg -n 'FIT_(BOOTSTRAP|HARNESS|WIKI)_REF' .claude/skills/kata-setup/
rg -c '\b(bootstrap|harness|wiki)\b' .claude/skills/kata-setup/ | sort
```

The first returns nothing. For the second, read every remaining hit once and
confirm each is a workflow input name (`wiki:`, `token:`), a step title
(`Push wiki changes`), or a concept (`harness-based dispatch`). No hit may name
a composite action.

## Step 4: Add the pack to the kata-setup prerequisites

File modified: `.claude/skills/kata-setup/SKILL.md`.

The file is at 187 of its 192-line L5 cap
(`libraries/libinvariant/src/instructions.js:218-219`). Add **one** line only.

Add to § Prerequisites (after line 28):

```markdown
- `apm install forwardimpact/gemba-skills`
```

Line 104 reads ``confirm that `apm install forwardimpact/kata-skills` is
installed``. Change it to name both packs without adding a line:
``confirm that the `kata-skills` and `gemba-skills` packs are installed``.

Verify: `bunx jidoka instructions` reports no finding for the file, and
`rg -n 'gemba-skills' .claude/skills/kata-setup/SKILL.md` returns two lines.

## Step 5: Add the pack to the monorepo-setup install line

Files modified:

- `.claude/skills/monorepo-setup/SKILL.md`
- `.claude/skills/monorepo-setup/references/repo-skeleton.md`

| File:line | Old | New |
| --------- | --- | --- |
| `SKILL.md:45` | `` (the `bootstrap` `` | `` (the `gemba-bootstrap` `` |
| `SKILL.md:71` | `` `bootstrap` action runs `scripts/bootstrap.sh` in every Kata workflow `` | `` `gemba-bootstrap` action runs `scripts/bootstrap.sh` in every Kata workflow `` |
| `SKILL.md:86` | `apm install forwardimpact/jidoka-skills forwardimpact/kata-skills --target claude` | `apm install forwardimpact/jidoka-skills forwardimpact/kata-skills forwardimpact/gemba-skills --target claude` |
| `repo-skeleton.md:60` | `` the `bootstrap` composite action in every Kata workflow `` | `` the `gemba-bootstrap` composite action in every Kata workflow `` |

## Step 6: Propagate the install line to the monorepo website

The same two-pack command ships on the public site, so it moves with the skill.

Files modified:

- `websites/monorepo/index.md`
- `websites/monorepo/llms.txt`

| File:line | Change |
| --------- | ------ |
| `index.md:185` | The terminal line's `apm install forwardimpact/jidoka-skills forwardimpact/kata-skills` gains `forwardimpact/gemba-skills`. |
| `llms.txt:26` | The same command in prose gains `forwardimpact/gemba-skills`. |

Verify: `rg -n 'apm install forwardimpact' .claude/skills/monorepo-setup/
websites/monorepo/` lists all three packs on every line.
