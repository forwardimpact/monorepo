---
title: Audit and Auto-Fix the Wiki
description: Keep the wiki valid against a declarative rule catalogue. Auto-fix what is safely fixable. Surface the rest for a human, so stale memory never poisons coordination.
---

A wiki that drifts out of shape is no longer reliable memory. A summary grows
past its budget. An entry heading loses its date. An active claim outlives the
work it described. `gemba-wiki` ships a declarative audit that catches these
mechanically. It also ships an auto-fixer that resolves most of them. You do
not read a single file.

This guide shows how to check the wiki against the rule catalogue. It shows how
to read what the audit reports. It also shows how to run the auto-fixer. The
auto-fixer rotates over-budget logs, repairs prose with an agent, and flags
what only a human should touch. See
[Set Up Persistent Memory and Metrics](/docs/libraries/predictable-team/) for
the broader memory workflow this fits into.

## Prerequisites

- Node.js 22+
- A wiki already initialized in your project (run `npx gemba-wiki init` if not)

## Run the audit

The audit reads every file in the wiki. It checks each file against a fixed
catalogue of rules. The catalogue covers line and word budgets, required
headings and markers, decision blocks, storyboard structure, claims-table
shape, and metric-row uniqueness.

```sh
npx gemba-wiki audit
```

When everything conforms, the audit prints a single line and exits zero:

```text
wiki audit passed
```

When a file breaks a rule, the audit reports each finding under the file it
belongs to. It prints one row per finding:

```text
wiki/improvement-coach-2026-W23.md
  3  error  Entry heading '## 6/07 Staff procedural lock' does not match the dated grammar  weekly-log.heading-grammar
            → weekly-log entry headings must be '## YYYY-MM-DD'

✖ 1 problem (1 error, 0 warnings)
```

Each row carries four columns: the line number, the severity, the message, and
the rule id. The arrow line beneath it is the hint. The hint gives the concrete
remediation. The trailer counts the problems found.

Two severities exist:

| Severity  | Meaning                                                        | Exit code effect          |
| --------- | ------------------------------------------------------------- | ------------------------- |
| `error`   | A contract violation. You must fix it.                        | The command exits `1`.    |
| `warning` | A soft signal, such as an expired claim.                      | Does not fail the command. |

Every finding has a stable rule id (`weekly-log.heading-grammar`,
`summary.line-budget`, `expired-claim`, ...). The same audit gates pre-merge CI,
so a clean local run is the bar a change has to clear.

### JSON output

For tools and agents, request structured output:

```sh
npx gemba-wiki audit --format json
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

`result` is `pass` or `fail`. Each finding carries its rule `id` and a `level`
(`fail` or `warn`). It also carries the `path`, a `lineNo`, the `message`, and
an optional `hint`. `lineNo` is `null` when the rule pins no line. `hint` is
`null` when the rule offers none. `failures` carries the errors. `warnings`
carries the soft signals. A clean wiki returns `"result": "pass"` with both
arrays empty.

## Auto-fix findings

Most findings are safely fixable without judgment. The `fix` command runs the
audit and resolves what it can. It then re-audits. It repeats until the wiki is
clean, or until only human-judgment findings remain.

```sh
npx gemba-wiki fix
```

```text
fixed: wiki audit is clean
```

`fix` resolves findings in two layers, then flags the rest:

| Layer        | Handles                                                      | How                                                                 |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Deterministic | Over-budget weekly logs and sealed parts                    | Seals the log as a part and starts a fresh one. Preserves the content. |
| Agent         | Prose-judgment findings (summary trims, section order, missing decision blocks) | A fast technical-writer agent edits the files. The audit runs again each round. |
| Flag          | Anything destructive or irreducible                         | Reported for a human. Never touched.                                |

The deterministic layer runs first because it never rewrites history. It only
seals an over-budget log into a numbered part and opens a fresh one. The
agent layer then handles the residual prose findings. The audit gives the
verdict each round. The agent's self-report does not.

### What gets flagged for a human

`fix` deliberately never auto-fixes some findings. The safe action depends on
judgment that a tool cannot supply. When `fix` cannot reach a clean state, it
exits non-zero and names them:

```text
gemba-wiki fix: 1 finding(s) need human judgment (not auto-fixable):
wiki/old-agent-2026-W20.md
    error  wiki/old-agent-2026-W20.md matches no class in the wiki filename grammar  admission.not-in-grammar
```

Two common cases:

- **A filename outside the grammar.** If you rename or delete a file, you could
  destroy memory. For that reason, `fix` reports it and leaves it in place.
  Rename it to an admitted class by hand.
- **A lone over-budget block with no split seam.** When a single dated entry or
  `###` block alone exceeds the budget, there is no seam to rotate at. Shorten
  the prose yourself.

Run `fix`. Then run `audit` again to confirm the wiki is clean before you push.

## Verify

1. **A clean wiki passes.** After `fix`, the audit reports no problems.

   ```sh
   npx gemba-wiki audit
   ```

   Expected: `wiki audit passed` and exit code 0.

2. **JSON confirms the pass.** Structured output agrees.

   ```sh
   npx gemba-wiki audit --format json
   ```

   Expected: `"result": "pass"` with empty `failures` and `warnings`.

3. **Fix is idempotent.** A run on a clean wiki changes nothing.

   ```sh
   npx gemba-wiki fix
   ```

   Expected: `nothing to fix`.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../wiki-operations -->
<!-- part:card:../collision-ledger -->

</div>
