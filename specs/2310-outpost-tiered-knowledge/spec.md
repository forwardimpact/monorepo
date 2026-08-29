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
  `Knowledge/Prospects/`, and `Knowledge/Roles/`, and they add backlinks to
  those records into `Knowledge/People/` notes. Every team member who
  receives the share reads all of it.
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

Individuals initialize the Outpost root as an Obsidian vault and share
`Knowledge/` over a folder-syncing system such as Microsoft OneDrive or Git.
The current template CLAUDE.md describes plain-file sync only ("KBs are not
Git repositories"), and real installations use both. Every such system shares
**folders**. A sharing boundary that is not a folder boundary cannot be
enforced there.

Links make a naive split unsafe. Obsidian notes reference each other with
wiki links. A link carries its target's title. When a widely shared note
links to a restricted note, the restricted title leaks to the wide audience,
and the link dangles for every reader without the restricted folder. Nothing
in the product detects this today.

### Evidence from a field study

A refinement pass studied one mature production installation in depth. The
findings below are generalized. They name no content, no person, and no
organization.

- **The model's core bet holds.** About 98 percent of resolved links already
  flow same-tier or narrower-to-wider under the proposed default mapping.
  The violations concentrate in a small set of files: recruitment backlinks
  woven into team-audience person and team notes.
- **Scale rules out manual link work.** A mature vault holds several
  thousand notes, several hundred binary assets, and more than ten thousand
  wiki links. Nearly all links are written relative to the inside of the
  legacy wrapper, so the new link format rewrites nearly all of them. A few
  percent of links dangle, some by design: scheduled skills mint links to
  notes that do not exist yet.
- **Sensitivity interleaves inside single notes.** Team-safe context and
  management-only or recruitment-only facts alternate entry by entry inside
  one dated activity log. Roughly one note in twenty needs a split, not a
  move. A folder move alone cannot separate them.
- **Real vaults grow beyond the template.** The studied installation holds
  more than twice as many top-level entity directories as the template
  ships: team rosters, research libraries, policy copies, personas,
  communications, and asset stores. A default mapping that names only the
  template set covers a fraction of a real vault.
- **Sharing topology is mounts, not folders.** The shared subtree is a
  symlink into a folder-syncing mount, and the physical vault root lives
  outside the synced area. A plain local directory with a tier name shares
  nothing.
- **Generators regrow the layout.** Most notes are machine-generated on a
  schedule. A layout change that does not retarget every generator and
  instruction surface regrows the old layout within one wake cycle.
- **The most sensitive content is not a draft.** It is permanent owner-only
  material (performance registers, reporting-line negotiations, briefing
  syntheses) whose subjects are the very managers a management tier would
  share with.
- **Audience is not the only axis.** Some team-readable content must never
  be redistributed: third-party document copies and licensed assets.
- **Some audiences are not tiers.** A deliverable for one named recipient
  and a brief for a panel of peers have audiences that no cumulative tier
  chain expresses. They need an export action, not a placement.

## Proposal

Partition the knowledge base into **ordered tiers directly at the vault
root**. This spec removes the `Knowledge/` wrapper directory. Each tier is
one directory at the KB root, and each tier is the unit of sharing. A lower
tier number means a narrower audience. The default install ships five tiers:

| Tier | Default name | Share audience | Default contents |
| ---- | ------------ | -------------- | ---------------- |
| 0 | Draft | The owner only. Never shared. | Work in progress by agents and humans, and every note that stays owner-only permanently: drafts, agent reports and syntheses, briefing-grade material, and any note whose subject sits in every shared tier's audience. |
| 1 | Management | The owner and fellow senior managers. | None. The user places tier-1 content (succession, reorg planning, individual compensation); no agent writes here by default. A note whose subject is a fellow senior manager belongs in tier 0, not tier 1. |
| 2 | Confidential | Managers with people or hiring duties. | Candidates, Prospects, Erasure, and role pipelines: recruitment records and published compensation bands. Individual compensation negotiations and misconduct records belong in tier 1 or tier 0. |
| 3 | Team | The whole team. | People, Teams, Organizations, Projects, Topics, Priorities, Conditions, Tasks, and role definitions. |
| 4 | Public | Anyone, including people outside the team. | None. The user places tier-4 content deliberately. Placement requires redistribution rights, and a verification pass for model-generated content, in addition to the audience test. |

The five tiers are a starting draft. A team may rename a tier, add one, or
remove one. Any tier may hold any entity subdirectory (a management-only
priority lives in tier 1's `Priorities/`). The default-contents column gives
the write defaults; the placement rule below governs everything else.

1. **Tiers declare themselves.** Each tier directory carries its rank in its
   own name. The rank is one leading digit followed by a dash (`0-` through
   `9-`). The vault's tier set and order are readable from the directory
   names alone, with no manifest and no configuration. A renamed tier, an
   added tier, and a received subset therefore stay decidable. Two tiers that
   carry the same rank are a validation error. The one-digit grammar keeps
   date-prefixed personal folders (for example `2026-Archive/`) out of the
   tier set.
2. **The root splits into tiers and personal surfaces.** The KB root is the
   Obsidian vault. The tier directories are the knowledge graph. Every root
   entry that does not match the rank grammar is personal and never shared.
   This is a rule, not an enumeration: personal surfaces include the
   instruction files (CLAUDE.md, `.claude/`, apm.yml, `.mcp.json`, the
   instruction CHANGELOG.md), `Briefings/`, and arbitrary user trees such as
   editor configuration, dependency directories, and nested repositories.
   Tooling never sweeps a personal surface into a tier, and validation skips
   them. This spec removes the old personal `Drafts/` directory; `0-Draft/`
   replaces it. The draft-status ID ledgers that live there today
   (`Drafts/handled`, `Drafts/ignored`) are agent state, not knowledge, and
   move to the cache state directory.
3. **One link rule.** A note links only to notes in its own tier or in a
   wider tier (a higher tier number). A note never links to a narrower tier
   or to a personal surface. Personal surfaces are tier-0-equivalent link
   sources: they may link into any tier, and nothing links to them. The rule
   gives the vault one property: any shared **suffix** of the tier order
   (tier N through the widest tier) is link-closed. Every link a recipient
   can see resolves inside what they received. One placement rule follows,
   stated as an exclusion: **put each note in the widest tier that excludes
   every subject or party who must not read it.** When no shared tier
   excludes them, the note lives in tier 0 permanently. Wiki links in shared
   tiers are tier-prefixed and vault-absolute; a bare-basename wiki link in
   a shared tier is a validation finding, because overlays (point 6)
   duplicate basenames across tiers. Relative links inside one entity
   subdirectory are exempt, so folder-atomic units (a per-candidate folder,
   an asset collection) move as single units.
4. **Tier 0 is the owner-only tier.** `0-Draft/` is the standard place for
   work in progress **and** for permanent owner-only material. Rank 0 is the
   narrowest tier, so a tier-0 note may link to anything in the graph and no
   wider tier may link into tier 0. No share that leaves the machine
   includes tier 0. Two actions move content outward. **Promote:** a human
   moves a matured note into its tier; validation then confirms its links
   against the new tier. **Export:** a skill emits a copy of a note or a
   note's body through a channel (mail, chat, a file handed over) to named
   recipients; the note itself keeps its tier. Deliverables for one named
   recipient, briefs for a panel that is not a tier audience, and outgoing
   message bodies are export cases, never placements. Content for an ad-hoc
   subset of a tier's audience goes to the narrowest tier that contains the
   whole subset, or stays in tier 0 and reaches its readers by export.
5. **Cumulative sharing over mounts.** Grant access as a suffix of the tier
   order. A member who receives tier N also receives every wider tier.
   Shares start at tier 1 or wider and travel over any folder-syncing
   mechanism; OneDrive and Git are both supported. A shared tier directory
   is either a plain directory or, typically, a **symlink to a separately
   synced folder**. The rank derives from the symlink's own name at the
   vault root; the sync target's basename does not matter, and validation
   follows symlinks. Shared-ness is a property of the sync target, not of
   the name; the validator cannot verify who a sync platform grants access
   to. The tier-0 guarantee is a sync-configuration requirement: the
   physical vault root must live outside any cloud-synced user folder. The
   template documents this model; the sync tooling executes it.
6. **Overlays split one entity across tiers.** A sensitive facet of an
   entity lives as an **overlay** note in a narrower tier. An overlay
   declares itself by its one-way link to the canonical note in the wider
   tier; the same relative path is the default convention, not a
   requirement, so a cross-entity overlay (a recruitment record as the
   confidential facet of a person) is legal. The canonical note never links
   back. Three overlay forms cover the observed patterns. **Facet:** the
   overlay holds the narrower sections. **Timeline split:** the canonical
   note keeps wide-audience dated entries, the overlay holds narrower
   entries under the same date keys, and a narrow-access reader merges the
   two logs chronologically. **Inverse stub:** when the canonical content is
   narrow but widely linked, a wider-tier stub carries only shareable
   identity facts and the narrow note links down to it. Link inversion is
   the mechanical move: a wider note's link into a narrower tier moves, with
   its one-line context, into the narrower note, and leaves no tombstone.
7. **Instructions teach the tiers everywhere.** The root CLAUDE.md shipped
   with Outpost carries the canonical tier description, the root model, the
   link rule, the placement rule, the promote and export actions, the
   overlay forms, and the sharing model. Every agent profile declares its
   read scope and its default write tier. Every skill declares the tier it
   writes to (`none` when it writes nothing into the graph). Two write rules
   close the observed leak paths. **Entry routing:** an agent or human who
   appends a dated entry routes the entry to the note in the entry's own
   tier (a recruitment fact goes to the tier-2 overlay, never to the tier-3
   canonical note). **Aggregate default:** agent-written reports, indexes,
   and syntheses that draw on narrower-tier sources default to `0-Draft/`;
   promotion into a shared tier is a human act. No agent defaults to tier 1.
   Backlinks stay within a tier, and the shared changelog becomes one
   changelog per shared tier, discovered inside tier directories only, so
   that no entry names a narrower tier's notes and the root instruction
   CHANGELOG.md stays a distinct artifact. The Ethics & Integrity rules stay
   non-negotiable and unchanged in force inside every tier: a tier narrows a
   note's audience, and the note is still written as if its subject will
   read it. Tiers never license dossiers.
8. **Rights ride on top of tiers.** A note or folder may carry a
   no-redistribute marker that sharing guidance honors regardless of tier.
   Third-party copyrighted copies and licensed assets are ineligible for
   tier 4 whatever their audience. Erasure stays a bounded operation by one
   authoring rule: interview-outcome and assessment prose about a named
   subject lives only in the subject's own record in its tier; wider notes
   record only that an event happened. An erasure sweep then covers the
   subject's record, every recorded alias, and the owner's personal
   surfaces, and ends with a validation run to catch the dangles it creates.
9. **A validator in the `fit-outpost` CLI.** The CLI validates a knowledge
   base. It checks that tier ranks are unambiguous and that no note links to
   a narrower tier or out of the graph; a link that resolves to nothing or
   to more than one target is a finding, and a bare-basename wiki link in a
   shared tier is a finding. A literal path string in a shared note that
   names a narrower tier or a personal surface is a finding too; this is
   mechanical path detection, not prose understanding. It fails a legacy
   layout: a `Knowledge/` or `Drafts/` directory at any time, or one of the
   old layout's entity directories at a root that has no tiers yet, fails
   with a pointer to migration guidance; after migration, a legacy finding
   means an unrepointed generator still writes old paths. A target directory
   with no tiers at all fails the same way. It reports each violation with
   file, line, and target, exits non-zero on any non-baselined finding, and
   emits machine-readable findings on request so migration tooling can
   consume them. A checked-in **baseline** file grandfathers known findings
   (for example future-dated links a scheduled skill mints by design):
   baselined findings report as warnings, new findings fail. It passes a
   conforming full vault and a conforming suffix subset, so any recipient of
   a share can run it. Personal surfaces are outside its scope. Validation
   proves **structural** compliance; it does not prove a note's prose is
   audience-appropriate.
10. **Migration is agent-executed and human-gated.** MIGRATION.md ships with
    the release as an executable, phased playbook, not prose guidance.
    Agents execute the mechanical phases: inventory, hygiene, bulk moves,
    the link rewrite, and validator-driven convergence. Humans decide at
    named gates: the tier assignment for every top-level directory
    (migration blocks until each has one), every routing into tier 1 or
    tier 0, the findings baseline, and the share grants. The playbook opens
    by stopping the agent scheduler and pausing sync, works on a copy under
    version control, repoints every instruction and generator before the
    scheduler restarts, and ends when validation passes. It includes a
    ready-to-run multi-agent workflow prompt and the deterministic split
    rules of point 6, so different agents produce the same splits.
11. **Clean break, new major version.** This change removes the `Knowledge/`
    and `Drafts/` layout from every instruction, template, and documentation
    surface. The release that ships it is a new major version of the Outpost
    package, and its notes point to MIGRATION.md.

**Compatibility stance:** clean break. No template instruction, agent, or
skill supports the `Knowledge/` or `Drafts/` layout after this change.
Old-path removal is a success criterion (#9).

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| Template root CLAUDE.md | Canonical tier description, root model, link rule, placement rule (exclusion form), promote and export actions, overlay forms, entry-routing and aggregate-default write rules, no-redistribute marker, suffix sharing model over mounts (replaces the "KBs are not Git repositories" sharing statement), tier-aware workspace layout, ethics rules restated as tier-independent. |
| Template agent profiles (all 6) | Each declares read scope and default write tier in a `## Tiers` section, and every body path moves to the tier-prefixed form. Aggregate outputs default to `0-Draft/`. |
| Template skills (all 28, with their references and scripts) | Every SKILL.md declares its write tier; tier-aware paths and write targets per the default-contents mapping; drafting skills write to `0-Draft/`; export cases named; the draft-status ledgers move to the cache state directory; per-tier changelog; tier-aware backlink, entry-routing, and link-format rules. |
| Template MIGRATION.md (new) | The phased, human-gated migration playbook with the bundled multi-agent workflow prompt and the deterministic split rules. |
| `fit-outpost init` | Creates the five default tier directories and `Briefings/` at the KB root. |
| `fit-outpost update` | Installs the new instructions, and installs MIGRATION.md while the knowledge base still carries a legacy layout. |
| `fit-outpost` validation | Gains the knowledge checks: rank grammar and uniqueness, link direction, resolution, and format, path-string detection, legacy-layout detection, machine-readable output, and the findings baseline. |
| Published `fit-outpost` skill and Outpost docs pages (product page, getting started, knowledge-systems guides) | Describe the tier model, the overlay forms, the export action, and the validator; `Knowledge/` and `Drafts/` example paths are rewritten. |
| Release | Major version cut of the Outpost npm package. |

### Excluded

| Item | Why |
| ---- | --- |
| Access enforcement | The filesystem, OneDrive, or Git host owns permissions and polices readers. Outpost defines the boundaries; the validator cannot see a sync platform's ACLs. |
| Sync tooling | How a team shares each tier (OneDrive share, Git remote, submodule) stays the team's choice. MIGRATION.md gives the sequence and an ACL checklist, not automation. |
| Encryption or redaction | Out of scope; tiers are a placement-and-audience model. |
| Per-note tier metadata | The directory is the tier. Front-matter tiering would break the folder-equals-share-unit invariant. |
| Prose-mention detection | The validator detects links and literal path strings mechanically. A prose sentence that names a restricted fact without either is an authoring-judgment matter the instructions govern. |
| Per-entity share scoping inside a tier | Tier-2 sharing is deliberately coarse: a tier-2 recipient receives the whole tier. Narrower per-requisition scoping is a future spec. |
| Export transport | Export travels over the existing drafting and sending skills. This spec names the action; it adds no new channel. |
| Policing personal root content | The root outside the tiers is personal by definition. The validator flags legacy layouts there and nothing else. |
| Unattended content migration | Agents execute the mechanical phases; humans own every audience decision at the named gates. No fully automatic pass decides a note's audience. |
| Backward compatibility with the `Knowledge/` layout | Clean break per the compatibility stance. |
| Outpost trust-boundary architecture | Spawn-env allow-set, state-file naming, and settings deny rules are untouched. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | A fresh init creates the five default tier directories, `Briefings/`, and the bundled instruction files (CLAUDE.md, apm.yml, `.claude/`) at the KB root, and nothing else; no MIGRATION.md; entity subdirectories stay on-demand. | Product test after init. |
| 2 | The template root CLAUDE.md describes the tier system, the root model, the link rule, the exclusion-form placement rule, the promote and export actions, the three overlay forms, the entry-routing and aggregate-default write rules, and the sharing-over-mounts model. | Read `products/outpost/templates/CLAUDE.md`. |
| 3 | Every template agent profile carries a `## Tiers` section with read scope and default write tier (`none` allowed), and no agent defaults to tier 1. | `rg --files-without-match '^## Tiers' products/outpost/templates/.claude/agents/*.md` returns nothing; profile review. |
| 4 | Every template skill declares its write tier (`none` when it writes nothing into the graph). | `rg --files-without-match '^Write tier:' products/outpost/templates/.claude/skills/*/SKILL.md` returns nothing. |
| 5 | Validation reports duplicate or out-of-grammar tier ranks and each narrower-tier, unresolved, ambiguous, or bare-basename link with file, line, and target, and exits non-zero. | Product tests with violating fixtures. |
| 6 | Validation reports a literal path string in a shared note that names a narrower tier or a personal surface. | Product test with a path-string fixture. |
| 7 | Validation emits machine-readable findings on request, and a baseline file downgrades known findings to warnings while new findings still fail. | Product tests: JSON output shape; baseline fixture passes, new violation fails. |
| 8 | Validation passes a conforming full vault, a conforming suffix subset, and a vault whose tier directories are symlinks into sync targets with unrelated basenames. | Product tests with conforming and symlinked fixtures. |
| 9 | Validation fails a legacy layout (`Knowledge/` or `Drafts/` present, an old entity directory at a tier-less root, or a target with no tiers) and names MIGRATION.md. | Product tests with legacy fixtures. |
| 10 | MIGRATION.md ships in the template as the phased playbook with the human gates, the split rules, and the bundled workflow prompt, and `fit-outpost update` installs it into a knowledge base with a legacy layout. | Product test: after update on a legacy fixture, MIGRATION.md exists at the KB root; content review against point 10. |
| 11 | The migration playbook converges: run against a legacy fixture vault with seeded violations (a mixed-audience note, a wider-to-narrower link, a bare link, a grown directory), it reaches a passing validation with human input only at the named gates. | Product test over the fixture vault. |
| 12 | No template instruction references a `Knowledge/` or `Drafts/` path. | `rg --hidden -e 'Knowledge/' -e 'Drafts/' products/outpost/templates/` returns nothing outside MIGRATION.md, which documents the old layout. |
| 13 | The Outpost docs and the published skill describe the tier model and keep no `Knowledge/` or `Drafts/` example path. | The criterion 12 command over `websites/fit/outpost/`, `websites/fit/docs/getting-started/engineers/outpost/`, `websites/fit/docs/products/knowledge-systems/`, and `.claude/skills/fit-outpost/` returns nothing; the product page and getting-started guide carry the tier table and validator command. |
| 14 | The changelog convention is one changelog per shared tier, discovered inside tier directories only. | The changelog skill names the per-tier location; criterion 12 retires `Knowledge/CHANGELOG.md`. |
| 15 | Repository checks stay green. | `bun run check` and `bun run test` pass. |
| 16 | The release is a major cut. | After the release cut, `npm view @forwardimpact/outpost version` reports the next major, per kata-release-cut. |
