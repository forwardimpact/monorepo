# Plan 2310-a Part 03: Canonical Instruction Surfaces

Rewrite the template root CLAUDE.md, add the registry template, and ship
MIGRATION.md. Parts 4, 5, and 6 point at this text. Independent of parts
01/02.

## Step 1: Rewrite the template root CLAUDE.md

One canonical home for the tier system and the metadata standard, per the
design's Root CLAUDE.md component.

- Modified: `products/outpost/templates/CLAUDE.md`

Keep the file's role and voice. Section changes:

| Section | Change |
| ------- | ------ |
| Ethics & Integrity | Keep every rule. Add one line: a tier narrows a note's audience; write every note as if its subject will read it. Tiers never license dossiers. |
| Operating Context | Read `Priorities/` and `Conditions/` from every tier present, not from `Knowledge/`. |
| Workspace Layout & Sharing | Replace wholesale. The root model (tiers are the graph; every root entry off the rank grammar is personal; personal folders must not match the grammar), the five-tier table with audiences and default contents, the layout tree with `0-Draft/` … `4-Public/`, `Briefings/`, `registry.yaml`, and `validation-baseline.json`, and the suffix sharing model over mounts (symlinked tiers, rank from the link's own name, tier 0 in no share, the physical root outside any cloud-synced folder). This removes the "KBs are not Git repositories" statement. |
| New: Placement and Links | The one link rule (`rank(target) >= rank(source)`), the tier-prefixed vault-absolute link format with the entity-subdirectory exemption, the placement rule in exclusion form, promote and export, the three overlay forms with link inversion, entry routing, the aggregate default (`0-Draft/`), the no-redistribute marker, and the erasure authoring rule. |
| New: Note Metadata | The three-key core, the conditional keys with triggers, the serialization contract (flat block at line 1, snake_case, ISO dates, quoted tier-prefixed property links, canonical key order), the closed `topic/` taxonomy with per-tag tier bounds, ownership (agents stamp; humans edit `registry.yaml`), the coherence recipes (Bases on `type`/`status`, aliases in the switcher, path-keyed graph groups), and the vault settings (absolute link format, same-folder defaults). Frontmatter never carries a tier, rank, or audience key. |
| Agents table, Cache, Identity | Keep; the cache section gains a `drafts/` entry for the two ledgers (part 05 moves them; `state/` stays daemon-owned). |

Verification: criterion 2's read check; `rg -e 'Knowledge/' -e 'Drafts/'
products/outpost/templates/CLAUDE.md` returns nothing.

## Step 2: Write the registry template

The machine-readable vocabulary home that init installs.

- Created: `products/outpost/templates/registry.yaml`

```yaml
types:            # directory name -> type value
  People: person
  Organizations: organization
  Projects: project
  Topics: topic
  Teams: team
  Candidates: candidate
  Prospects: prospect
  Roles: role
  Priorities: priority
  Conditions: condition
  Tasks: task
  Erasure: erasure
reserved:         # file basenames with a fixed type, in any tier
  CHANGELOG.md: changelog
status:           # per-type closed vocabularies
  candidate: [new, screening, interviewing, offer, hired, rejected, withdrawn]
  prospect: [identified, contacted, responded, converted, closed]
tags:             # closed topic/ taxonomy; widest tier each tag may reach
  - { tag: topic/hiring, bound: 2, intent: recruitment pipeline retrieval }
  - { tag: topic/planning, bound: 3, intent: project and priority retrieval }
rights:
  - no-redistribute
```

Ship the starter set above with one comment line per block stating that
humans edit this file and agents only select from it.

Verification: part 02's init test installs this file (criterion 17). The
part-01 vocabulary tests build their own fixture registries, so part 01
stays independent of this part.

## Step 3: Ship MIGRATION.md

- Created: `products/outpost/templates/MIGRATION.md`
- Modified: `specs/2310-outpost-tiered-knowledge/MIGRATION.md` (status
  header only)

Copy the spec-stage draft, drop its **Status** header block, and fix the
names this plan fixes: the registry is `registry.yaml`, the baseline is
`validation-baseline.json`, the ledgers move to
`~/.cache/fit/outpost/drafts/handled` and `…/drafts/ignored`, and
every validator invocation is `npx fit-outpost validate <path> [--json]`.
Keep the eight phases, four gates, split rules, and the workflow prompt
as drafted. Update the spec-dir draft's status line to point at the
shipped template.

Verification: criterion 10 content review against spec point 10; the
part-07 fixture test exercises the phase sequence mechanically.
