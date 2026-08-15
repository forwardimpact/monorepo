# Plan 2290-a: Kata Settings File

First and default plan for spec 2290. It executes
[design-a.md](design-a.md) with no variations. Read the
[spec](spec.md) and [design](design-a.md) for WHAT/WHY and WHICH/WHERE.

## Approach

Land the mechanism from the homes outward. Steps 1–2 create the three new
homes: the shared read-mechanic reference, the trust options reference, and
the rigor options reference. Steps 3–5 rewire every consumer surface into a
pointer and delete the fixed literals in the same edit. Steps 6–7 add the
invariant and its tests. Step 8 adds setup and orientation text. Step 9 runs
the full verification sweep. All steps land in one implementation PR. After
each instruction-text edit, re-measure layer budgets with the repository's
instruction check (`jidoka instructions`), because two touched files sit near
their caps (§ Risks).

Libraries used: libinvariant (`runRuleModules`), libmock
(`createTestRuntime`), both test-only.

## Steps

### Step 1: Shared settings reference (read mechanic)

Create the single home for the read mechanic and the `<setting>` block
grammar.

- Created: `.claude/agents/x-kata-settings.md`

Content, in order (design-a § Read mechanic and § Options-block format own
the normative rules):

1. **The file.** `.kata/settings.json` at the repository root. One flat JSON
   object. Each key holds an identifier from its owning options table, an
   integer, or a string list. The file is optional.
2. **The loader.** The agent reads the file at skill invocation because the
   skill text says to. No runtime library, harness hook, or environment
   variable participates.
3. **Absence.** Absent file, absent key: select the marked default. Defaults
   equal current behavior.
4. **Misconfiguration.** Unreadable file, or a known key with an
   out-of-vocabulary or out-of-range value: a non-gate skill selects the
   marked default and reports the problem on its coordination surface (a PR
   comment when the run owns one, the session output otherwise). The merge
   gate fails closed. Point at the `kata-release-merge` skill for the
   gate-side rules. Do not restate them.
5. **Unknown key.** No effect. Report it like an unreadable value.
6. **`<setting>` grammar.** The block format from design-a
   § Options-block format: opening tag with exactly `key` and `default` on
   one line within 74 characters, one table with exactly one `(default)`
   mark for selector keys, prose body for parameter keys, the default
   literal only in the attribute. Show one example inside a fenced code
   block. Fencing matters: the settings invariant (Step 6) skips fenced
   text.
7. **Discovery and owning tables.** `rg '<setting '` enumerates every knob.
   Trust keys: `kata-release-merge` `references/settings.md`. Rigor keys:
   `kata-review` `references/settings.md`.

Constraints: no agent frontmatter (the `x-` prefix marks a reference). L4
caps: 192 lines, 1280 words. Pack-generic wording throughout.

Verification: `bun run invariants` passes (agent-naming, skill-genericity)
and `bunx jidoka instructions` passes.

### Step 2: Trust options table and gate rules

Create the trust options table and move the merge gate onto it.

- Created: `.claude/skills/kata-release-merge/references/settings.md`
- Modified: `.claude/skills/kata-release-merge/SKILL.md`

**The reference** holds three `<setting>` blocks. Copy the `trustSource` and
`trustContributorCount` blocks verbatim from design-a § Options-block
format. Add the third:

```markdown
<setting key="trustAllowlist" default="[]">

String list of tracker logins. Applies under `trustSource: allowlist`;
ignored otherwise. An empty list trusts no human. The CI app identity stays
trusted under every source.

</setting>
```

Open the reference with two sentences: these keys select the merge gate's
trust policy, and the read mechanic lives in the shared reference
(`../../../agents/x-kata-settings.md`).

**SKILL.md** changes:

- Replace the DO-CONFIRM checklist with exactly these nine items (the L7 cap
  is 9 items, 32 words each; the current nine items merge to six to admit
  the three new rules):
  1. Author trusted: CI app identity, or the trusted set resolved from the
     configured trust source (`references/settings.md`).
  2. Settings read from the default branch, never from a PR head or a
     worktree that contains PR content.
  3. On unreadable trust configuration, fail closed: block trust-gated
     merges with reason `settings unreadable`. Never widen back to the
     default ranking.
  4. A diff that touches `.kata/` merges only on a trusted human's explicit
     signal pinned to the current head. No agent approval qualifies.
  5. PR type parsed from the title prefix, and the classification label
     (`product` / `internal`) present.
  6. All CI checks pass, after mechanical fixes if needed.
  7. The `wiki/STATUS.md` row shows the classified phase at `approved`, or
     `implemented` for the terminal plan row. For phase PRs, a signal of the
     required class covers the head.
  8. For implementation PRs, the parent spec's `plan-a.md` exists on `main`.
  9. No unresolved trusted-human concern in the PR thread. Self-heal the
     coordinating-issue link when it is missing.
