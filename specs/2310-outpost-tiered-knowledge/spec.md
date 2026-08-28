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
- **Drafts have no standard home in the graph.** Agents write email and chat
  drafts into a personal `Drafts/` directory outside `Knowledge/`. A draft
  cannot carry graph links under any validation, and a document that matures
  from draft to shared note has no defined path.

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

Partition the knowledge base into **ordered tiers directly at the vault
root**. The `Knowledge/` wrapper directory is removed. Each tier is one
directory at the KB root, and each tier is the unit of sharing. A lower tier
number means a narrower audience. The default install ships five tiers:

| Tier | Default name | Audience | Default contents |
| ---- | ------------ | -------- | ---------------- |
| 0 | Draft | The owner only. Never shared. | Work in progress by agents and humans: email and chat drafts, document and deck drafts, notes not yet placed. |
| 1 | Management | Senior-management internals (succession, reorg planning) | None. The user places tier-1 content; no agent writes here by default. |
| 2 | Confidential | Sensitive team-level records (recruitment, compensation) | Candidates, Prospects, Roles, Erasure |
| 3 | Team | Team-wide working knowledge | People, Organizations, Projects, Topics, Priorities, Conditions, Tasks |
| 4 | Public | Content that can be shared outside the team | None. The user places tier-4 content deliberately. |

