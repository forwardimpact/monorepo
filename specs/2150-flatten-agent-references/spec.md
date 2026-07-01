# Spec 2150: Flatten agent references into `.claude/agents/`

**Classification:** Internal. The change lands on the instruction architecture
(`.claude/`), two shared libraries (`libpack`, `libcoaligned`), a Co-Aligned
invariant, and the standard's own documentation (`COALIGNED.md`). It carries
external blast radius because the published `kata-skills` / `fit-skills` packs
ship these agents and references, but that radius **fixes** a defect rather than
introducing one (see § What customers see today).

## Problem

The monorepo stores agent references one directory deep, at
`.claude/agents/references/<name>.md`, and the agent profiles and skills link to
them at that path. The APM packer ships them the same way. But `apm install`
does **not** preserve that directory: its agent integrator collects every `.md`
under a package's agents source recursively and deploys each one by filename
stem into a flat `.claude/agents/`. Skill references survive (the skill
integrator copies skill directories whole); agent references do not.

The result is a structural asymmetry between the monorepo and every customer
install:

| | `.claude/agents/` layout | reference links resolve? |
| --- | --- | --- |
| Monorepo (authored) | profiles + nested `references/` subdir | yes |
| Customer (apm install) | profiles + references **flattened as siblings** | **no — every reference link dangles** |

In a fresh install the nine references land at `.claude/agents/<name>.md`, but
the profiles still link to `.claude/agents/references/<name>.md`, which no
longer exists. An agent that follows its own on-boot reading instructions to
read the memory protocol hits a missing path. The same break hits the GitHub-URL
links that skills use to cite agent references, since those URLs encode the
`references/` segment too.

The monorepo is the outlier. APM's flattening is fixed behavior with no flag to
disable it (its agent integrator derives the target name from the filename stem
and discards the directory). So the only way to make the two structures agree is
to author the monorepo in the shape APM produces: agent references flat in
`.claude/agents/`.

## What customers see today

Customers who already installed the pack **already have the flat layout** with
broken links — the defect is live, not hypothetical. This change does not move
their files; it makes the links resolve against the files they already have, and
makes the monorepo match. No customer migration step is required.

## The distinction being preserved

Agent references and skill references stay **different entities**. This spec
relocates agent references and changes how they are *identified*; it does not
merge them with skill references.

| | Agent reference | Skill reference |
| --- | --- | --- |
| Role | Cross-cutting protocols shared across agents (memory, coordination, approval) | Domain data a single skill's procedure consults |
| Home | `.claude/agents/x-<name>.md` (was `.claude/agents/references/<name>.md`) | `.claude/skills/<skill>/references/<name>.md` (unchanged) |
| Co-Aligned layer | L4, its own length budget | L6, smaller length budget |
| Identified by | **Absence of agent frontmatter** (no `name`/`description`), plus an `x-` filename prefix as an enforced naming convention — was: living in the `references/` subdir | Living under a skill's `references/` (unchanged) |

The classifier shift is the heart of the change. Today "is it in
`agents/references/`?" answers "is this a reference, not a profile?" Flattening
removes that directory, so the question must be answered the way Claude Code's
own agent loader already answers it: a file in `.claude/agents/` is a
**profile** if it has `name`/`description` frontmatter and a **reference** if it
does not. The monorepo's own tooling adopts the same classifier the runtime
already uses.

References also take an `x-` filename prefix (`x-memory-protocol.md`). The
prefix is a human-and-sort aid — it makes references visually obvious as
not-agents and sorts them below all six profiles — and a guard: the two signals
must agree, so a file named `x-*` must carry no agent frontmatter and a profile
must not be named `x-*`. Frontmatter remains the authoritative classifier
because it is what the loader keys on; the prefix is an enforced convention that
keeps the visible name honest about what the loader will do.

## Scope

In scope — the full file inventory belongs in the design:

| Surface | What changes |
| --- | --- |
| Reference files | The nine `.claude/agents/references/*.md` move up to `.claude/agents/x-*.md` (relocated and prefix-renamed); the `references/` subdir is removed. Their own cross-links repoint to the renamed siblings |
| Agent profiles | The six profiles' links to references (`.claude/agents/references/<name>.md` and the relative `references/<name>.md`, with or without `#anchor`) repoint to the flattened, prefixed sibling path |
| Skill citations | The GitHub-URL links across the kata-\* and fit-\* skills that cite agent references drop the `references/` path segment |
| `libpack` | Agent staging classifies by frontmatter: profiles ship as agents, frontmatter-less files ship as flat references and are excluded from the agents table. The dedicated agent-references staging step is retired |
| `libcoaligned` | The instruction-layer model partitions `.claude/agents/*.md` by frontmatter instead of by directory: profiles keep their layer and budget, references keep the L4 layer and budget (including the enlarged `x-memory-protocol` budget), selected from the flat directory |
| Co-Aligned invariant | The genericity rule's `.claude/agents/references/` selector is replaced so it still covers the relocated references; a guard asserts the `x-*` naming convention agrees with the frontmatter classifier (every `x-*` file has no agent frontmatter; no profile is named `x-*`) |
| `COALIGNED.md` | § L4 records the new location and the frontmatter-based identification; the L4-vs-L6 distinction is kept |
| Root docs | `CLAUDE.md`, `CONTRIBUTING.md`, `KATA.md`, and the relevant published doc page drop the `agents/references/` path where they name it |