- Rewrite Step 2 (Verify Contributor Trust). Keep the
  `app/kata-agent-team` trusted-by-definition sentence. Then: resolve the
  trusted set from the configured trust source
  (`references/settings.md`); read the settings from the default branch
  (`git show origin/<default-branch>:.kata/settings.json`); under
  `top-contributors`, keep the existing `gh api` lookup with `.[0:7]`
  replaced by `.[0:<trustContributorCount>]`; under `allowlist`, the set is
  exactly `trustAllowlist`, and an empty list trusts no human. Close with
  the fail-closed rule: on a parse failure or an out-of-vocabulary trust
  value, block every trust-gated merge with reason `settings unreadable`,
  owned by a trusted human. Never fall back to the ranking.
- Add one paragraph to Step 6 (Approval Gate): a diff that touches `.kata/`
  is a trust-policy change. It merges only on a trusted human's explicit
  signal on that change, pinned to the approved head, per the existing
  approval-signal classes. No agent-originated approval qualifies, whatever
  the PR's type or phase.

Verification:
`rg -n 'top.?7|top seven' .claude/skills/kata-release-merge/SKILL.md` returns
nothing, and `bunx jidoka instructions` passes (bounded carve-out: 320 lines,
2304 words).

### Step 3: Trust pointer conversions

Convert every restated trust literal into a pointer to the trust table.

- Modified: `.claude/skills/kata-release-merge/references/comment-gate.md`,
  `.claude/skills/kata-release-merge/references/reping-rule.md`,
  `.claude/skills/kata-release-merge/references/templates.md`,
  `.claude/agents/x-approval-signals.md`

| File:line | Old | New |
| --- | --- | --- |
| comment-gate.md:11 | `each top-7 human contributor (kata-release-merge Step 2 lookup)` | `each trusted human contributor (kata-release-merge Step 2 resolution)` |
| reping-rule.md:64 | `A trusted human (top-7 contributor) who can review` | `A trusted human (configured trust source) who can review` |
| reping-rule.md:74 | `a role drawn from the Step 2 top-7 list` | `a role drawn from the Step 2 trusted set` |
| templates.md:13 | `Author `<login>` is not in the top 7 contributors.` | `Author `<login>` is not in the trusted set (trust source: `<trustSource>`).` |
| templates.md:65 | `author `<login>` not in the top 7 contributors` / `a trusted top-7 contributor` | `author `<login>` not in the trusted set (trust source: `<trustSource>`)` / `a trusted contributor per the configured trust source` |
| templates.md:91 | `Author not in top contributors` (example row) | `Author not in trusted set` |
| x-approval-signals.md:61 | `The release engineer's trust gate (top-7 contributor or `kata-agent-team`) is canonical.` | `The release engineer's trust gate (the configured trust source per the kata-release-merge settings reference, or the CI app identity) is canonical.` |

The `<trustSource>` placeholder fills from the gate's Step 2 read, like the
other template placeholders.

Verification: `rg -n 'top.?7|top seven' .claude/skills .claude/agents`
matches only the trust table's default row and its rationale.

### Step 4: Rigor options tables and caller protocol

Create the rigor options reference and point the caller protocol at it.

- Created: `.claude/skills/kata-review/references/settings.md`
- Modified: `.claude/skills/kata-review/references/caller-protocol.md`,
  `.claude/skills/kata-review/references/panel-rationale.md`

**The reference** holds two `<setting>` blocks, introduced by the same
two-sentence opener as Step 2's reference:

```markdown
<setting key="reviewPanel" default="standard">

| Profile | Spec panels | Design/plan panels | Implementation panels |
| --- | --- | --- | --- |
| `light` | product 1 + technical 1 | technical 1 + devex 1 | technical 1 + devex 1 |
| `standard` (default) | product 3 + technical 3 | technical 3 + devex 3 | technical 5 + devex 3 |
| `thorough` | product 5 + technical 5 | technical 5 + devex 5 | technical 5 + devex 5 |

</setting>

<setting key="reviewBlockingSeverity" default="medium">

| Option | Meaning |
| --- | --- |
| `blocker` | Address every confirmed consensus finding graded blocker. |
| `high` | Address blocker and high. |
| `medium` (default) | Address blocker, high, and medium. |
| `low` | Address every confirmed consensus finding. |

</setting>
```

The floor means: address every confirmed consensus finding at the floor
severity or above.

**caller-protocol.md** changes (this file has one word of headroom under its
768-word cap; the removals below fund the additions):

- § Panel Composition: keep the caller → artifact → panel → `subagent_type`
  mapping table. Delete the `Reviewers` column and the three fixed-size
  bullet lines at the top. Add: panel sizes come from the `reviewPanel`
  profile selected in `settings.md` (read mechanic:
  shared kata-settings reference); the consensus threshold stays ≥⌈N/2⌉ for
  any panel size.