The five tiers are a starting draft. A team may rename a tier, add one, or
remove one. Any tier may hold any entity subdirectory (a management-only
priority lives in tier 1's `Priorities/`). The default-contents column gives
the write defaults; the placement rule below governs everything else.

1. **Tiers declare themselves.** Each tier directory carries its rank in its
   own name. The vault's tier set and order are readable from the directory
   names alone, with no manifest and no configuration. A renamed tier, an
   added tier, and a received subset therefore stay decidable. Two tiers that
   carry the same rank are a validation error.
2. **The root splits into tiers and personal surfaces.** The KB root is the
   Obsidian vault. The tier directories are the knowledge graph. Every other
   root entry is personal and never shared: the instruction surfaces
   (CLAUDE.md, `.claude/`, apm.yml, `.mcp.json`, CHANGELOG.md, MIGRATION.md)
   and `Briefings/`. The old personal `Drafts/` directory is removed;
   `0-Draft/` replaces it.
3. **One link rule.** A note links only to notes in its own tier or in a
   wider tier (a higher tier number). A note never links to a narrower tier
   or to a personal surface. This rule gives the vault one property: any
   shared **suffix** of the tier order (tier N through the widest tier) is
   link-closed. Every link a recipient can see resolves inside what they
   received, and no link in a wider tier names a narrower tier's note. One
   placement rule follows: put each note in the widest tier whose whole
   audience may read it.
4. **Drafts are tier 0.** `0-Draft/` is the standard place where agents and
   humans put work in progress. Rank 0 is the narrowest tier, so a draft may
   link to anything in the graph and nothing in the graph may link to a
   draft. No share suffix that leaves the machine starts at 0. A draft
   matures in `0-Draft/` and a human moves it into its tier; validation then
   confirms its links against the new tier.
5. **Cumulative sharing.** Access is granted as a suffix of the tier order. A
   member who receives tier N also receives every wider tier. Shares start at
   tier 1 or wider. The template documents this model; the filesystem or Git
   tooling executes it.
6. **Instructions teach the tiers everywhere.** The root CLAUDE.md shipped
   with Outpost carries the canonical tier description, the root model, the
   link rule, the placement rule, the draft-promotion flow, and the sharing
   model. Every agent profile declares its read scope and its default write
   tier. Every skill that reads or writes the graph declares the tier it
   writes to (read-only skills declare none). Cross-tier conventions that
   exist today become tier-aware: backlinks stay within a tier, and the
   shared changelog becomes one changelog per shared tier so that no entry
   names a narrower tier's notes. The Ethics & Integrity rules stay
   non-negotiable and unchanged in force inside every tier: a tier narrows a
   note's audience, and the note is still written as if its subject will read
   it. Tiers never license dossiers.
7. **A validator in the `fit-outpost` CLI.** The CLI validates a knowledge
   base: tier ranks are unambiguous, no note links to a narrower tier or out
   of the graph, and no legacy layout remains (a `Knowledge/` or `Drafts/`
   directory, or a bare entity directory at the root, fails with a pointer to
   migration guidance). It reports each violation with file, line, and
   target, and exits non-zero on any finding. It passes a conforming full
   vault and a conforming suffix subset, so any recipient of a share can run
   it. Personal surfaces are outside its scope.
8. **Clean break, new major version.** The `Knowledge/` and `Drafts/` layout
   is removed from every instruction, template, and documentation surface. A
   MIGRATION.md ships with the release and gives step-by-step guidelines for
   moving an existing knowledge base into root-level tiers and
   re-establishing conforming links.

**Compatibility stance:** clean break. No template instruction, agent, or
skill supports the `Knowledge/` or `Drafts/` layout after this change, and
the release that ships it is a new major version of the Outpost package.
Old-path removal is a success criterion (#9).

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| Template root CLAUDE.md | Canonical tier description, root model, link rule, placement rule, draft-promotion flow, suffix sharing model (replaces the "KBs are not Git repositories" sharing statement), tier-aware workspace layout, ethics rules restated as tier-independent. |
| Template agent profiles (all 6) | Each declares read scope and default write tier in a `## Tiers` section. |
| Template skills (all that touch the graph, with their references and scripts) | Tier-aware paths and write targets per the default-contents mapping; drafting skills write to `0-Draft/`; per-tier changelog; tier-aware backlink and link-format rules. |
| Template MIGRATION.md (new) | Guidelines to move an existing knowledge base into root-level tiers. |
| `fit-outpost init` | Creates the five default tier directories and `Briefings/` at the KB root. |
| `fit-outpost update` | Installs the new instructions, and installs MIGRATION.md while the knowledge base still carries a legacy layout. |
| `fit-outpost` validation | Gains the knowledge checks: rank uniqueness, link direction, and legacy-layout detection. |
| Published `fit-outpost` skill and Outpost docs pages (product page, getting started, knowledge-systems guides) | Describe the tier model and the validator; `Knowledge/` and `Drafts/` example paths are rewritten. |
| Release | Major version cut of the Outpost npm package. |

### Excluded

| Item | Why |
| ---- | --- |
| Access enforcement | The filesystem, OneDrive, or Git host owns permissions and polices readers. Outpost defines the boundaries. |
| Sync tooling | How a team shares each tier (OneDrive share, Git remote, submodule) stays the team's choice. MIGRATION.md gives guidelines only. |
| Encryption or redaction | Out of scope; tiers are a placement-and-audience model. |
| Per-note tier metadata | The directory is the tier. Front-matter tiering would break the folder-equals-share-unit invariant. |
| Prose-mention detection | The link rule and validator govern links. A prose sentence that names a restricted note is an authoring-judgment matter the instructions govern. |
| Policing personal root content | The root outside the tiers is personal by definition. The validator flags legacy layouts there and nothing else. |
| Automatic content migration | Moving notes and rewriting links needs human judgment about audiences. MIGRATION.md guides it; the validator verifies it. |
| Backward compatibility with the `Knowledge/` layout | Clean break per the compatibility stance. |
| Outpost trust-boundary architecture | Spawn-env allow-set, state-file naming, and settings deny rules are untouched. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | A fresh init creates the five default tier directories and `Briefings/` at the KB root, and nothing else besides the bundled files; entity subdirectories stay on-demand. | Product test after init. |
| 2 | The template root CLAUDE.md describes the tier system, the root model, the link rule, the placement rule, the draft-promotion flow, and the sharing model. | Read `products/outpost/templates/CLAUDE.md`. |
| 3 | Every template agent profile carries a `## Tiers` section with read scope and default write tier (`none` allowed). | `rg --files-without-match '^## Tiers' products/outpost/templates/.claude/agents/*.md` returns nothing. |
| 4 | Every template skill that touches the graph carries a `Write tier:` declaration (`none` for read-only skills). | `rg -l '\b[0-9]+-[A-Z][A-Za-z]*/' products/outpost/templates/.claude/skills/*/SKILL.md \| xargs rg --files-without-match 'Write tier:'` returns nothing. |
| 5 | Validation reports each narrower-tier or out-of-graph link with file, line, and target, and exits non-zero. | Product test with a violating fixture. |
| 6 | Validation passes a conforming full vault and a conforming suffix subset. | Product tests with conforming fixtures. |
| 7 | Validation fails a legacy layout (`Knowledge/`, `Drafts/`, or a bare entity directory at the root) and names MIGRATION.md. | Product test with a legacy-layout fixture. |
| 8 | MIGRATION.md ships in the template and `fit-outpost update` installs it into a knowledge base with a legacy layout. | Product test: after update on a legacy fixture, MIGRATION.md exists at the KB root. |
| 9 | No template instruction references a `Knowledge/` or `Drafts/` path. | `rg '(Knowledge\|Drafts)/'` under `products/outpost/templates/` returns nothing outside MIGRATION.md, which documents the old layout. |
| 10 | The Outpost docs describe the tier model and keep no `Knowledge/` or `Drafts/` example path. | Product page and getting-started guide carry the tier table and validator command; the criterion 9 pattern over the Outpost pages in `websites/fit/` returns nothing. |
| 11 | The changelog convention is one changelog per shared tier. | The changelog skill names the per-tier location; the criterion 9 pattern retires `Knowledge/CHANGELOG.md`. |
| 12 | Repository checks stay green. | `bun run check` and `bun run test` pass. |
| 13 | The release is a major cut. | After the release cut, `npm view @forwardimpact/outpost version` reports the next major, per kata-release-cut. |
