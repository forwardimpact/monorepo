---
name: update-docs
description: Review and update documentation in the docs/ folder. Use when ensuring documentation accurately reflects the current codebase.
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
   - Review each document in `docs/` subdirectories (model/, pathway/, map/)
   - Check `git log --oneline -20` for hints about recent changes—but use this
     only as a starting point, not a substitute for studying the code

2. **Audit against the current codebase**
   - For each document, examine the actual code it describes
   - Check `products/map/src/` for data structures and validation
   - Check `libraries/libpathway/src/` for derivation logic
   - Check `products/pathway/` for CLI commands, templates, and formatters
   - Run CLI commands mentioned in docs to verify accuracy

3. **Verify diagrams**
   - Mermaid diagrams must reflect actual data flow and relationships
   - Compare entity diagrams against actual YAML structures in
     `products/map/examples/`
   - Compare derivation flowcharts against code in `libraries/libpathway/src/`
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

| Document Topic     | Source of Truth                       |
| ------------------ | ------------------------------------- |
| Skills & Levels    | `products/map/examples/capabilities/` |
| Behaviours         | `products/map/examples/behaviours/`   |
| Disciplines        | `products/map/examples/disciplines/`  |
| Tracks             | `products/map/examples/tracks/`       |
| Levels             | `products/map/examples/levels.yaml`   |
| Stages             | `products/map/examples/stages.yaml`   |
| Job Derivation     | `libraries/libpathway/src/job.js`     |
| Agent Derivation   | `libraries/libpathway/src/agent.js`   |
| CLI Commands       | `products/pathway/bin/fit-pathway.js` |
| Templates          | `products/pathway/templates/`         |
| Agent instructions | `AGENTS.md`                           |

## CLI Verification

**Always use `--data=products/map/examples`** to ensure documentation reflects
the canonical example dataset, not any arbitrary dataset in the root `data/`
folder.

```sh
# List available entities
npx fit-pathway skill --data=products/map/examples --list
npx fit-pathway discipline --data=products/map/examples --list
npx fit-pathway track --data=products/map/examples --list
npx fit-pathway level --data=products/map/examples --list

# Generate sample outputs to compare with docs
npx fit-pathway job software_engineering L3 --data=products/map/examples
npx fit-pathway agent software_engineering --data=products/map/examples --track=platform
```

## Commit

After making updates, commit with:

```
docs: update [topic] documentation
```

Use separate commits for distinct documentation areas.
