# Jobs structure decision

The jobs layer (L2) has two shapes. The choice is structural — it follows how
the repository is packaged, not taste.

## Decision

| Signal | Structure |
| --- | --- |
| One `package.json` at the root, or no per-package manifests | Single static `JTBD.md` |
| Many packages, each with its own `package.json` | Generated `.jobs` blocks |
| Unsure | Single static `JTBD.md` (fewer moving parts) |

A repository can start static and migrate later. Going the other way — folding
generated blocks back into a static file — is rarely worth it.

## Single static JTBD.md

Author Big Hire entries directly in `JTBD.md`. Nothing generates them; the file
is the source of truth. `npx coaligned jtbd` validates entry structure but has
nothing to regenerate.

Best for a repository that ships as one unit: a single library, one service,
or a monolith.

## Generated .jobs blocks

Each package declares its jobs in `package.json`:

```json
{
  "jobs": [
    {
      "user": "<persona>",
      "goal": "<high-level progress sought>",
      "trigger": "<the specific moment that creates the job>",
      "bigHire": "<the adoption decision>.",
      "littleHire": "<the repeated daily use>.",
      "competesWith": "<what gets hired instead; include hire-nothing>"
    }
  ]
}
```

`npx coaligned jtbd --fix` reads every package's `jobs`, validates them against
the JTBD schema, and regenerates the marker-delimited catalog and job blocks in
the directory READMEs and the root `JTBD.md`. Run it whenever a manifest's
`jobs` change; CI fails if a generated block is stale.

Best for a repository that is genuinely many packages with distinct personas.

## Either way

Entry quality is the same problem in both shapes — Big Hire vs Little Hire,
trigger as a moment not a role, competing hires that include nonconsumption.
Author entries with [coaligned-jtbd](../../coaligned-jtbd/SKILL.md).
