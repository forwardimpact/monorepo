---
name: update-docs
description:
  "Review and update documentation in the docs/ folder. Use when ensuring
  documentation accurately reflects the current codebase."
---

# Update Documentation

Review and update documentation in the `docs/` folder to ensure it accurately
reflects the current codebase.

## When to Use

- After making code changes that affect documented features
- During periodic documentation audits
- When adding new features that need documentation
- When removing features that are still documented

## Process

1. **Understand the documentation structure**
   - Read `docs/index.md` to see the documentation hierarchy
   - Review each document in `docs/` subdirectories (model/, pathway/, schema/)
   - Check `git log --oneline -20` for hints about recent changes—but use this
     only as a starting point, not a substitute for studying the code

2. **Audit against the current codebase**
   - For each document, examine the actual code it describes
   - Check `apps/schema/src/` for data structures and validation
   - Check `apps/model/src/` for derivation logic
   - Check `apps/pathway/` for CLI commands, templates, and formatters
   - Run CLI commands mentioned in docs to verify accuracy

3. **Verify diagrams**
   - Mermaid diagrams must reflect actual data flow and relationships
   - Compare entity diagrams against actual YAML structures in
     `apps/schema/examples/`
   - Compare derivation flowcharts against code in `apps/model/src/`
   - Update or add diagrams where they clarify concepts

4. **Verify code samples**
   - All code samples must be runnable or valid
   - YAML examples should match actual schema structure
   - CLI examples should produce the shown output
   - Update samples that have drifted from implementation

5. **Check for gaps**
   - New features in code that lack documentation
   - Documented features that no longer exist
   - Cross-references that point to moved or deleted content

## Key Files to Cross-Reference

| Document Topic    | Source of Truth                      |
| ----------------- | ------------------------------------ |
| Skills & Levels   | `apps/schema/examples/capabilities/` |
| Behaviours        | `apps/schema/examples/behaviours/`   |
| Disciplines       | `apps/schema/examples/disciplines/`  |
| Tracks            | `apps/schema/examples/tracks/`       |
| Grades            | `apps/schema/examples/grades.yaml`   |
| Stages            | `apps/schema/examples/stages.yaml`   |
| Job Derivation    | `apps/model/src/job.js`              |
| Agent Derivation  | `apps/model/src/agent.js`            |
| CLI Commands      | `apps/pathway/bin/fit-pathway.js`    |
| Templates         | `apps/pathway/templates/`            |
| Instruction files | `.github/instructions/`              |

## CLI Verification

**Always use `--data=apps/schema/examples`** to ensure documentation reflects
the canonical example dataset, not any arbitrary dataset in the root `data/`
folder.

```sh
# List available entities
npx fit-pathway skill --data=apps/schema/examples --list
npx fit-pathway discipline --data=apps/schema/examples --list
npx fit-pathway track --data=apps/schema/examples --list
npx fit-pathway grade --data=apps/schema/examples --list

# Generate sample outputs to compare with docs
npx fit-pathway job software_engineering L3 --data=apps/schema/examples
npx fit-pathway agent software_engineering --data=apps/schema/examples --track=platform
```

## Commit

After making updates, commit with:

```
docs: update [topic] documentation
```

Use separate commits for distinct documentation areas.
