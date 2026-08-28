# Design 2310 — Outpost Tiered Knowledge

Applies spec 2310 to the Outpost product: the knowledge base becomes an
ordered set of numbered tier directories at the vault root (the `Knowledge/`
wrapper and the personal `Drafts/` directory are removed, and `0-Draft/`
becomes the standard draft home), the tier order becomes a one-way link rule,
the whole instruction system (root CLAUDE.md, six agent profiles, every
graph-touching skill) teaches placement by tier, and `fit-outpost validate`
gains knowledge checks that enforce rank uniqueness, link direction, and
legacy-layout detection. The change is a clean break and ships as the next
major version with a MIGRATION.md.

## Restated problem

One `Knowledge/` directory is one sharing unit with one audience. Teams hold
knowledge with several audiences (management internals, recruitment and
compensation, team-wide notes, outward-shareable content), and drafts have no
home in the graph at all. Obsidian wiki links carry titles across notes, so a
naive folder split leaks restricted titles into wide audiences and dangles
links for partial recipients. Success means: init creates the five default
tiers at the root, every instruction surface declares tier placement, the
validator reports narrower-tier links and legacy layouts with file and line,
conforming full vaults and suffix subsets pass, and the `Knowledge/` and
`Drafts/` layout is gone from every template and docs surface.

## Architecture

The KB root is the Obsidian vault. The numbered tier directories at the root
are the knowledge graph and the units of sharing; tier names alone declare
the order, so any received subset carries its own declaration. Every other
root entry (instruction surfaces, `Briefings/`) is personal and never shared.

```mermaid
flowchart LR
  subgraph KB["KB root (the Obsidian vault)"]
    T0["0-Draft"] --> T1["1-Management"]
    T1 --> T2["2-Confidential"]
    T2 --> T3["3-Team"]
    T3 --> T4["4-Public"]
    P["personal: CLAUDE.md, .claude/, Briefings/"]
  end
  V["fit-outpost validate (kb-validator)"] -->|"scan tiers, resolve, compare ranks"| KB
  I["Instructions: CLAUDE.md + agents + skills"] -->|"place writes by tier"| KB
```

Arrows between tiers show the only legal link direction: a note links to its
own tier or a wider tier (higher rank number). Sharing is cumulative by
suffix and starts at tier 1: tier 1 recipients hold 1–4, tier 2 recipients
hold 2–4, tier 3 recipients hold 3–4, and tier 4 alone can leave the team.
`0-Draft/` is in the graph but in no share. Every shared suffix is
link-closed: all links resolve inside what the recipient received, and no
link in wider content names a narrower tier's note.

## Components

