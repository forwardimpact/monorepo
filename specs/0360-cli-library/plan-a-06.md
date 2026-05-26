# 360 Part 06 — Update documentation referencing CLI output

Review and update all documentation files that show CLI command examples, sample
output, or reference CLI syntax. After parts 02–05, help text, error formats,
and basecamp's command syntax have all changed — docs must match reality.

**Depends on:** Parts 02–05 (CLI migrations and basecamp refactor must be
complete so the implementer can verify against actual output).

## Scope

Three categories of changes:

1. **Basecamp syntax** — Every reference to `--daemon`, `--wake`, `--init`,
   `--update`, `--stop`, `--validate`, `--status` as commands converts to
   positional subcommands (`daemon`, `wake`, `init`, etc.). See the mapping
   table in [plan-a-05.md § Command mapping reference](plan-a-05.md).

2. **CLI help samples** — Any documentation showing help text output should
   reflect the new libcli format (one-line-per-command,
   `name version — description` header, aligned columns).

3. **Error format samples** — Any documentation showing error messages should
   use the new `cli-name: error: message` format.

## Files to update

### Tier 1: External-facing (users see these)

| File                                               | Changes needed                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `website/docs/reference/cli/index.md`              | **Primary CLI reference.** Update basecamp section (lines 200–206) from flag syntax to positional. Verify all CLI command examples match new help output format. Update any option tables if flag names changed.                                                                             |
| `website/docs/getting-started/engineers/index.md`  | Update basecamp commands (lines 200, 206, 212): `--init` → `init`, `--status` → `status`, `--daemon` → `daemon`.                                                                                                                                                                             |
| `website/docs/getting-started/leadership/index.md` | Check for any basecamp or CLI output samples. Update if present.                                                                                                                                                                                                                             |
| `website/docs/guides/knowledge-systems/index.md`   | Heavy basecamp usage (lines 17–18, 28, 115, 126–130). Convert all `--daemon`, `--init`, `--status` flags to positional subcommands. **Pre-existing error:** lines 18 and 129 reference `--task` which does not exist in the current CLI (should be `wake`). Fix to `fit-basecamp wake <id>`. |
| `website/basecamp/index.md`                        | Quick start section (lines 85–86): `--init` → `init`, `--daemon` → `daemon`.                                                                                                                                                                                                                 |
| `website/index.md`                                 | Landing page (lines 190–191): `--init` → `init`, `--daemon` → `daemon`.                                                                                                                                                                                                                      |
| `website/pathway/index.md`                         | Check command examples match new help format.                                                                                                                                                                                                                                                |
| `website/map/index.md`                             | Check command examples match new help format.                                                                                                                                                                                                                                                |

### Tier 2: Skill files (agents read these)

| File                                   | Changes needed                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.claude/skills/fit-basecamp/SKILL.md` | Lines 74–78, 84–85, 117, 145, 150–151: all basecamp commands from flag to positional syntax. Update the architecture diagram line showing `fit-basecamp --daemon`. |
| `.claude/skills/fit-guide/SKILL.md`    | Check for any basecamp references in service setup examples.                                                                                                       |
| `.claude/skills/fit-map/SKILL.md`      | Check CLI examples match new format.                                                                                                                               |
| `.claude/skills/fit-pathway/SKILL.md`  | Check CLI examples match new format.                                                                                                                               |
| `.claude/skills/fit-universe/SKILL.md` | Check CLI examples match new format.                                                                                                                               |

### Tier 3: Internal docs (contributors read these)

| File                                         | Changes needed                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `website/docs/internals/operations/index.md` | Lines 124–125: `--init` → `init`, `--daemon` → `daemon`.                                        |
| `website/docs/internals/basecamp/index.md`   | Line 73: `fit-basecamp --daemon` → `fit-basecamp daemon` in architecture diagram.               |
| `website/docs/internals/pathway/index.md`    | Check formatter documentation is consistent with libcli migration (formatters moved to libcli). |
| `website/docs/internals/universe/index.md`   | Check fit-universe command examples.                                                            |
| `website/docs/internals/codegen/index.md`    | Check fit-codegen command examples.                                                             |
| `CLAUDE.md`                                  | Updated in part 04 (structure + skill groups). Verify no stale CLI output samples remain.       |

### Tier 4: Specs (historical — update only if referenced as current)

| File                                    | Changes needed                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `specs/0020-scheduling-agents/plan-a.md` | 5 references to old flag syntax. Historical spec.                                                 |
| `specs/0030-guide-infra/spec.v2.md`      | Line 577: `--init` → `init`. Historical spec — update only if it's referenced as a current guide. |
| `specs/0170-docs-ia/plan-a.md`           | Line 263: `--init` → `init`. Same consideration.                                                  |

**Note:** Specs in tier 4 are historical documents. If they describe what was
true at the time they were written, leave them as-is. Only update if they're
referenced as current documentation (e.g., linked from an active guide).

## Steps

### 1. Basecamp syntax — mechanical find-and-replace

For every file in tiers 1–3, apply the command mapping:

| Search                    | Replace                 |
| ------------------------- | ----------------------- |
| `fit-basecamp --daemon`   | `fit-basecamp daemon`   |
| `fit-basecamp --wake`     | `fit-basecamp wake`     |
| `fit-basecamp --init`     | `fit-basecamp init`     |
| `fit-basecamp --update`   | `fit-basecamp update`   |
| `fit-basecamp --stop`     | `fit-basecamp stop`     |
| `fit-basecamp --validate` | `fit-basecamp validate` |
| `fit-basecamp --status`   | `fit-basecamp status`   |

`--help` stays as `--help` (it's still a flag, not a command).

Also update any surrounding descriptions that say "pass the `--daemon` flag" or
similar — rewrite to "use the `daemon` command".

### 2. CLI help output samples

Run each migrated CLI with `--help` and compare the actual output against any
documentation that shows help text. Key files to check:

- `website/docs/reference/cli/index.md` — the primary CLI reference. Verify
  every command listing matches the actual `--help` output.
- Product overview pages (`website/pathway/index.md`, `website/map/index.md`,
  `website/basecamp/index.md`) — verify quick-start examples.

If a docs page shows a full help text block, replace it with the actual output
from the migrated CLI. If it shows individual command examples, verify they
match the new format.

### 3. Error format samples

Search for any documentation showing error message examples. Update to the new
`cli-name: error: message` format. The spec's own examples (in `spec.md`) are
the canonical reference — they should already be correct.

### 4. Verify no stale references remain

Run a final sweep:

```sh
# Should return zero results in non-spec docs after step 1
grep -r 'fit-basecamp --daemon\|fit-basecamp --wake\|fit-basecamp --init' \
  website/ .claude/skills/ --include='*.md' | grep -v specs/0360

# Check for any remaining raw console.error patterns in docs
grep -r 'console\.error' website/ --include='*.md'
```

## Verification

```sh
bun run check  # format and lint pass

# Build docs to verify no broken links
bunx fit-doc build
```

Manually spot-check:

- `website/docs/reference/cli/index.md` — basecamp section uses positional
  subcommands
- `website/docs/getting-started/engineers/index.md` — basecamp quick start uses
  positional syntax
- `.claude/skills/fit-basecamp/SKILL.md` — all commands use positional syntax
- `website/docs/internals/operations/index.md` — internal commands use
  positional syntax
