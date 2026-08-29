# Plan 2310-a Part 04: Agent Profiles and Graph Skills

Rewrite the six agent profiles and the twelve graph, sync, and utility
skills against the part-03 vocabulary. Runs in parallel with parts 05
and 06 after part 03 lands; shares no files with them.

Declaration grammar, used by every profile and skill in parts 04 and 05:

- Profiles: a `## Tiers` section with three lines — `Read: <scope>`,
  `Write: <tier or none>`, and `Stamp the frontmatter standard per
  CLAUDE.md on every note you write.`
- Skills: two lines directly under the H1 — `Write tier: <value>` and
  `Frontmatter: <type values> | none`.

## Step 1: Agent profiles

- Modified: `products/outpost/templates/.claude/agents/{postman,concierge,librarian,recruiter,head-hunter,chief-of-staff}.md`

| Profile | Read | Write |
| ------- | ---- | ----- |
| postman | every tier present | `0-Draft` |
| concierge | every tier present | `3-Team` |
| librarian | every tier present | `3-Team` |
| recruiter | every tier present | `2-Confidential` |
| head-hunter | every tier present | `2-Confidential` |
| chief-of-staff | every tier present | `none` (output is personal `Briefings/`) |

Add the `## Tiers` section per the grammar, move every body path to the
tier-prefixed form, and state in each profile that aggregate outputs
(reports, indexes, syntheses over narrower-tier sources) go to `0-Draft/`.

Verification: `rg --files-without-match '^## Tiers'
products/outpost/templates/.claude/agents/*.md` returns nothing
(criterion 3); no profile declares `1-Management`.

## Step 2: Skill declarations and path rewrites

- Modified: the twelve skill trees below (SKILL.md plus references)

| Skill | Write tier | Frontmatter |
| ----- | ---------- | ----------- |
| extract-entities | `3-Team` (general entities), `2-Confidential` (Candidates, Prospects, Roles, Erasure) | person, organization, project, topic, priority, condition |
| anarlog-process | `3-Team`; dated entries route per the entry's own tier | person, organization, project, topic |
| anarlog-follow | none | none |
| meeting-prep | none (output is personal `Briefings/`) | none |
| changelog | each shared tier (rank 1 and up) | changelog |
| organize-files | none (delegates graph writes to extract-entities) | none |
| person-identify | none (cache only) | none |
| person-lookup | none (cache only) | none |
| sync-apple-calendar | none (cache only) | none |
| sync-apple-mail | none (cache only) | none |
| sync-teams | none (cache only) | none |
| upstream-instructions | none (root CHANGELOG.md is a personal surface) | none |

In every body: `Knowledge/<Entity>/` becomes the tier-prefixed form per
the table (`3-Team/People/`, `2-Confidential/Candidates/`, …). Any output
this table does not name follows the entity-type mapping in the template
CLAUDE.md tier table.

Verification: `rg --files-without-match '^Write tier:'` and
`'^Frontmatter:'` over the twelve SKILL.md files return nothing
(criteria 4, 18); `rg -e 'Knowledge/' -e 'Drafts/'` over the twelve trees
returns nothing.

## Step 3: extract-entities depth changes

The graph-building skill carries the link format, the frontmatter
emission, and the entity routing everyone else points at.

- Modified: `products/outpost/templates/.claude/skills/extract-entities/references/links.md` — the tier-prefixed vault-absolute wiki-link format (`[[3-Team/People/Sarah Chen]]`), the bare-basename ban in shared tiers, the entity-subdirectory relative exemption, and the one-way overlay link rule with the `canonical` property.
- Modified: `.../references/TEMPLATES.md` and `templates-*.md` — every entity template opens with the YAML frontmatter block (core keys plus the type's conditional keys from `registry.yaml`); a lifted `**Key:**` Info line leaves the body; unmatched bold keys stay prose; the targeted-edit rule gains one clause: an edit that updates the inline Last-seen line also stamps `updated`.
- Modified: `.../references/recruitment.md` — recruitment entities route to `2-Confidential`; a recruitment fact about a `3-Team` person lands in the person's `2-Confidential` overlay, never the canonical note.
- Modified: `.../references/resolution.md`, `content.md`, `sources.md`, `conditions.md` — path updates only.

Verification: the part-07 fixture notes generated from these templates
pass the validator's frontmatter and link checks.

## Step 4: changelog skill restructure

- Modified: `products/outpost/templates/.claude/skills/changelog/SKILL.md`

One `CHANGELOG.md` per shared tier at `<N>-<Label>/CHANGELOG.md`,
discovered inside tier directories only; `0-Draft/` keeps none. An entry
never names a note in a narrower tier: a change to a tier-2 note goes to
`2-Confidential/CHANGELOG.md` only. The skill stamps the core frontmatter
keys with `type: changelog` on a changelog it creates. State the boundary
with `upstream-instructions` unchanged.

Verification: criterion 14 review; `rg 'Knowledge/CHANGELOG'
products/outpost/templates/` returns nothing.