| Component | Where | Responsibility |
| --------- | ----- | -------------- |
| Tier layout | `<N>-<Label>/` directories at the KB root; default `0-Draft`, `1-Management`, `2-Confidential`, `3-Team`, `4-Public` created by init | The directory name carries the rank (leading integer) and the human label. The tier set is exactly the numbered directories present, so a suffix subset is a valid vault. Two directories with the same rank are a validation finding. Entity subdirectories repeat per tier on demand, exactly as skills create them today. |
| KB validator | New validator module in the Outpost product, wired into the `validate` command | Reads the KB root: collects the numbered tier directories and flags duplicate ranks; flags a legacy layout (`Knowledge/`, `Drafts/`, or one of the historical entity directories — People, Organizations, Projects, Topics, Candidates, Priorities, Conditions, Roles, Prospects, Erasure, Tasks — at the root) with a MIGRATION.md pointer; indexes **every file** under the tiers (notes and assets such as candidate PDFs); extracts wiki links, embeds, and non-URL markdown links from each note; resolves wiki links and embeds from the KB root with a unique-basename fallback, and resolves relative markdown links from the source note's directory; emits a finding per unresolved target (out-of-graph links resolve to nothing, so this covers them) and per link whose target rank is lower than its source rank. Reports `file:line — kind — link` and exits non-zero on any finding. Personal root entries other than the legacy set are ignored. |
| CLI surface | `fit-outpost validate [path]`; `init`; `update` | `[path]` names the KB root (the vault directory that holds the tiers), defaulting to the current directory, the same convention `update [path]` uses today. A share recipient holds their own KB root and places received tier directories in it, per the sharing model, so validation always anchors on a KB root; `npx fit-outpost validate` needs no scheduler. Without a path the command also validates every configured knowledge base after the existing agent-definition checks. `init` creates the five default tier directories plus `Briefings/` and no entity subdirectories. `update` installs the rewritten instructions, and installs MIGRATION.md while the KB still carries a legacy layout. |
| Root CLAUDE.md template | `templates/CLAUDE.md` | The one canonical home for the tier system: the root model (tiers are the graph, everything else at the root is personal), the tier table with default contents, the link rule, the placement rule (put each note in the widest tier whose whole audience may read it), the draft-promotion flow (mature in `0-Draft/`, a human moves the note to its tier, validate), the suffix sharing model (replacing the "KBs are not Git repositories" statement), and the tier-aware workspace layout. Operating Context reads Priorities and Conditions from every tier present. The Ethics & Integrity rules stay in force inside every tier. |
| Agent profiles | `templates/.claude/agents/*.md` (all six) | Each profile gains a `## Tiers` section: read scope (every tier present in the KB) and a default write tier — `postman` writes `0-Draft` (its output is drafts); `concierge` and `librarian` write `3-Team`; `recruiter` and `head-hunter` write `2-Confidential`; `chief-of-staff` declares write tier `none` (its output is personal `Briefings/`). No agent defaults to `1-Management`; tier-1 content is placed by the user or by explicit instruction. |
| Skill set | `templates/.claude/skills/**` (SKILL.md, references, scripts) | Every graph-touching skill carries a `Write tier:` declaration (`none` for read-only skills) and uses tier-prefixed paths. Composing skills (`draft-emails`, `send-chat`, `doc-create`, `deck-create`, `doc-collab` working copies) write to `0-Draft/`. Entity routing follows the spec's default-contents mapping **per entity type**, not per skill: People, Organizations, Projects, Topics, Priorities, Conditions, and Tasks go to `3-Team`; Candidates, Prospects, Roles, and Erasure go to `2-Confidential`. `extract-entities` therefore writes general entities to `3-Team` and routes its Role and Candidate enrichment to `2-Confidential`. `req-forget` sweeps every tier present and keeps its erasure record in `2-Confidential`. `changelog` writes one `CHANGELOG.md` per shared tier (ranks 1 and up), each scoped to that tier's notes; `0-Draft/` keeps none. The link reference carries the tier-prefixed link format (`[[3-Team/People/Sarah Chen]]`), which is now vault-absolute, so Obsidian resolves it directly with no suffix matching. Scripts with entity-path arguments (for example the CV bundle splitter) take tier-prefixed paths. |
| Facet overlays | Instruction convention in CLAUDE.md and `extract-entities` | A sensitive facet of an entity lives as an overlay note at the same relative path in a narrower tier (`2-Confidential/People/Jane Doe.md`) and links to the canonical note in the wider tier (`3-Team/People/Jane Doe.md`). The canonical note never links back. Backlinks stay symmetric within a tier only. |
| MIGRATION.md | `templates/MIGRATION.md` | Step-by-step guidelines: create the tier directories at the root, move each note from `Knowledge/` into the widest permissible tier, move `Drafts/` content into `0-Draft/`, delete the empty `Knowledge/` and `Drafts/` directories, rewrite links to tier-prefixed form, split sensitive facets into overlays, split the old changelog per shared tier, share suffixes, and finish when `validate` passes. Also states the future-link consequence: a link to a not-yet-created note fails validation, so create the target or defer the link. |
| Docs and published skill | Outpost product page, getting-started guide, knowledge-systems guides, `fit-outpost` skill | Carry the tier table, the root model, the sharing model, and the validate command; `Knowledge/` and `Drafts/` example paths are rewritten. The skill's Documentation list and the CLI `documentation` array stay in parity. |
| Release | kata-release-cut | The shipping release is the next major of the Outpost npm package, and its notes name the break and point to MIGRATION.md. |

## Interfaces

- **Tier rank contract.** The rank of a path is the leading integer of its
  first segment under the KB root (`^[0-9]+-`). A lower rank means a narrower
  audience; rank 0 is the draft tier. Rank derives from the name alone, so
  validation needs no config and works on any suffix subset. Duplicate ranks
  are a finding.
- **Link legality predicate.** A link is legal when
  `rank(target) >= rank(source)`. Rank 0 sources may therefore link to
  everything, and no tier links into rank 0. Wiki links, embeds, and relative
  markdown links follow the same predicate; targets may be notes or assets,
  and every target must live inside a tier. External URLs are out of scope.
- **Finding shape.** `{kind, file, line, link, sourceTier, targetTier}` with
  kinds `legacy-layout`, `duplicate-rank`, `unresolved`, and `narrower-link`.
  Exit code 0 means no findings; non-zero otherwise. An `unresolved` finding
  is a real defect in a conforming vault, because a legal link always
  resolves inside the suffix the reader holds; a link that points at a
  personal surface is `unresolved` by construction. `legacy-layout` findings
  carry the MIGRATION.md pointer.
- **Instruction layering.** CLAUDE.md is the single home for the tier
  system's rules. Agent profiles and skills declare their own read scope and
  write tier and point to CLAUDE.md; they never restate the rule set.

## Key decisions

