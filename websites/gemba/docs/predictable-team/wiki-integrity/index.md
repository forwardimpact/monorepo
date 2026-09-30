---
title: Audit and Auto-Fix the Wiki
description: Keep the wiki valid against a declarative rule catalogue. Auto-fix what is safe to fix. Report the rest to a human, so that stale memory does not corrupt coordination.
---

A wiki that drifts out of shape is no longer reliable memory. A summary grows
past its budget, an entry heading loses its date, or an active claim outlives
the work it described. `gemba-wiki` ships a declarative audit that catches
these faults mechanically, and an auto-fixer that resolves most of them. You
do not have to read each file yourself.

This guide shows how to check the wiki against the rule catalogue, how to read
what the audit reports, and how to run the auto-fixer. The auto-fixer rotates
over-budget logs, repairs prose with an agent, and flags what only a human
should touch. See
[Set Up Persistent Memory and Metrics](/docs/predictable-team/) for the wider
memory workflow this belongs to.

## Prerequisites

- Node.js 22+
- A wiki already initialized in your project (run `npx gemba-wiki init` if not)

## Run the audit

The audit reads every file in the wiki and checks each file against a fixed
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
belongs to, with one row per finding:

```text
wiki/release-engineer-2026-W23.md
  3  error  Entry heading '## 6/07 Retry budget raised' does not match the dated grammar  weekly-log.heading-grammar
            → weekly-log entry headings must be '## YYYY-MM-DD'

✖ 1 problem (1 error, 0 warnings)
```

Each row has four columns: the line number, the severity, the message, and the
rule id. The arrow line under it is the hint, which gives the concrete fix.
The last line counts the problems found.

The filename grammar accepts one weekly-log class per agent in your own roster.
The examples on this page use the agent name `release-engineer`. Your roster
supplies your own names. [Kata](https://www.kata.team/) is the reference
tenant for this platform, and it names its files after its own agent roles.

Two severities exist:

| Severity  | Meaning                                  | Exit code effect           |
| --------- | ---------------------------------------- | -------------------------- |
| `error`   | A contract violation. You must fix it.   | The command exits `1`.     |
| `warning` | A soft signal, such as an expired claim. | Does not fail the command. |

Every finding has a stable rule id (`weekly-log.heading-grammar`,
`summary.line-budget`, `expired-claim`, ...). Run the same audit in your
pre-merge CI, so that a clean local run becomes the standard every change must
meet.

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
      "path": "wiki/release-engineer-2026-W23.md",
      "lineNo": 3,
      "message": "Entry heading '## 6/07 Retry budget raised' does not match the dated grammar",
      "hint": "weekly-log entry headings must be '## YYYY-MM-DD'. open entries with `gemba-wiki log decision/note`, which emit a heading that conforms and that the rotation seam-finder can split"
    }
  ],
  "warnings": []
}
```

`result` is `pass` or `fail`. Each finding has its rule `id`, a `level`
(`fail` or `warn`), the `path`, a `lineNo`, the `message`, and an optional
`hint`. `lineNo` is `null` when the rule pins no line, and `hint` is `null`
when the rule offers none. `failures` holds the errors and `warnings` holds
the soft signals. A clean wiki returns `"result": "pass"` with both arrays
empty.

## Auto-fix findings

Most findings are safe to fix without judgment. The `fix` command runs the
audit, resolves what it can, and then audits again. It repeats until the wiki
is clean, or until only findings that need human judgment remain.

```sh
npx gemba-wiki fix
```

```text
fixed: wiki audit is clean
```

`fix` resolves findings in two layers, then flags the rest:

| Layer         | Handles                                                                         | How                                                                          |
| ------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Deterministic | Over-budget weekly logs and sealed parts                                        | Seals the log as a part and starts a fresh one. Preserves the content.       |
| Agent         | Prose-judgment findings (summary trims, section order, missing decision blocks) | A `technical-writer` agent edits the files. The audit runs again each round.  |
| Flag          | Anything destructive or irreducible                                             | Reported for a human. Never touched.                                         |

The deterministic layer runs first because it never rewrites history. It only
seals an over-budget log into a numbered part and opens a fresh one. The agent
layer then handles the remaining prose findings. `gemba-wiki` composes the
`technical-writer` role for that work and runs the role on a fast model. Each
round ends with another audit. The audit result decides whether the fix is
done, and the agent's own report has no part in that decision.

### What gets flagged for a human

Some findings need judgment that a tool cannot supply, so `fix` never touches
them. When `fix` cannot reach a clean state, it exits non-zero and lists them:

```text
gemba-wiki fix: 1 finding(s) need human judgment (not auto-fixable):
wiki/retired-agent-2026-W20.md
    error  wiki/retired-agent-2026-W20.md matches no class in the wiki filename grammar  admission.not-in-grammar
```

Two common cases:

- **A filename outside the grammar.** A rename or a delete could destroy
  memory, so `fix` reports the file and leaves it in place. Rename it to an
  admitted class yourself.
- **A lone over-budget block with no split seam.** When a single dated entry or
  `###` block alone exceeds the budget, there is no seam to rotate at. Shorten
  the prose yourself.

Run `fix`, then run `audit` again to confirm that the wiki is clean before you
push.

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
<!-- part:card:../xmr-analysis -->

</div>
