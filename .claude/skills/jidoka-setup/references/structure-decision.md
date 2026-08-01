# Jobs structure decision

The jobs layer (L2) has two shapes. The choice is structural. It follows how
the repository is packaged. It does not follow taste.

## Decision

| Signal | Structure |
| --- | --- |
| One `package.json` at the root, or no per-package manifests | Single static `JTBD.md` |
| Many packages, each with its own `package.json` | Generated `.jobs` blocks |
| Unsure | Single static `JTBD.md` (fewer moving parts) |

A repository can start static and migrate later. The other direction folds
generated blocks back into a static file. It is rarely worth it.

## Single static JTBD.md

Author Big Hire entries directly in `JTBD.md`. Nothing generates them. The file
is the source of truth. `jidoka jtbd` validates entry structure but has
nothing to regenerate.

This shape is best for a repository that ships as one unit: a single library,
one service, or a monolith.

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

`jidoka jtbd --fix` reads every package's `jobs` and validates them against
the JTBD schema. It then regenerates the marker-delimited catalog and job
blocks in the directory READMEs and the root `JTBD.md`. Run it whenever a
manifest's `jobs` change. CI fails if a generated block is stale.

This shape is best for a repository that is genuinely many packages with
distinct personas.

## Either way

Entry quality is the same problem in both shapes. Distinguish the Big Hire from
the Little Hire. Make every trigger a moment. A role is not a trigger. Name the
hires that compete, and include nonconsumption.
Author entries with [jidoka-jtbd](../../jidoka-jtbd/SKILL.md).
