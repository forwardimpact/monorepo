# Spec 2290: Repository Settings File for Kata Skills

**Classification:** internal. Every changed surface lands under `.claude/`
(skills and agent references), `KATA.md`, and `.jidoka/invariants/`. Nothing
lands under `products/` or `services/`, so the shared rubric's decision test
classifies the change internal (spec 2210 applied the same test to the same
surfaces). The motivation is still the product's consumers: the settings file
is the interface a Kata installation configures.

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
  source are fixed in the skill. The comment gate, the re-ping rule, the
  gate's comment templates, and the approval-signals reference restate the
  same fixed count.
- **Review rigor.** The review caller protocol fixes each panel at three
  reviewers (five for the implementation technical panel). The review skill
  and every phase skill restate the fixed blocker/high/medium severity floor.

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
   identifier, its meaning, and one marked default. Other surfaces point at
   the owning table and restate no values.
2. **The settings file selects.** The file is one flat JSON object. Each key
   holds an identifier from the owning table, an integer, or a list of
   strings. No nesting, no key whose meaning depends on another object.
3. **The agent is the loader.** The skill text instructs the read. No runtime
   library, harness hook, or environment variable participates. One shared
   home defines the read mechanic once: file location, absence semantics, and
   misconfiguration semantics.
4. **Defaults equal current behavior.** Every marked default reproduces the
   value the skills enforce today. An absent file, an absent key, and an agent
   that never reads the file all produce today's behavior.
5. **Explicit misconfiguration fails safe.** A present file that does not
   parse, or a known key with a value outside its vocabulary, degrades by
   consumer class. Non-gate skills select the marked default and report the
   problem on their coordination surface. The merge gate fails closed: it
   blocks trust-gated merges with a named block reason until the file is
   fixed. An unreadable explicit trust configuration must never widen the
   trusted set back to the default ranking. An unknown key has no effect and
   is reported the same way.
6. **Phase-1 vocabulary: trust and review rigor.** Trust source (contributor
   ranking or explicit allowlist), trusted-contributor count, and allowlist.
   Review panel profile and blocking severity floor.
7. **Security boundary.** The merge gate reads the settings from the default
   branch, never from a PR head. A diff that touches `.kata/` is a
   trust-policy change: whatever the PR's type or phase, it merges only on a
   trusted human's explicit signal on that change, pinned to the approved
   head, per the existing approval-signal classes. No agent-originated
   approval qualifies. This extends the human-only rule that already covers
   spec and design approvals.
8. **Validation.** A repository invariant holds the machine-readable copy of
   the key vocabulary. It stops the line when the settings file carries an
   unknown key or an out-of-vocabulary value, and when a skill's options table
   disagrees with that vocabulary. The invariant is this repository's CI
   gate; consumer installations rely on the degradation rules in item 5.

**Compatibility stance:** clean break. The hard-coded trust, panel-size, and
severity-floor literals become the marked default rows of the options tables.
Every other surface that restates them becomes a pointer. No dual mechanism
remains. An absent file selecting the defaults is specified behavior, not a
compatibility shim. Old-path removal (the fixed literals outside the tables)
is a success criterion.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| `kata-release-merge` skill | Trust policy becomes an options table (source, count, allowlist). The gate resolves the trusted set through the selected option, reads settings from the default branch, fails closed on unreadable trust configuration, and gates `.kata/` diffs on an explicit human signal. |
| `kata-release-merge` references (comment gate, re-ping rule, templates) | Restated trust-count literals become pointers to the trust table. Comment templates name the configured trust source instead of a fixed count. |
| Approval-signals agent reference | Its trust-gate sentence points at the merge gate's configured trust source instead of restating a fixed count. The dispatch-side trust check inherits the configured source through the same pointer. |
| `kata-review` caller protocol | Panel composition becomes a profile table (light / standard / thorough). The blocking severity floor becomes a keyed option. The panel-rationale reference explains the profiles instead of restating fixed sizes. |
| `kata-review` skill | The severity vocabulary's caller obligation points at the configured floor instead of restating blocker/high/medium. |
| `kata-spec`, `kata-design`, `kata-plan`, `kata-implement` | Both severity-floor restatements in each skill (exit checklist and panel step) point at the caller protocol's configured floor. |
| Shared settings reference | Single home for the read mechanic: file location, absence and misconfiguration semantics, the defaults-equal-current-behavior principle, and a pointer to the gate-side rules. Ships with the pack like the other agent references. |
| Repository invariant | Holds the machine-readable key vocabulary, validates `.kata/settings.json` when present, and checks each options table against the vocabulary. |
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

| #  | Claim | Verification |
| -- | ----- | ------------ |
| 1  | Trust policy is selectable. | The merge-gate skill defines a trust options table where `trustSource` selects `top-contributors` (default) or `allowlist`, with companion keys `trustContributorCount` (default 7) and `trustAllowlist` (default empty). |
| 2  | Review rigor is selectable. | The caller protocol defines panel profiles `light`, `standard` (default), and `thorough` keyed by `reviewPanel`, and a severity floor keyed by `reviewBlockingSeverity` with default `medium`. |
| 3  | Defaults reproduce current behavior. | The default rows carry seven contributors, the current panel sizes (spec: product 3 + technical 3; design and plan: technical 3 + devex 3; implementation: technical 5 + devex 3), and the medium floor. |
| 4  | The read mechanic has one home. | `rg -n '\.kata/settings' .claude/agents .claude/skills` matches the mechanic's rules only in the shared reference; every other match is a one-line pointer, an options table in an owning skill, or a gate rule in the merge-gate skill. |
| 5  | The gate treats settings as trust-sensitive. | The merge-gate skill carries the default-branch read rule, the fail-closed rule for unreadable trust configuration, and the human-signal-only rule for `.kata/` diffs as checklist items. |
| 6  | The invariant stops the line. | The invariant's test fixtures cover an unknown key, an out-of-vocabulary value, and a table-to-vocabulary mismatch (`bun run test`), and `bun run invariants` fails on each. |
| 7  | No fixed trust literal survives outside a table. | `rg -n 'top.?7\|top seven' .claude/skills .claude/agents` matches only the trust table's default row and its rationale. |
| 8  | No fixed rigor literal survives outside a table. | `rg -n 'blocker, high, and medium' .claude/skills` matches only the caller protocol's floor vocabulary and default row. |
| 9  | Setup and orientation name the file. | `rg -l '\.kata/settings' .claude/skills/kata-setup KATA.md` matches both. |
| 10 | Published skills stay generic. | `bun run invariants` (skill-genericity rules) passes on every edited skill. |
| 11 | Repository checks stay green. | `bun run check` and `bun run test` pass. |