Out of scope:

- **The L4-vs-L6 distinction.** Agent references stay a separate layer with a
  separate budget. This is a relocation and re-classification, not a merge.
- **Reference content.** No reference is rewritten, split, or shortened. The L4
  budgets are unchanged, so no file needs trimming.
- **Skill references.** `.claude/skills/<skill>/references/` is untouched.
- **Immutable history.** `specs/**` and `CHANGELOG.md` entries that name the old
  path are left as written. New CHANGELOG entries describing this change are in
  scope.
- **APM itself.** No change to the packer/integrator behavior is requested; the
  monorepo conforms to it.

## Success Criteria

| # | Criterion | Verified by |
| --- | --- | --- |
| 1 | No `.claude/agents/references/` directory exists; the nine references live at `.claude/agents/x-<name>.md` | `test ! -d .claude/agents/references`; each former reference resolves at the flat `x-` path |
| 2 | The monorepo's `.claude/agents/` file set and a fresh `apm install` of the pack produce the **same** agent-directory filenames | install the packed bundle into a scratch dir; the sorted basename set of its `.claude/agents/*.md` equals the monorepo's |
| 3 | No reference link dangles, in the monorepo and after install | a link check over `.claude/agents/*.md` (and the packed/installed copy) finds every reference target present; `rg --hidden 'agents/references/'` outside `specs/**` returns nothing |
| 4 | `libpack` ships profiles as agents and frontmatter-less files as flat references, and the generated agents table lists only the real agents | libpack unit tests for the frontmatter partition; the packed bundle has no `references/` subdir and a clean agents table |
| 5 | `libcoaligned` classifies profiles vs references by frontmatter and applies the correct L3/L4 budgets, including the enlarged `x-memory-protocol` budget | libcoaligned tests; `coaligned instructions` passes against the flat layout |
| 6 | The Co-Aligned genericity invariant still covers the relocated references, and a guard enforces that the `x-*` naming convention agrees with the frontmatter classifier | `bun run invariants` passes; it fails if a reference is made repo-specific, if an `x-*` file carries agent frontmatter, or if a profile is named `x-*` |
| 7 | Agent references remain a distinct L4 entity from L6 skill references | `COALIGNED.md` § L4 documents the new location, the `x-` convention, and the frontmatter classifier; the layer and budget separation is intact |
| 8 | All nine references carry the `x-` prefix; no profile does | `ls .claude/agents/` shows the six profiles unprefixed and the nine references as `x-*`, sorting last |
| 9 | Full quality suite passes | repository check, test, format, invariant, and `coaligned` commands all green |

## Persona and Job

Serves **Platform Builders** and **Teams Using Agents** (who install the
`kata-skills` / `fit-skills` packs and need their agents' references to resolve)
and **Internal contributors** (who navigate one consistent layout in the
monorepo and in installs). The change removes a structural asymmetry that
silently breaks agent self-instruction in every install.

## Open decisions (resolved with the requester)

| Decision | Resolution | Needs human signal |
| --- | --- | --- |
| Flatten the monorepo, or move references under a skill (Option B), or leave nested and rewrite links to GitHub URLs? | **Flatten the monorepo** so it matches APM's output | Recommendation — confirmed |
| Keep agent references distinct from skill references? | **Yes** — preserve the L4-vs-L6 layer and budget separation; this is the stated reason for choosing flatten over a shared-skill home | Requirement — confirmed |
| New classifier for "reference vs profile" once the directory is gone | **Absence of `name`/`description` frontmatter**, matching Claude Code's own agent loader | Recommendation — confirmed |
| Make references visually distinct and sort them last | **`x-` filename prefix** (`x-memory-protocol.md`) as an enforced naming convention on top of the frontmatter classifier | Requirement — confirmed |
| `specs/` + CHANGELOG history naming the old path | **Left as-is (immutable)** | Recommendation — confirmed |