- Merge step 4 (partition): replace `blocker/high/ medium` with "at or above
  the configured blocking severity floor (`reviewBlockingSeverity`)".
  Genericize the minority bullet to drop the N=3/N=5 literals.
- § How to Handle Findings: replace the `**blocker**/**high**/**medium**`
  sentence with the configured-floor phrasing. Replace "**Low** findings are
  optional" with "Findings below the floor are optional".

**panel-rationale.md**: rewrite § Why These Sizes as profile intent with no
size literals. `standard` reproduces the sizes the arc used before the
settings file. `light` serves solo maintainers and metered-token teams.
`thorough` serves risk-averse organizations. Implementation panels stay the
largest within every profile because code lands irreversibly on `main`.

Verification: `bunx jidoka instructions` passes; both files stay under
128 lines / 768 words.

### Step 5: Floor pointers in the review skill and phase skills

Point every severity-floor restatement at the configured floor.

- Modified: `.claude/skills/kata-review/SKILL.md`,
  `.claude/skills/kata-spec/SKILL.md`,
  `.claude/skills/kata-design/SKILL.md`,
  `.claude/skills/kata-plan/SKILL.md`,
  `.claude/skills/kata-implement/SKILL.md`

In `kata-review/SKILL.md` § Severity Vocabulary: drop the "Fix it before you
advance" sentences from the per-level definitions, so a level states meaning
only. Rewrite the caller-obligation paragraph: after verification, the
caller addresses every confirmed finding at or above the configured blocking
severity floor
([caller protocol](references/caller-protocol.md)); findings below the floor
are optional, and a dismissal is documented.

In each phase skill, edit both restatements to the same pointer sentence:
"Address every confirmed finding at or above the configured blocking
severity floor
([caller protocol](../kata-review/references/caller-protocol.md))."

| File | Checklist item | Panel step |
| --- | --- | --- |
| kata-spec/SKILL.md | lines 57–58 | line 171 |
| kata-design/SKILL.md | line 60 | line 171 |
| kata-plan/SKILL.md | line 53 | line 172 |
| kata-implement/SKILL.md | lines 62–63 | line 159 |

Verification: `rg -n 'blocker/high/medium|\*\*blocker\*\*' .claude/skills`
returns no floor restatement outside `kata-review/references/`, and
`rg -n 'blocker, high, and medium' .claude/skills` matches only the
`reviewBlockingSeverity` table's default row.

### Step 6: Settings invariant

Add the invariant that holds the machine vocabulary and stops the line.

- Created: `.jidoka/invariants/kata-settings.rules.mjs`

Export the vocabulary as a named export so the tests import it:

```js
export const VOCABULARY = {
  trustSource: {
    kind: "select",
    options: ["top-contributors", "allowlist"],
    default: "top-contributors",
  },
  trustContributorCount: { kind: "integer", min: 1, default: 7 },
  trustAllowlist: { kind: "string-list", default: [] },
  reviewPanel: {
    kind: "select",
    options: ["light", "standard", "thorough"],
    default: "standard",
  },
  reviewBlockingSeverity: {
    kind: "select",
    options: ["blocker", "high", "medium", "low"],
    default: "medium",
  },
};
```

`build({ scan, readText })` produces two subject groups. Use no `grep`, so
the module (and its tests) need no ripgrep subprocess:

- `settings-file`: one subject from `readText(".kata/settings.json")` when
  the file exists: raw text, parsed object or a parse-error marker, and one
  derived subject per key.
- `setting-block`: scan `.claude/skills` and `.claude/agents` for `*.md`,
  strip fenced code (reuse the `stripFences` approach from
  `skill-template.rules.mjs`), and extract every `<setting …>` block with
  its opening-tag attributes, body table rows, and line numbers.

Rules, one concern each:

| Rule id | Fires when |
| --- | --- |
| `kata-settings.file-invalid` | `.kata/settings.json` present but not valid JSON, or not one flat object of identifiers, integers, and string lists |
| `kata-settings.unknown-key` | a settings key is absent from `VOCABULARY` |
| `kata-settings.invalid-value` | a select key holds an out-of-vocabulary identifier; an integer key holds a non-integer or a value under `min`; a list key holds a non-string-list |
| `kata-settings.block-grammar` | an opening tag spans lines, carries attributes other than exactly `key` and `default`, or has no paired closing tag |
| `kata-settings.block-key-drift` | the set of block keys differs from the vocabulary keys (missing, extra, or duplicate blocks), via a `ctx` cross-subject map |
| `kata-settings.default-drift` | a block's `default` attribute differs from the vocabulary default |
| `kata-settings.table-drift` | a selector block's option column differs from the vocabulary options, or the `(default)` marks differ from exactly one, or the marked row differs from the `default` attribute |

