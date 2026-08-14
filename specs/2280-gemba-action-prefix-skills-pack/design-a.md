# Design 2280-a: Gemba-Prefixed Distribution

Spec 2280 renames the four Gemba actions to `gemba-*`, publishes the platform
skills as a `gemba-skills` sibling pack, and updates kata-setup to teach both.
This design fixes the components, interfaces, and rollout. It changes no
runtime behavior. Every action and skill keeps its contents; only names,
publish targets, and references move.

## Component map

```mermaid
graph LR
    subgraph monorepo
        H["Action homes<br/>products/gemba/actions/gemba-*"]
        S["Skills<br/>gemba, gemba-*"]
        PA["publish-actions.yml"]
        PS["publish-skills.yml"]
        KS["kata-setup skill"]
    end
    H --> PA
    PA -->|"subtree split, non-force"| SIB["Siblings<br/>forwardimpact/gemba-benchmark<br/>gemba-bootstrap · gemba-harness · gemba-wiki"]
    S --> PS
    PS -->|"fit-pack stage + tag"| PACK["forwardimpact/gemba-skills"]
    SIB -->|"SHA-pinned uses:"| CON["Consumers<br/>monorepo workflows · kata-agent internals<br/>generated installation workflows"]
    PACK -->|"apm install"| INST["Kata installations"]
    KS -->|"generates"| CON
    KS -->|"prerequisite"| INST
```

## Components

| Component | Where | Change |
| --------- | ----- | ------ |
| Action homes | `products/gemba/actions/` | Four directories rename to `gemba-benchmark`, `gemba-bootstrap`, `gemba-harness`, `gemba-wiki`. Each home stays a byte-faithful whole-root mirror of its sibling, README and self-references included. |
| Action publish workflow | `publish-actions.yml` | The four matrix entries pair each renamed prefix with its renamed repo. The `paths:` filter follows. Kata and Jidoka entries are untouched. |
| Sibling action repos | GitHub org | Operator renames the four repos in place. Redirects, tags, and commit SHAs survive, so existing pins resolve throughout. |
| Split lineage | Seed runbook | The prefix rename changes the split lineage, so each renamed sibling gets one sanctioned re-seed force push, then publishes stay non-force (the spec 2140 runbook pattern). |
| Skill-pack publish workflow | `publish-skills.yml` | The fit leg stages prefix `fit` alone. A new leg publishes `gemba-skills`: prefix `gemba`, version file `products/gemba/package.json`, agents off, README and apm text describing the platform. |
| Pack sibling | `forwardimpact/gemba-skills` | Operator creates it empty. The first publish run seeds it with a plain push and tags it at the Gemba package version. |
| Workflow consumers | `.github/workflows/`, `products/kata/actions/`, benchmark reusable workflow | Every `uses:` line repoints to the renamed sibling at the same commit SHA. The benchmark action's reusable workflow repoints its self-reference. |
| kata-setup skill | `.claude/skills/kata-setup/` | Prerequisites add `apm install forwardimpact/gemba-skills`. The dispatch template, ref-resolution instructions, and placeholder tokens use the `gemba-*` names. |
| monorepo-setup skill | `.claude/skills/monorepo-setup/` | The pack install line adds `forwardimpact/gemba-skills`. |
| Product docs and skills | Gemba overview page, `gemba` skill, `gemba-benchmark` skill, benchmark CI guide | Action tables, `uses:` examples, and Getting Started name the `gemba-*` actions and the pack install. |
| CLI documentation parity | benchmark CLI definition + golden help output | The `documentation` entry's link text follows the renamed action, keeping the skill-to-CLI parity rule intact. |
| Enum and contributor docs | `.github/CLAUDE.md`, CLAUDE.md, KATA.md | The action table in `.github/CLAUDE.md` is the `sibling-composite-actions` enum source. It renames first; the fences reseed from it. The Distribution Model adds `gemba-skills` and remaps Gemba to it. |
| Repo-local paths | session hook, justfile, binaries publish workflow | Installer invocations follow the bootstrap home rename. The installer file name stays `fit-install.sh`. |

