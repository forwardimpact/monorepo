# Plan A Part 01 — Rename skill directories and update CLAUDE.md

Part 1 of 4 of [plan-a](plan-a.md) for [spec 400](spec.md).

Renames five `.claude/skills/libs-*` directories so the filesystem reflects
the six task-named groups from spec 400 Move 1, and updates
`CLAUDE.md § Skill Groups` to match. **This part does not touch any SKILL.md
content** — file bodies are rewritten in Part 02.

## Scope

- Rename five skill directories via `git mv`.
- Update `CLAUDE.md § Skill Groups` with the new group names, membership, and
  the orphan libraries added in spec 400 Move 1.
- Leave SKILL.md file contents unchanged — Part 02 owns frontmatter and body
  rewrites.
- Leave `libs-synthetic-data/` and `libskill/` directories in place — only
  their CLAUDE.md § Skill Groups entries change (to add `libuniverse`).

## Files touched

### Renamed directories (five)

| From                                            | To                                      |
| ----------------------------------------------- | --------------------------------------- |
| `.claude/skills/libs-service-infrastructure/`   | `.claude/skills/libs-grpc-services/`    |
| `.claude/skills/libs-data-persistence/`         | `.claude/skills/libs-storage/`          |
| `.claude/skills/libs-llm-orchestration/`        | `.claude/skills/libs-llm-and-agents/`   |
| `.claude/skills/libs-web-presentation/`         | `.claude/skills/libs-content/`          |
| `.claude/skills/libs-system-utilities/`         | `.claude/skills/libs-cli-and-tooling/`  |

Each rename moves exactly one file: `SKILL.md`.

Unchanged: `.claude/skills/libs-synthetic-data/`,
`.claude/skills/libskill/`.

### Modified file (one)

- `CLAUDE.md` — rewrite § Skill Groups (lines 259–276).

## Ordering

1. **Rename the five directories.** One `git mv` per directory:

   ```sh
   git mv .claude/skills/libs-service-infrastructure .claude/skills/libs-grpc-services
   git mv .claude/skills/libs-data-persistence       .claude/skills/libs-storage
   git mv .claude/skills/libs-llm-orchestration      .claude/skills/libs-llm-and-agents
   git mv .claude/skills/libs-web-presentation       .claude/skills/libs-content
   git mv .claude/skills/libs-system-utilities       .claude/skills/libs-cli-and-tooling
   ```

2. **Update `CLAUDE.md § Skill Groups`.** Replace lines 259–276 with the new
   section (see § CLAUDE.md rewrite below). Preserve the existing heading
   (`## Skill Groups`), the intro sentence, and the closing `libskill` note.

3. **Verify.** Run `ls .claude/skills/libs-*` and spot-check that exactly six
   directories exist with the new names. Run `grep -n 'libs-' CLAUDE.md` and
   confirm only the new names appear. Grep for the five old names
   repo-wide (see § Verification) and confirm there are no remaining
   references outside the Part 01 diff.

## CLAUDE.md rewrite

Replace the existing § Skill Groups block (`CLAUDE.md:259–276`) with the
following. The intro sentence and the `libskill` closing note are unchanged;
only the bulleted list changes.

```markdown
## Skill Groups

Library skills are organized into capability groups with corresponding skill
files in [.claude/skills/](.claude/skills/):

- **`libs-grpc-services`** — librpc, libconfig, libtelemetry, libtype,
  libharness
- **`libs-storage`** — libstorage, libindex, libresource, libpolicy, libgraph,
  libvector
- **`libs-llm-and-agents`** — libllm, libmemory, libprompt, libagent, libtool
- **`libs-content`** — libui, libformat, libweb, libdoc, libtemplate
- **`libs-cli-and-tooling`** — libcli, librepl, libutil, libsecret, libsupervise,
  librc, libcodegen, libeval
- **`libs-synthetic-data`** — libsyntheticgen, libsyntheticprose,
  libsyntheticrender, libuniverse

`libskill` retains its own skill (pure-function design, exempt from OO+DI).
```

