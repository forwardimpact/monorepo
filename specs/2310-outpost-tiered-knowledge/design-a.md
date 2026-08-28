# Design 2310 — Outpost Tiered Knowledge

Applies spec 2310 to the Outpost product: `Knowledge/` becomes an ordered set
of numbered tier directories, the tier order becomes a one-way link rule, the
whole instruction system (root CLAUDE.md, six agent profiles, every
Knowledge-touching skill) teaches placement by tier, and `fit-outpost
validate` gains knowledge checks that enforce tier membership and link
direction. The change is a clean break and ships as the next major version
with a MIGRATION.md.

## Restated problem

One `Knowledge/` directory is one sharing unit with one audience. Teams hold
knowledge with several audiences (management internals, recruitment and
compensation, team-wide notes, outward-shareable content). Obsidian wiki
links carry titles across notes, so a naive folder split leaks restricted
titles into wide audiences and dangles links for partial recipients. Success
means: init creates default tiers, every instruction surface declares tier
placement, the validator reports narrower-tier links and untiered content
with file and line, conforming full vaults and suffix subsets pass, and the
un-tiered layout is gone from every template surface.

## Architecture

```mermaid
flowchart LR
  subgraph KB["Knowledge/ (one Obsidian vault, four default tiers)"]
    T1["1-Management/"] --> T2["2-Confidential/"]
    T2 --> T3["3-Team/"]
    T3 --> T4["4-Public/"]
  end
  T1 -.share suffix {1..4}: senior management.-> S1[ ]
  T2 -.share suffix {2..4}: managers.-> S2[ ]
  T3 -.share suffix {3..4}: whole team.-> S3[ ]
  T4 -.share suffix {4}: outside the team.-> S4[ ]
  V["fit-outpost validate — kb-validator"] -->|scans, resolves, compares ranks| KB
  I["Instruction system: CLAUDE.md + agents + skills"] -->|places writes by tier| KB
```

Arrows inside the vault show the only legal link direction: a note links to
its own tier or a wider tier (higher number). Every shared suffix is
link-closed: all links resolve inside what the recipient received, and no
narrow-tier title appears in wider content.

## Components

| Component | Where | Responsibility |
| --------- | ----- | -------------- |
| Tier layout | `Knowledge/<N>-<Label>/` directories; default `1-Management`, `2-Confidential`, `3-Team`, `4-Public` created by init | The directory name carries the rank (leading integer) and the human label. The tier set is exactly the numbered directories present, so a suffix subset is a valid vault. Entity subdirectories (People, Projects, …) repeat per tier on demand, exactly as skills create them today. |
| KB validator | New validator module in the Outpost product, wired into the `validate` command | Walks `Knowledge/`: flags top-level entries that are not tier directories (dotfiles ignored); indexes all note paths; extracts wiki links, embeds, and relative markdown links from each note; resolves each target (tier-absolute path first, unique basename fallback); emits a finding per unresolved target and per link whose target rank is lower than its source rank. Reports `file:line — kind — link` and exits non-zero on any finding. Legacy entity directories directly under `Knowledge/` produce a finding that names MIGRATION.md. |
| CLI surface | `fit-outpost validate [path]`; `init`; `update` | `validate` keeps the agent-definition checks and adds the knowledge checks: with a path it validates that knowledge base only (a share recipient without a scheduler can run it via `npx`); with no path it also validates every configured knowledge base. `init` creates the four default tier directories. `update` installs the rewritten instructions and copies MIGRATION.md to the KB root. |
| Root CLAUDE.md template | `templates/CLAUDE.md` | The one canonical home for the tier system: the tier table, the link rule, the placement rule (put each note in the widest tier whose whole audience may read it), the suffix sharing model, and the tier-aware workspace layout. Operating Context reads Priorities and Conditions from every tier present. |
| Agent profiles | `templates/.claude/agents/*.md` (all six) | Each profile gains a short tier block: read scope (every tier present in the KB) and a default write tier — `postman`, `concierge`, `librarian` write to `3-Team`; `recruiter` and `head-hunter` write to `2-Confidential`; `chief-of-staff` writes only personal `Briefings/`. No agent defaults to `1-Management`; tier-1 content is placed by the user or by explicit instruction. |
| Skill set | `templates/.claude/skills/**` (SKILL.md, references, scripts) | Every Knowledge-touching skill names its target tier and uses tier-absolute paths. `extract-entities` writes entities to `3-Team`, keeps backlinks within a tier, and links one-way from a narrower note to a wider one; its link reference carries the tier-absolute link format (`[[3-Team/People/Sarah Chen]]`). The `req-*` family and `candidate-report` write to `2-Confidential`. `changelog` writes one `CHANGELOG.md` per tier, each scoped to that tier's notes. Scripts with entity-path arguments (for example the CV bundle splitter) take tier-prefixed paths. |
| Facet overlays | Instruction convention in CLAUDE.md and `extract-entities` | A sensitive facet of an entity lives as an overlay note at the same relative path in a narrower tier (`2-Confidential/People/Jane Doe.md`) and links to the canonical note in the wider tier (`3-Team/People/Jane Doe.md`). The canonical note never links back. |
| MIGRATION.md | `templates/MIGRATION.md`, installed at the KB root by `update` only | Step-by-step guidelines: create the tier directories, move each note into the widest permissible tier, rewrite links to tier-absolute form, split sensitive facets into overlays, split the old changelog, share suffixes, and finish when `validate` passes. |
| Docs and published skill | Outpost product page, getting-started guide, knowledge-systems guides, `fit-outpost` skill | Carry the tier table, the sharing model, and the validate command. The skill's Documentation list and the CLI `documentation` array stay in parity. |
| Release | kata-release-cut | The shipping release is the next major of the Outpost npm package, and its notes name the break and point to MIGRATION.md. |

