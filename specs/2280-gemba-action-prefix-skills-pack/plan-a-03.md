# Plan 2280-a Part 03: gemba-skills Pack and Setup Skills

Splits the platform skills out of the fit-skills pack into their own sibling
pack. Updates the two setup skills to install it and to name the renamed
actions. Depends on nothing in parts 01, 02, or 04.

## Step 1: Split the pack legs in the publish workflow

File modified: `.github/workflows/publish-skills.yml`.

Add `products/gemba/package.json` to the `paths:` trigger (after line 15), so a
Gemba version bump alone republishes and retags the pack:

```yaml
      - "products/gemba/package.json"
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
shows one leg each, and the `gemba` leg's `version-file` is
`products/gemba/package.json`.

## Step 2: Add the pack to the kata-setup prerequisites

File modified: `.claude/skills/kata-setup/SKILL.md`.

Add the install line to § Prerequisites (after line 28):

```markdown
- `apm install forwardimpact/gemba-skills`
```

Verify: `rg -n 'apm install forwardimpact/gemba-skills'
.claude/skills/kata-setup/SKILL.md` returns one line.

## Step 3: Rename the placeholder tokens and the template refs

Files modified:

- `.claude/skills/kata-setup/SKILL.md`
- `.claude/skills/kata-setup/references/workflow-dispatch.md`
- `.claude/skills/kata-setup/references/workflow-shift.md`

| File:line | Old | New |
| --------- | --- | --- |
| `SKILL.md:123-124` | `{{FIT_BOOTSTRAP_REF}}` / `{{FIT_HARNESS_REF}}` / `{{FIT_WIKI_REF}}` | `{{GEMBA_BOOTSTRAP_REF}}` / `{{GEMBA_HARNESS_REF}}` / `{{GEMBA_WIKI_REF}}` |
| `workflow-dispatch.md:6-7` | same three tokens | same three tokens renamed |
| `workflow-dispatch.md:80` | `uses: forwardimpact/bootstrap@{{FIT_BOOTSTRAP_REF}}` | `uses: forwardimpact/gemba-bootstrap@{{GEMBA_BOOTSTRAP_REF}}` |
| `workflow-dispatch.md:87` | `uses: forwardimpact/harness@{{FIT_HARNESS_REF}}` | `uses: forwardimpact/gemba-harness@{{GEMBA_HARNESS_REF}}` |
| `workflow-dispatch.md:105` | `uses: forwardimpact/wiki@{{FIT_WIKI_REF}}` | `uses: forwardimpact/gemba-wiki@{{GEMBA_WIKI_REF}}` |
| `workflow-shift.md:125-126` | ``List tags with `gh api repos/forwardimpact/kata-agent/tags` (also `bootstrap`, `harness`, and `wiki` for `workflow-dispatch.md`).`` | ``… (also `gemba-bootstrap`, `gemba-harness`, and `gemba-wiki` for `workflow-dispatch.md`).`` |

The `{{KATA_AGENT_REF}}` token stays. The `skill-ref-placeholder` invariant
matches any `{{UPPER_SNAKE}}` token under `.claude/skills/kata-setup/`, so the
renamed tokens need no rule change.

Verify: `rg -n --hidden 'FIT_(BOOTSTRAP|HARNESS|WIKI)_REF'
.claude/skills/kata-setup/` returns nothing, and `rg -n '\b(bootstrap|harness|wiki)\b'
.claude/skills/kata-setup/` returns no bare sibling name.

## Step 4: Add the pack to the monorepo-setup install line

File modified: `.claude/skills/monorepo-setup/SKILL.md`.

Line 86 becomes:

```sh
apm install forwardimpact/jidoka-skills forwardimpact/kata-skills forwardimpact/gemba-skills --target claude
```

Verify: `rg -n 'apm install forwardimpact' .claude/skills/monorepo-setup/SKILL.md`
lists all three packs on one line.