**Diff points to flag:**

- Group names all change except `libs-synthetic-data`.
- `libtool` moves from `libs-llm-and-agents` (already listed in the old block
  under `libs-llm-orchestration`).
- `libcli`, `librepl` move from `libs-web-presentation` (already listed in the
  old block) into `libs-cli-and-tooling`.
- `libeval` was already listed under `libs-system-utilities`; it stays but in
  the renamed group `libs-cli-and-tooling`.
- `libuniverse` is added to the `libs-synthetic-data` line (was absent from
  CLAUDE.md previously, despite being in `libraries/`).

## Verification

Run at the package root after the renames and the CLAUDE.md edit:

1. **Filesystem shape check.**

   ```sh
   ls -1d .claude/skills/libs-* .claude/skills/libskill
   ```

   Expected output (exactly seven entries, new names only):

   ```
   .claude/skills/libs-cli-and-tooling
   .claude/skills/libs-content
   .claude/skills/libs-grpc-services
   .claude/skills/libs-llm-and-agents
   .claude/skills/libs-storage
   .claude/skills/libs-synthetic-data
   .claude/skills/libskill
   ```

2. **No dangling references to old names anywhere in the repo.**

   ```sh
   rg -n 'libs-service-infrastructure|libs-data-persistence|libs-llm-orchestration|libs-web-presentation|libs-system-utilities'
   ```

   Expected: zero hits. If any hit is inside `.claude/skills/libs-*/SKILL.md`
   body text (e.g., the old group name mentioned inside the file), leave it
   for Part 02 — Part 02 rewrites those sections and will catch them. Any hit
   outside that tree is a Part 01 blocker and must be fixed before committing.

3. **CLAUDE.md structure check.**

   ```sh
   grep -n '^- \*\*`libs-' CLAUDE.md
   ```

   Expected: six lines with the six new group names, in the order listed in
   the CLAUDE.md rewrite block above.

4. **`bun run check` passes.** No format/lint/layout/exports drift.

5. **Git history survives the rename.**

   ```sh
   git log --follow -- .claude/skills/libs-grpc-services/SKILL.md | head -5
   ```

   Expected: commits predating the rename (from when the file lived at
   `libs-service-infrastructure/SKILL.md`). Repeat for the other four renamed
   directories. If `--follow` fails, `git mv` was not used — revert and redo.

## Risks

1. **`git mv` into a directory vs into a file.** Using
   `git mv old new` where `new` already exists moves `old` **into** `new`.
   The destinations in the rename table do not exist yet, so this is safe,
   but check with `ls .claude/skills/libs-grpc-services 2>/dev/null` before
   running `git mv` if there's any doubt.

2. **Leftover references in website docs.** `website/docs/internals/` may
   reference skill group names in prose. Step 2 of Verification catches this;
   if anything hits, update the prose in the same commit so the rename is
   atomic.

3. **Commit message noise.** `git mv` of a directory with one file produces a
   clean rename diff, but if the working tree has any untracked file inside
   the old directory, `git mv` will fail. Ensure the tree is clean
   (`git status` shows only the Part 01 changes) before running the moves.

## Commit

One commit for all five renames plus the CLAUDE.md update:

```
docs(skills): rename libs-* groups to task-named (spec 400 part 1/4)

- libs-service-infrastructure → libs-grpc-services
- libs-data-persistence       → libs-storage
- libs-llm-orchestration      → libs-llm-and-agents
- libs-web-presentation       → libs-content
- libs-system-utilities       → libs-cli-and-tooling

Update CLAUDE.md § Skill Groups to match the six task-named groups and add
libuniverse to libs-synthetic-data membership. SKILL.md content rewrites
follow in part 2.
```

— Staff Engineer 🛠️
