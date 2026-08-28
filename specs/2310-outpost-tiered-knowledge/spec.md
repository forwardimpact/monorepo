# Spec 2310: Outpost Tiered Knowledge

**Classification:** product. Every changed surface is part of the Outpost
product: the knowledge-base template, the `fit-outpost` CLI, and the product
documentation. The shared rubric's decision test classifies a change under
`products/` as product-aligned.

**Persona and job:** Empowered Engineers → Be Prepared and Productive
(Outpost's Big Hire in JTBD.md). The engineer, and the manager the engineer
reports to, keep one knowledge graph. Today the graph forces one audience.
This spec lets one vault serve several audiences without leaking. The
narrower tiers (management internals, recruitment records) also serve the
Engineering Leaders persona as a secondary beneficiary of the same job.

## Problem

Outpost initializes a knowledge base with a single shared directory. The
template CLAUDE.md § Workspace Layout states the model: the root is personal,
and "a synced filesystem shares only `Knowledge/` with the team." The unit of
sharing is one directory with one audience.

Real teams hold knowledge with several audiences:

- **Recruitment and compensation records** live in the same `Knowledge/` as
  team-wide project notes. The `req-*` skills write candidate assessments,
  salary discussions, and hiring decisions into `Knowledge/Candidates/`,
  `Knowledge/Prospects/`, `Knowledge/Roles/`, and `Knowledge/People/`. Every
  team member who receives the share reads them.
- **Senior-management internals** (succession, reorg planning) cannot enter
  the graph at all. A manager either leaks them to the whole team or keeps
  them outside the vault. An outside note loses links, briefings, entity
  extraction, and every other agent capability.
- **Outward-shareable content** (public write-ups, partner-facing notes) has
  no home that a member can hand to someone outside the team.

Individuals initiate the Outpost root as an Obsidian vault and share
`Knowledge/` over a folder-syncing system such as Microsoft OneDrive or Git.
The current template CLAUDE.md describes plain-file sync only ("KBs are not
Git repositories"); real installations use both, and this spec names Git as a
supported sharing mechanism from here on. Every such system shares
**folders**. A sharing boundary that is not a folder boundary cannot be
enforced there.

Links make a naive split unsafe. Obsidian notes reference each other with
wiki links. A link carries its target's title. When a widely shared note
links to a restricted note, the restricted title leaks to the wide audience,
and the link dangles for every reader without the restricted folder. Nothing
in the product detects this today.

## Proposal

Partition `Knowledge/` into **ordered tiers**. Each tier is one directory
directly under `Knowledge/`, and each tier is the unit of sharing. A lower
tier number means a narrower audience. The default install ships four tiers:

| Tier | Default name | Audience | Default contents |
| ---- | ------------ | -------- | ---------------- |
| 1 | Management | Senior-management internals (succession, reorg planning) | None. The user places tier-1 content; no agent writes here by default. |
| 2 | Confidential | Sensitive team-level records (recruitment, compensation) | Candidates, Prospects, Roles, Erasure |
| 3 | Team | Team-wide working knowledge | People, Organizations, Projects, Topics, Priorities, Conditions, Tasks |
| 4 | Public | Content that can be shared outside the team | None. The user places tier-4 content deliberately. |

The four tiers are a starting draft. A team may rename a tier, add one, or
remove one. Any tier may hold any entity subdirectory (a management-only
priority lives in tier 1's `Priorities/`). The default-contents column gives
the write defaults; the placement rule below governs everything else.

1. **Tiers declare themselves.** Each tier directory carries its rank in its
   own name. The vault's tier set and order are readable from the directory
   names alone, with no manifest and no configuration. A renamed tier, an
   added tier, and a received subset therefore stay decidable. Two tiers that
   carry the same rank are a validation error.
2. **One link rule.** A note links only to notes in its own tier or in a
   wider tier (a higher tier number). A note never links to a narrower tier.
   This rule gives the vault one property: any shared **suffix** of the tier
   order (tier N through the widest tier) is link-closed. Every link a
   recipient can see resolves inside what they received, and no link in a
   wider tier names a narrower tier's note. One placement rule follows: put
   each note in the widest tier whose whole audience may read it.
3. **Cumulative sharing.** Access is granted as a suffix of the tier order. A
   member who receives tier N also receives every wider tier. The template
   documents this model; the filesystem or Git tooling executes it.
4. **Instructions teach the tiers everywhere.** The root CLAUDE.md shipped
   with Outpost carries the canonical tier description, the link rule, the
   placement rule, and the sharing model. Every agent profile declares its
   read scope and its default write tier. Every skill that reads or writes
   `Knowledge/` declares the tier it writes to (read-only skills declare
   none). Cross-tier conventions that exist today become tier-aware:
   backlinks stay within a tier, and the shared changelog becomes one
   changelog per tier so that no entry names a narrower tier's notes. The
   Ethics & Integrity rules stay non-negotiable and unchanged in force inside
   every tier: a tier narrows a note's audience, and the note is still
   written as if its subject will read it. Tiers never license dossiers.
5. **A validator in the `fit-outpost` CLI.** The CLI validates a knowledge
   base: every top-level entry under `Knowledge/` belongs to a tier, tier
   ranks are unambiguous, and no note links to a narrower tier. It reports
   each violation with file, line, and target, and exits non-zero on any
   finding. It passes a conforming full vault and a conforming suffix subset,
   so any recipient of a share can run it.
6. **Clean break, new major version.** The un-tiered layout is removed from
   every instruction, template, and documentation surface. An un-tiered
   knowledge base fails validation with a pointer to migration guidance. A
   MIGRATION.md ships with the release and gives step-by-step guidelines for
   moving an existing `Knowledge/` into tiers and re-establishing conforming
   links.

**Compatibility stance:** clean break. No template instruction, agent, or
skill supports the un-tiered layout after this change, and the release that
ships it is a new major version of the Outpost package. Old-path removal is a
success criterion (#9).

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| Template root CLAUDE.md | Canonical tier description, link rule, placement rule, suffix sharing model (replaces the "KBs are not Git repositories" sharing statement), tier-aware workspace layout, ethics rules restated as tier-independent. |
| Template agent profiles (all 6) | Each declares read scope and default write tier in a `## Tiers` section. |
| Template skills (all that touch `Knowledge/`, with their references and scripts) | Tier-aware paths and write targets per the default-contents mapping; per-tier changelog; tier-aware backlink and link-format rules. |
| Template MIGRATION.md (new) | Guidelines to move an existing knowledge base into tiers. |
| `fit-outpost init` | Creates the four default tier directories. |
| `fit-outpost update` | Installs the new instructions, and installs MIGRATION.md while the knowledge base still carries un-tiered content. |
| `fit-outpost` validation | Gains the knowledge checks: tier membership, rank uniqueness, and link direction. |
| Published `fit-outpost` skill and Outpost docs pages (product page, getting started, knowledge-systems guides) | Describe the tier model and the validator; un-tiered example paths are rewritten. |
| Release | Major version cut of the Outpost npm package. |

### Excluded

| Item | Why |
| ---- | --- |
| Access enforcement | The filesystem, OneDrive, or Git host owns permissions and polices readers. Outpost defines the boundaries. |
| Sync tooling | How a team shares each tier (OneDrive share, Git remote, submodule) stays the team's choice. MIGRATION.md gives guidelines only. |
| Encryption or redaction | Out of scope; tiers are a placement-and-audience model. |
| Per-note tier metadata | The directory is the tier. Front-matter tiering would break the folder-equals-share-unit invariant. |
| Prose-mention detection | The link rule and validator govern links. A prose sentence that names a restricted note is an authoring-judgment matter the instructions govern. |
| Automatic content migration | Moving notes and rewriting links needs human judgment about audiences. MIGRATION.md guides it; the validator verifies it. |
| Backward compatibility with the un-tiered layout | Clean break per the compatibility stance. |
| Outpost trust-boundary architecture | Spawn-env allow-set, state-file naming, and settings deny rules are untouched. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | A fresh init creates the four default tier directories and nothing else under `Knowledge/`; entity subdirectories stay on-demand. | Product test after init. |
| 2 | The template root CLAUDE.md describes the tier system, the link rule, the placement rule, and the sharing model. | Read `products/outpost/templates/CLAUDE.md`. |
| 3 | Every template agent profile carries a `## Tiers` section with read scope and default write tier (`none` allowed). | `rg --files-without-match '^## Tiers' products/outpost/templates/.claude/agents/*.md` returns nothing. |
| 4 | Every template skill that touches `Knowledge/` carries a `Write tier:` declaration (`none` for read-only skills). | `rg -l 'Knowledge/' products/outpost/templates/.claude/skills/*/SKILL.md \| xargs rg --files-without-match 'Write tier:'` returns nothing. |
| 5 | Validation reports each narrower-tier link with file, line, and target, and exits non-zero. | Product test with a violating fixture. |
| 6 | Validation passes a conforming full vault and a conforming suffix subset. | Product tests with conforming fixtures. |
| 7 | Validation fails an un-tiered knowledge base and names MIGRATION.md. | Product test with a legacy-layout fixture. |
| 8 | MIGRATION.md ships in the template and `fit-outpost update` installs it into a knowledge base with un-tiered content. | Product test: after update on a legacy fixture, MIGRATION.md exists at the KB root. |
| 9 | No template instruction references an un-tiered `Knowledge/` path. | `rg 'Knowledge/(People\|Organizations\|Projects\|Topics\|Candidates\|Priorities\|Conditions\|Roles\|Prospects\|Erasure\|Tasks\|Goals\|CHANGELOG)'` under `products/outpost/templates/` returns nothing. |
| 10 | The Outpost docs describe the tier model and keep no un-tiered example path. | Product page and getting-started guide carry the tier table and validator command; the criterion 9 pattern over `websites/fit/` returns nothing for Outpost pages. |
| 11 | The changelog convention is one changelog per tier. | The changelog skill names the per-tier location; the criterion 9 pattern covers `Knowledge/CHANGELOG`. |
| 12 | Repository checks stay green. | `bun run check` and `bun run test` pass. |
| 13 | The release is a major cut. | After the release cut, `npm view @forwardimpact/outpost version` reports the next major, per kata-release-cut. |
