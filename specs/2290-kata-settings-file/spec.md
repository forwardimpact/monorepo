# Spec 2290: Repository Settings File for Kata Skills

**Classification:** product-aligned — the change lands on Kata's published
skill distribution and the documentation of that surface.

**Persona and job:** Teams Using Agents → Run a Continuously Improving Agent
Team (Kata's Big Hire in JTBD.md). The Little Hire is the sharper fit: onboard
a Kata installation that runs the Plan-Do-Study-Act loop without per-team
prompt engineering.

## Problem

Kata skills hard-code installation policy in instruction text. Every
installation inherits one fixed governance posture, whatever its size, risk
tolerance, or token budget. Two policies carry the most cross-installation
variance:

- **Trust.** The merge gate trusts the CI app identity plus the top seven
  human contributors by the tracker's contributor ranking. The count and the
  source are fixed in the skill. The comment gate and the re-ping rule key off
  the same fixed list.
- **Review rigor.** The review caller protocol fixes each panel at three
  reviewers (five for the implementation technical panel). Every phase skill
  blocks on the fixed blocker/high/medium severity floor.

Installations differ on both:

| Installation | Wants | Gets today |
| ------------ | ----- | ---------- |
| Solo maintainer | An explicit allowlist of one trusted login | A contributor ranking that can elevate drive-by committers into the trust set |
| Small team on metered tokens | One reviewer per panel, blockers only | Twelve sub-agent reviewers per lockstep run, medium floor |
| Regulated organization | Five reviewers per panel, every finding addressed | Three per panel, low findings optional |

The only override channel today is prose. The release-cut skill defers to
CONTRIBUTING.md, which "may override the skill defaults". Prose overrides are
unstructured: nothing validates them, agents must interpret them, and
equivalent values drift apart. This monorepo shows the drift: the
audit-rotation revisit threshold is four runs in the security-audit skill, six
in the documentation skill, and "a few" in the devex-audit skill. Three values
express one concept.

The remaining escape is to edit the skill text locally. The skill packs sync
unchanged from upstream, so a local edit is overwritten on the next sync or
blocks the sync entirely. The JTBD entry names the anxiety this feeds:
autonomy might amplify bad patterns faster than humans can intervene. A team
that cannot tune the trust gate or the review rigor to its own risk tolerance
either forks the pack or fires the product.

## Proposal

A repository-owned settings file, `.kata/settings.json`, selects among policy
options that the skills themselves define.

1. **Options tables in the owning skill.** Each configurable policy appears in
   exactly one skill surface as a table of named options. Each row carries an
   identifier, its meaning, and one marked default.
2. **The settings file selects.** The file is one flat JSON object. Each key
   holds an identifier from the owning table, an integer, or a list of
   strings. No nesting, no key whose meaning depends on another object.
3. **The agent is the loader.** The skill text instructs the read. No runtime
   library, harness hook, or environment variable participates. A shared agent
   reference defines the read mechanic once: file location, absent-file and
   absent-key semantics, unparseable-file semantics.
4. **Defaults equal current behavior.** Every marked default reproduces the
   value the skills enforce today. A missing file, a missing key, an
   unreadable file, and an agent that never reads the file all produce
   today's behavior. Misconfiguration degrades to the known-safe posture.
5. **Phase-1 vocabulary: trust and review rigor.** Trust source
   (contributor ranking or explicit allowlist), trusted-contributor count, and
   allowlist. Review panel profile and blocking severity floor.
6. **Security boundary.** The merge gate reads the settings from the default
   branch, never from a PR head. A diff that touches `.kata/` gates at the
   strictest level, the same treatment agent-instruction paths receive.
7. **Validation.** A repository invariant stops the line when the settings
   file carries an unknown key or an out-of-vocabulary value, and when a
   skill's options table disagrees with the machine-readable vocabulary.

**Compatibility stance:** clean break. The hard-coded policy sentences become
the marked default rows of the options tables. No dual mechanism remains. An
absent file selecting the defaults is specified behavior, not a compatibility
shim. Old-path removal (the fixed literals outside the tables) is a success
criterion.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| `kata-release-merge` skill | Trust policy becomes an options table (source, count, allowlist). The gate resolves trust through the selected option, reads settings from the default branch, and classifies `.kata/` diffs as trust-sensitive. |
| Comment-gate and re-ping references | Verified to consume the gate's canonical trust list through pointers, with no restated values. |
| `kata-review` caller protocol | Panel composition becomes a profile table (light / standard / thorough). The blocking severity floor becomes a keyed option. |
| `kata-spec`, `kata-design`, `kata-plan`, `kata-implement` | Severity-floor sentences point at the caller protocol's configured floor instead of restating blocker/high/medium. |
| New shared agent reference | Single home for the settings read mechanic: location, absence semantics, unparseable-file semantics, defaults-equal-current-behavior principle. Ships with the pack like the other agent references. |
| Repository invariant | Validates the settings file and the table-to-vocabulary agreement. |
| `kata-setup` skill | Names the optional settings file and its owning tables in the setup output. |
| KATA.md | One orientation paragraph: the file exists, what it governs, where the vocabularies live. |

### Excluded

| Item | Why |
| ---- | --- |
| Approval and human-involvement levels per phase gate | A governance-model change with its own trust implications. It needs its own spec once this mechanism is proven. |
| Cadence, retention, naming, tooling, and template knobs | Future vocabulary growth on the same mechanism. Each key must earn its options table. |
| Workflow-generation values (crons, roster, models, timeouts) | GitHub evaluates them in workflow YAML. `kata-setup` owns them. |
| Runtime loader code (libraries, harness, env vars) | The mechanism is skill-text only. Skills must work standalone in any harness. |
| Per-caller numeric panel overrides | The profile table covers phase 1. Free numerics multiply untested combinations. |

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | Trust policy is selectable. | The merge-gate skill defines a trust options table with `top-contributors` (default) and `allowlist` rows, keyed by `trustSource`, `trustContributorCount`, and `trustAllowlist`. |
| 2 | Review rigor is selectable. | The caller protocol defines panel profiles `light`, `standard` (default), and `thorough` keyed by `reviewPanel`, and a severity floor keyed by `reviewBlockingSeverity` with default `medium`. |
| 3 | Defaults reproduce current behavior. | Each options table marks exactly one default row, and the default rows carry seven contributors, the 3/3/5+3 panel sizes, and the medium floor. |
| 4 | The read mechanic has one home. | `rg -l 'settings\.json' .claude/agents .claude/skills` shows the mechanic's rules in the shared reference only; consuming skills each carry a one-line pointer. |
| 5 | The gate reads settings from the default branch. | The merge-gate skill carries the default-branch read rule and the `.kata/` trust-sensitive classification as checklist items. |
| 6 | The invariant stops the line. | `bun run invariants` fails on a fixture with an unknown key, a fixture with an out-of-vocabulary value, and a table that disagrees with the vocabulary. |
| 7 | No fixed policy literal survives outside a table. | `rg -n 'top.?7|top seven' .claude/skills .claude/agents` matches only options-table default rows and their rationale references. |
| 8 | Published skills stay generic. | `bun run invariants` (skill-genericity rules) passes on every edited skill. |
| 9 | Repository checks stay green. | `bun run check` and `bun run test` pass. |