| Decision | Choice | Rejected alternative |
| -------- | ------ | -------------------- |
| Graph location | Tier directories directly at the vault root | Keep them under a `Knowledge/` wrapper — one more path segment in every link and every share for a directory that carries no audience meaning of its own; the numbered tiers already delimit the graph. |
| Draft home | `0-Draft/` as the rank-0 tier inside the graph | A personal `Drafts/` outside the tier system — drafts then carry unvalidated links, have no standard home agents and humans share, and offer no promotion path into the graph. |
| Tier identity | Numbered directory prefix; the tier set is the directories present | A tier manifest file — a second source of truth that a partial share can omit, breaking suffix validation. Per-note front matter is excluded by the spec. |
| Briefings | Stay a personal root surface outside the graph | Fold them into `0-Draft/` — a briefing is a finished per-owner deliverable that synthesizes all tiers, not work in progress awaiting placement. |
| Root policy | The validator checks tier directories and the legacy set, and ignores other root entries | Police every root entry — the root is personal by doctrine, and the vault legitimately holds instruction surfaces and the owner's own folders. |
| Link rule enforcement | Static validation in the CLI over the files themselves | Share-time scrubbing or reviewer discipline — unenforceable, leaks by default, and invisible to agents. |
| Entity taxonomy | Repeated per tier on demand; canonical note in the widest permissible tier; narrower facets as overlay notes linking one way | One canonical entity tree with sensitive fields inline — the sensitive fields would sit in team-wide notes, which is the leak this spec removes. |
| Tier routing granularity | Per entity type (spec's default-contents mapping) | Per skill — `extract-entities` touches both general and recruitment entities, so a single per-skill tier would route `Roles/` to two different homes. |
| Backlink convention | Symmetric backlinks within a tier only; cross-tier references are one-way from the narrower note | Always-symmetric backlinks — the wider note would name the narrower note and leak its existence. |
| Changelog | One `CHANGELOG.md` per shared tier; none in `0-Draft/` | Keep one shared changelog — its entries name narrow-tier notes to the widest audience. |
| Validator home | Extend `fit-outpost validate` with an optional KB-root path; extraction and comparison live in a pure module | A new subcommand — a second validation entry point for one product. An Obsidian plugin — per-user install, not scriptable for agents or CI. |
| Link resolution | Wiki links and embeds resolve from the KB root with a unique-basename fallback; relative markdown links resolve from the source note's directory; all files under the tiers are index targets; anything ambiguous or missing is a finding | Emulating Obsidian's full "shortest unique path" behavior — setting-dependent and complex. A notes-only index — the templates link candidate PDFs from briefs, so a conforming vault would fail. Silently skipping unresolved links — hides both leaks and broken shares. |
| Migration delivery | `update` installs MIGRATION.md while a legacy layout remains, and skips it once the KB conforms | Docs-site-only migration guidance — the person running `update` inside a KB never sees the site page at the moment the break lands. Unconditional install — re-litters every migrated vault on every future update. |
| Default write tiers | Per the agent-profile mapping; no agent defaults to `1-Management` | Letting agents default writes into tier 1 — scheduled agents would silently mint management-only content the user never placed. |

## Data flow

```mermaid
sequenceDiagram
  participant U as user or agent
  participant CLI as fit-outpost validate
  participant V as kb-validator
  participant KB as KB root
  U->>CLI: validate [path]
  CLI->>CLI: agent-definition checks (no path given)
  CLI->>V: knowledge checks (per KB root)
  V->>KB: read root → tier set, legacy-layout and duplicate-rank findings
  V->>KB: index all files under the tiers, extract links per note
  V->>V: resolve targets, compare ranks
  V-->>CLI: findings [{kind, file, line, link, tiers}]
  CLI-->>U: report file:line per finding; one exit code
```

## Success criteria coverage

| # | Met by |
| - | ------ |
| 1 | CLI surface component: init creates the five tier directories and `Briefings/` only. |
| 2 | Root CLAUDE.md template component: root model, tier table, link rule, placement rule, promotion flow, sharing model. |
| 3 | Agent profiles component: `## Tiers` section in all six profiles, `none` allowed. |
| 4 | Skill set component: `Write tier:` declaration in every graph-touching skill. |
| 5 | KB validator: `narrower-link` and `unresolved` findings with file, line, target; non-zero exit. |
| 6 | Tier rank contract: rank from names alone, so full vaults and suffix subsets validate identically. |
| 7 | `legacy-layout` findings name MIGRATION.md and cover `Knowledge/`, `Drafts/`, and bare entity directories. |
| 8 | MIGRATION.md component: shipped in templates, installed by `update` on a legacy KB. |
| 9 | Skill set + agent profiles + CLAUDE.md rewrite removes every `Knowledge/` and `Drafts/` path; verified by the spec's `rg` gate with the MIGRATION.md carve-out. |
| 10 | Docs and published skill component, including rewritten example paths. |
| 11 | Skill set component: per-shared-tier changelog. |
| 12 | Implementation lands with product tests for validator, init, and update; the repository check and test commands gate the PR. |
| 13 | Release component: next-major cut per kata-release-cut. |

## Clean break and scope

Removed with no shim: the `Knowledge/` wrapper directory and every reference
to it, the personal `Drafts/` directory in favor of `0-Draft/`, the
un-tiered workspace layout and the "KBs are not Git repositories" sharing
statement in the template CLAUDE.md, every `Knowledge/<Entity>/` path in
agent profiles, skills, references, scripts, and docs pages, and the single
shared changelog convention. `validate` stops being silent about knowledge
content. No compatibility mode reads the old layout; a legacy KB fails
validation and MIGRATION.md is the path forward. Access enforcement, sync
tooling, encryption, and the Outpost trust-boundary architecture stay
untouched per the spec's exclusions.
