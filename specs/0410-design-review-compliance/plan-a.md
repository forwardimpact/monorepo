# Plan A — Design Review Compliance

## Approach

Six categories of design-rule violations span five packages and one
infrastructure script. The violations are independent — fixing map exports does
not depend on fixing pathway console.log — so the plan decomposes into five
parts that can execute in parallel after a shared prerequisite (the layout
checker fix).

**Strategy:** Fix the infrastructure gate first so `bun run check` can serve as
a reliable verification step for every subsequent part. Then address each
package's violations in a self-contained part.

### Violation-to-part mapping

| #   | Violation category            | Part   | Packages affected         |
| --- | ----------------------------- | ------ | ------------------------- |
| 6   | Layout checker false-positive | 01     | scripts/                  |
| 2   | Export contract violations    | 02, 03 | map (02), pathway (03)    |
| 5   | Hardcoded credential          | 02     | map                       |
| 1   | console.log bypasses logger   | 03, 04 | pathway, basecamp, libdoc |
| 4   | OO+DI violation               | 03     | pathway                   |
| 3   | Dependency misclassification  | 05     | summit                    |

Pathway's dead exports (violation #2) are fixed in Part 03 alongside its other
violations since the fix is two lines in the same file.

## Parts

| Part               | Scope                                              | Files | Depends on |
| ------------------ | -------------------------------------------------- | ----- | ---------- |
| [01](plan-a-01.md) | Layout checker: ignore `generated/`                | 1     | —          |
| [02](plan-a-02.md) | Map: export compliance + credential removal        | 14    | 01         |
| [03](plan-a-03.md) | Pathway: logger migration, dead exports, singleton | 18    | 01         |
| [04](plan-a-04.md) | Basecamp + libdoc: logger migration                | 7     | 01         |
| [05](plan-a-05.md) | Summit: optional dependency reclassification       | 6     | 01         |

## Cross-cutting concerns

- **Logger import pattern.** Every `console.log` replacement follows the same
  rule: operational messages (progress, status, errors) become `logger.info()`;
  data output (formatted entities, JSON) becomes `process.stdout.write()`. This
  keeps stdout clean for pipelines.
- **Dependency additions.** Packages gaining `createLogger` calls need
  `@forwardimpact/libtelemetry` in their `dependencies`. Pathway and basecamp
  need this added; libdoc already has it.
- **No new abstractions.** Each part makes targeted, mechanical changes. No
  helpers, wrappers, or shared utilities are introduced.

## Execution

Part 01 is a prerequisite — execute it first and verify `bun run check` passes
after `just codegen`.

Parts 02–05 are independent and can run as **concurrent sub-agents** once Part
01 lands. All four parts are code and infrastructure changes, so route each to
`staff-engineer`.

```
Part 01 (sequential prerequisite)
  └─> Part 02 (map)        ─┐
  └─> Part 03 (pathway)     ├─ concurrent
  └─> Part 04 (basecamp+doc)├─
  └─> Part 05 (summit)     ─┘
```

After all parts complete: run `bun run check && bun run test` on the merged
result to confirm success criteria 1–8 from the spec.