Verification: `bun run invariants` passes on the live repository.

### Step 7: Invariant tests

Prove each failure mode fires through the same engine `jidoka invariants`
runs.

- Created: `tests/kata-settings-invariant.test.js`

Import the module and `runRuleModules` from `@forwardimpact/libinvariant`.
Build scratch repositories with a local `withRepo` helper (mirror
`libraries/libinvariant/test/helpers.js`) and a real-fs runtime
(`createTestRuntime` from `@forwardimpact/libmock` with `node:fs`
functions). Each case writes a minimal tree (`.kata/settings.json` plus one
reference file carrying `<setting>` blocks), runs
`runRuleModules([mod], { root, runtime, dir })`, and asserts the finding
ids:

| Case | Expected findings |
| --- | --- |
| Clean: valid file, blocks that match `VOCABULARY` | none |
| Unknown key in the settings file | `kata-settings.unknown-key` |
| Out-of-vocabulary value (`trustSource: "ranking"`) | `kata-settings.invalid-value` |
| `trustContributorCount: 0` and `trustAllowlist: "alice"` | `kata-settings.invalid-value` (two findings) |
| Unparseable settings file | `kata-settings.file-invalid` |
| Selector table option column ≠ vocabulary | `kata-settings.table-drift` |
| Zero or two `(default)` marks, or mark ≠ attribute | `kata-settings.table-drift` |
| Block `default` attribute ≠ vocabulary default | `kata-settings.default-drift` |
| Missing and duplicate blocks | `kata-settings.block-key-drift` |
| Live repository run | none |

Verification: `bun run test` passes, including the new file.

### Step 8: Setup output and KATA.md orientation

Name the file where installations and readers meet it.

- Modified: `.claude/skills/kata-setup/SKILL.md`, `KATA.md`

kata-setup Step 5 (Report) gains one bullet: an optional
`.kata/settings.json` selects trust policy and review rigor; the options
tables live in the `kata-release-merge` and `kata-review` settings
references, and the read mechanic in the shared kata-settings agent
reference.

KATA.md § Trust Boundary: replace "Top-7 contributors pass the trust gate."
with "The trust gate resolves its trusted set from the configured trust
source. The default is the top-7 contributor ranking." Then add one
orientation paragraph: the optional `.kata/settings.json` file selects among
policy options the skills define (phase 1: trust source and review rigor);
each vocabulary lives in the owning skill's settings reference; an absent
file selects the marked defaults, which reproduce current behavior.

Verification: `rg -l '\.kata/settings' .claude/skills/kata-setup KATA.md`
matches both files.

### Step 9: Verification sweep

Run every spec success-criteria check and the full quality gate.

- Modified: none

```sh
rg -n '\.kata/settings' .claude/agents .claude/skills   # criterion 4
rg -n 'top.?7|top seven' .claude/skills .claude/agents  # criterion 7
rg -n 'blocker, high, and medium' .claude/skills        # criterion 8
rg -l '\.kata/settings' .claude/skills/kata-setup KATA.md  # criterion 9
bun run check                                            # criteria 5, 6, 10, 11
bun run test                                             # criteria 6, 11
```

Confirm criterion 4 by reading the matches: the mechanic's rules appear only
in `x-kata-settings.md`; every other match is a one-line pointer, an options
table, or a gate rule in the merge-gate skill.

Verification: every command returns the expected match set and every check
passes.

## Risks

- **caller-protocol.md sits one word under its 768-word cap.** The Step 4
  deletions (fixed sizes, N=3/N=5 literals) must land before or with the
  additions. Re-measure with `jidoka instructions` before commit. If the
  file still breaches, move the § How to Merge Findings examples into
  `panel-rationale.md` (242 words, ample headroom).
- **The merge-gate checklist caps at 9 items and 32 words per item.** The
  Step 2 merge of nine items into six is load-bearing. Do not re-split; a
  tenth item fails `jidoka instructions`.
- **Fence discipline in the shared reference.** The `<setting>` example in
  `x-kata-settings.md` must stay inside a fenced code block. An unfenced
  example registers as a real block and trips
  `kata-settings.block-key-drift`.
- **Genericity scan covers all new pack text.** `x-kata-settings.md` and
  both settings references fall under `skill-genericity.rules.mjs` globs.
  Avoid `bun`, `bunx`, `@forwardimpact/`, "the monorepo", and dated
  snapshots in them.

## Execution

Single unit, one implementation PR, no decomposition. The steps are small
and share context (the same files and the same vocabulary), so decomposition
buys no parallelism. Route to an engineering agent (`staff-engineer`) via
`kata-implement`. Execute steps 1–9 in order; Steps 6–7 and Step 8 are
independent of each other and may swap.