## Interfaces

- **Action publish matrix rows** (shape per row, four rows):
  `prefix: products/gemba/actions/gemba-<name>` → `repo: gemba-<name>`.
- **Pack leg** (one new matrix entry): `prefix: gemba`, `repo: gemba-skills`,
  `version-file: products/gemba/package.json`, `sync-agents: "false"`.
- **kata-setup placeholders:** `{{KATA_AGENT_REF}}` stays.
  `{{FIT_BOOTSTRAP_REF}}`, `{{FIT_HARNESS_REF}}`, `{{FIT_WIKI_REF}}` become
  `{{GEMBA_BOOTSTRAP_REF}}`, `{{GEMBA_HARNESS_REF}}`, `{{GEMBA_WIKI_REF}}`.
- **Install command:** `apm install forwardimpact/gemba-skills`.

## Key decisions

| Decision | Choice | Rejected alternative and why |
| -------- | ------ | ---------------------------- |
| Sibling transition | Rename the repos in place | Create new repos and archive the old ones. That severs every existing SHA pin and tag, splits history across two repos, and doubles the org list. |
| Lineage after the prefix move | One sanctioned re-seed per renamed sibling | Keep the old prefix paths to preserve lineage. That breaks the home-mirrors-sibling rule (MONOREPO.md) and leaves the action homes unrenamed, which the spec requires. |
| Pack version source | The Gemba product package version | Keep Gear's version. It stamps platform skills with another product's version; jidoka-skills already versions by its product package. |
| Pack contents | Skills only, agents off | Sync agents into the pack. No gemba agent profiles exist; kata-skills stays the agents carrier. |
| Placeholder tokens | `{{GEMBA_*_REF}}` | Keep `{{FIT_*_REF}}`. The token names lie about the repos they resolve. |
| Enum propagation | Edit the md-table source, reseed the fences with the invariant tooling | Hand-edit each fence. The enumeration-drift invariant owns the fences; hand edits drift. |
| Old-name guard | Absence sweep excluding immutable records | Repo-wide rewrite including `specs/**` and changelogs. That rewrites history records. |

## Rollout sequence

1. **Operator, before merge.** Rename the four sibling repos on GitHub. Create
   `forwardimpact/gemba-skills` empty. Verify the publishing App's
   installation covers all five repos.
2. **Merge.** The combined monorepo change lands on `main`: homes renamed,
   matrices repointed, skills and docs updated, fences reseeded.
3. **Operator, after merge.** Re-seed each renamed action prefix once with the
   same pinned split binary and a force push to the renamed sibling's `main`.
   Pre-rename tags keep the old commits reachable, so existing SHA pins
   resolve before, during, and after.
4. **Steady state.** Push-triggered publishes run non-force. The first
   `publish-skills.yml` run seeds `gemba-skills` and tags it. The next release
   cut moves each renamed sibling's `v1` and version tags onto the new
   lineage. Dependabot then carries new-lineage SHAs to consumers.

Between steps 2 and 3, a `main` push can trigger action publishes that fail as
non-fast-forward on the renamed legs. The failure is visible, scoped to those
legs (`fail-fast: false`), and harmless: consumers keep resolving the pinned
old-lineage SHAs. Step 3 clears it.

## Clean break

This design removes:

- The four bare-name entries and path filters in the action publish matrix.
- The `fit gemba` two-prefix pack leg and its repeated-prefix bootstrap note.
- The `{{FIT_*_REF}}` placeholder tokens.
- The "Gemba — `fit-skills`" mapping and every authored
  `forwardimpact/{benchmark,bootstrap,harness,wiki}` reference.

The sibling repos are renamed, not duplicated. The redirects that keep old
pins resolving are GitHub-native. This design adds no shim it must maintain.
