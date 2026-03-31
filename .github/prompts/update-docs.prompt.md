# Update Documentation

Review and update documentation in the `website/` folder to ensure it accurately
reflects the current codebase.

## Process

1. **Understand the documentation structure**
   - Read `website/docs/index.md` to see the documentation hierarchy
   - Review each document in `website/docs/` subdirectories (model/, pathway/,
     schema/)
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
   - Compare entity diagrams against actual YAML structures in `data/pathway/`
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
| Skills & Levels    | `data/pathway/capabilities/`          |
| Behaviours         | `data/pathway/behaviours/`            |
| Disciplines        | `data/pathway/disciplines/`           |
| Tracks             | `data/pathway/tracks/`                |
| Levels             | `data/pathway/levels.yaml`            |
| Stages             | `data/pathway/stages.yaml`            |
| Job Derivation     | `libraries/libpathway/src/job.js`     |
| Agent Derivation   | `libraries/libpathway/src/agent.js`   |
| CLI Commands       | `products/pathway/bin/fit-pathway.js` |
| Templates          | `products/pathway/templates/`         |
| Agent instructions | `CLAUDE.md`                           |

## CLI Verification

**Always use `--data=data/pathway`** to ensure documentation reflects the
canonical dataset.

```sh
# List available entities
bunx fit-pathway skill --data=data/pathway --list
bunx fit-pathway discipline --data=data/pathway --list
bunx fit-pathway track --data=data/pathway --list
bunx fit-pathway level --data=data/pathway --list

# Generate sample outputs to compare with docs
bunx fit-pathway job software_engineering L3 --data=data/pathway
bunx fit-pathway agent software_engineering --data=data/pathway --track=platform
```

## Commit

After making updates, commit with:

```
docs: update [topic] documentation
```

Use separate commits for distinct documentation areas.