## Interfaces

- **Tier rank contract.** The rank of a path is the leading integer of its
  first segment under `Knowledge/` (`^[1-9][0-9]*-`). A lower rank means a
  narrower audience. Rank derives from the name alone, so validation needs no
  config and works on any suffix subset.
- **Link legality predicate.** A link is legal iff
  `rank(target) >= rank(source)`. Embeds and relative markdown links follow
  the same predicate. External URLs are out of scope.
- **Finding shape.** `{kind, file, line, link, sourceTier, targetTier}` with
  kinds `untiered`, `legacy-layout`, `unresolved`, `narrower-link`. Exit code
  0 means no findings; non-zero otherwise. An `unresolved` finding is a real
  defect in a conforming vault, because a legal link always resolves inside
  the suffix the reader holds.
- **Instruction layering.** CLAUDE.md is the single home for the tier
  system's rules. Agent profiles and skills declare their own read scope and
  write tier and point to CLAUDE.md; they never restate the rule set.

## Key decisions

| Decision | Choice | Rejected alternative |
| -------- | ------ | -------------------- |
| Tier identity | Numbered directory prefix (`3-Team`); the tier set is the directories present | A tier manifest file — a second source of truth that a partial share can omit, breaking suffix validation. Per-note front matter is excluded by the spec. |
| Link rule enforcement | Static validation in the CLI over the files themselves | Share-time scrubbing or reviewer discipline — unenforceable, leaks by default, and invisible to agents. |
| Entity taxonomy | Repeated per tier on demand; canonical note in the widest permissible tier; narrower facets as overlay notes linking one way | One canonical entity tree with sensitive fields inline — the sensitive fields would sit in team-wide notes, which is the leak this spec removes. |
| Backlink convention | Symmetric backlinks within a tier only; cross-tier references are one-way from the narrower note | Always-symmetric backlinks — the wider note would name the narrower note and leak its existence. |
| Changelog | One `CHANGELOG.md` per tier | Keep the single `Knowledge/CHANGELOG.md` — its entries name narrow-tier notes to the widest audience. |
| Validator home | Extend `fit-outpost validate` with an optional KB path; extraction and comparison live in a pure module | A new subcommand — a second validation entry point for one product. An Obsidian plugin — per-user install, not scriptable for agents or CI. |
| Link resolution | Tier-absolute path from the `Knowledge/` root first; unique-basename fallback; ambiguous or missing target is a finding | Emulating Obsidian's full "shortest unique path" behavior — setting-dependent and complex; silently skipping unresolved links — hides both leaks and broken shares. |
| Untiered content | Any non-tier top-level entry is a finding; legacy entity directories add a MIGRATION.md pointer | Grandfathering un-tiered notes — backward compatibility is excluded by the spec. |
| Migration delivery | MIGRATION.md copied to the KB root by `update`, not by `init` | Docs-site-only migration guidance — the person running `update` inside a KB never sees the site page at the moment the break lands. |
| Default write tiers | Communication and knowledge agents write `3-Team`; recruitment agents write `2-Confidential`; no agent defaults to `1-Management` | Letting agents default writes into tier 1 — scheduled agents would silently mint management-only content the user never placed. |

## Data flow

```mermaid
sequenceDiagram
  participant U as user or agent
  participant CLI as fit-outpost validate
  participant V as kb-validator
  participant KB as Knowledge/
  U->>CLI: validate [path]
  CLI->>V: knowledge checks (per KB)
  V->>KB: walk top level → tier set + untiered/legacy findings
  V->>KB: index notes, extract links per note
  V->>V: resolve targets, compare ranks
  V-->>CLI: findings [{kind, file, line, link, tiers}]
  CLI-->>U: report file:line per finding; exit 0 or 1
  CLI->>CLI: agent-definition checks (no path given)
```

## Success criteria coverage

| # | Met by |
| - | ------ |
| 1 | Tier layout component: init creates the four default tier directories. |
| 2 | Root CLAUDE.md template component: canonical tier table, link rule, sharing model. |
| 3 | Agent profiles component: tier block in all six profiles. |
| 4 | Skill set component: target tier named in every Knowledge-touching skill. |
| 5 | KB validator: `narrower-link` findings with file, line, target; non-zero exit. |
| 6 | Tier rank contract: rank from names alone, so full vaults and suffix subsets validate identically. |
| 7 | `legacy-layout` finding names MIGRATION.md. |
| 8 | MIGRATION.md component: shipped in templates, installed by `update`. |
| 9 | Skill set + agent profiles + CLAUDE.md rewrite removes every un-tiered entity path; verified by the spec's `rg` gate. |
| 10 | Docs and published skill component. |
| 11 | Product tests for validator, init, and update land with the implementation. |
| 12 | Release component: next-major cut per kata-release-cut. |

## Clean break and scope

Removed with no shim: the un-tiered workspace layout in the template
CLAUDE.md, every un-tiered `Knowledge/<Entity>/` path in agent profiles,
skills, references, and scripts, and the single shared changelog convention.
`validate` stops being silent about knowledge content. No compatibility mode
reads the old layout; an un-tiered KB fails validation and MIGRATION.md is
the path forward. Access enforcement, sync tooling, encryption, and the
Outpost trust-boundary architecture stay untouched per the spec's
exclusions.
