---
title: Audit and Auto-Fix the Wiki
description: Keep the wiki valid against a declarative rule catalogue, auto-fix what is safely fixable, and surface the rest for a human — so stale memory never poisons coordination.
---

A wiki that drifts out of shape stops being reliable memory. A summary grows
past its budget, an entry heading loses its date, an active claim outlives the
work it described. `fit-wiki` ships a declarative audit that catches these
mechanically, and an auto-fixer that resolves most of them without you reading a
single file.

This guide covers checking the wiki against the rule catalogue, reading what the
audit reports, and running the auto-fixer that rotates over-budget logs, repairs
prose with an agent, and flags what only a human should touch. For the broader
memory workflow this fits into, see
[Set Up Persistent Memory and Metrics](/docs/libraries/predictable-team/).

## Prerequisites

- Node.js 22+
- A wiki already initialized in your project (run `npx fit-wiki init` if not)

## Running the audit

The audit reads every file in the wiki and checks it against a fixed catalogue
of rules — line and word budgets, required headings and markers, decision
blocks, storyboard structure, claims-table shape, and metric-row uniqueness.

```sh
npx fit-wiki audit
```

When everything conforms, the audit prints a single line and exits zero:

```
wiki audit passed
```

When a file breaks a rule, each finding is reported under the file it belongs
to, one row per finding:

```
wiki/improvement-coach-2026-W23.md
  3  error  Entry heading '## 6/07 Staff procedural lock' does not match the dated grammar  weekly-log.heading-grammar
            → weekly-log entry headings must be '## YYYY-MM-DD'

✖ 1 problem (1 error, 0 warnings)
```

Each row carries four columns: the line number, the severity, the message, and
the rule id. The arrow line beneath it is the hint — the concrete remediation.
The trailer counts the problems found.

Two severities exist:

| Severity  | Meaning                                                        | Exit code effect          |
| --------- | ------------------------------------------------------------- | ------------------------- |
| `error`   | A contract violation. Must be fixed.                          | The command exits `1`.    |
| `warning` | A soft signal, such as an expired claim.                      | Does not fail the command. |

Every finding has a stable rule id (`weekly-log.heading-grammar`,
`summary.line-budget`, `expired-claim`, ...). The same audit gates pre-merge CI,
so a clean local run is the bar a change has to clear.

### JSON output

For tooling and agents, request structured output:

```sh
npx fit-wiki audit --format json
```

```json
{
  "result": "fail",
  "failures": [
    {
      "id": "weekly-log.heading-grammar",
      "level": "fail",
      "path": "wiki/improvement-coach-2026-W23.md",
      "lineNo": 3,
      "message": "Entry heading '## 6/07 Staff procedural lock' does not match the dated grammar",
      "hint": null
    }
  ],
  "warnings": []
}
```

`result` is `pass` or `fail`. Each finding carries its rule `id`, a `level`
(`fail` or `warn`), the `path`, a `lineNo` when the rule pins one (`null`
otherwise), the `message`, and an optional `hint` (`null` when the rule offers
none). `failures` carries the errors; `warnings` carries the soft signals. A
clean wiki returns `"result": "pass"` with both arrays empty.

## Auto-fixing findings

Most findings are safely fixable without judgment. The `fix` command runs the
audit, resolves what it can, re-audits, and repeats until the wiki is clean or
only human-judgment findings remain.

```sh
npx fit-wiki fix
```

```
fixed: wiki audit is clean
```

`fix` resolves findings in two layers, then flags the rest:

| Layer        | Handles                                                      | How                                                                 |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Deterministic | Over-budget weekly logs and sealed parts                    | Seals the log as a part and starts a fresh one; content-preserving. |
| Agent         | Prose-judgment findings (summary trims, section order, missing decision blocks) | A fast technical-writer agent edits the files, re-audited each round. |
| Flag          | Anything destructive or irreducible                         | Reported for a human; never touched.                                |

The deterministic layer runs first because it never rewrites history — it only
seals an overflowing log into a numbered part and opens a fresh one. The agent
layer then handles the residual prose findings, and the audit — not the agent's
self-report — is the verdict each round.

### What gets flagged for a human

Some findings are deliberately never auto-fixed, because the safe action depends
on judgment that a tool cannot supply. When `fix` cannot reach a clean state it
exits non-zero and names them:

```
fit-wiki fix: 1 finding(s) need human judgment (not auto-fixable):
wiki/old-agent-2026-W20.md
    error  wiki/old-agent-2026-W20.md matches no wiki filename grammar class  admission.not-in-grammar
```

Two common cases:

- **A filename outside the grammar.** Renaming or deleting a file could destroy
  memory, so `fix` reports it and leaves it in place. Rename it to an admitted
  class by hand.
- **A lone over-budget block with no split seam.** When a single dated entry or
  `### ` block alone exceeds the budget, there is no seam to rotate at — shorten
  the prose yourself.

Run `fix`, then run `audit` again to confirm the wiki is clean before you push.

## Verify

1. **A clean wiki passes.** After `fix`, the audit reports no problems.

   ```sh
   npx fit-wiki audit
   ```

   Expected: `wiki audit passed` and exit code 0.

2. **JSON confirms the pass.** Structured output agrees.

   ```sh
   npx fit-wiki audit --format json
   ```

   Expected: `"result": "pass"` with empty `failures` and `warnings`.

3. **Fix is idempotent.** Running it on a clean wiki changes nothing.

   ```sh
   npx fit-wiki fix
   ```

   Expected: `nothing to fix`.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../wiki-operations -->
<!-- part:card:../collision-ledger -->

</div>
