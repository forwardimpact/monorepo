# Part 2 — Consumer migration

Migrates all 28 `createCli()` call sites (27 in `bin/` files + 1 in
`products/basecamp/src/basecamp.js`) from `options` → `globalOptions`, scoping
command-specific options into their command entries where applicable. Depends on
Part 1 (core library changes).

## Migration categories

Each consumer falls into one of three categories:

### Category A — No commands, options only → rename `options` to `globalOptions`

These CLIs have no `commands` array. The only change is renaming the top-level
`options` key to `globalOptions`.

| #   | File                                                 | CLI name              |
| --- | ---------------------------------------------------- | --------------------- |
| 1   | `libraries/libagent/bin/fit-process-agents.js`       | fit-process-agents    |
| 2   | `libraries/libcodegen/bin/fit-codegen.js`            | fit-codegen           |
| 3   | `libraries/libgraph/bin/fit-process-graphs.js`       | fit-process-graphs    |
| 4   | `libraries/libgraph/bin/fit-query.js`                | fit-query             |
| 5   | `libraries/libgraph/bin/fit-subjects.js`             | fit-subjects          |
| 6   | `libraries/libllm/bin/fit-completion.js`             | fit-completion        |
| 7   | `libraries/libmemory/bin/fit-window.js`              | fit-window            |
| 8   | `libraries/libresource/bin/fit-process-resources.js` | fit-process-resources |
| 9   | `libraries/librpc/bin/fit-unary.js`                  | fit-unary             |
| 10  | `libraries/libsupervise/bin/fit-svscan.js`           | fit-svscan            |
| 11  | `libraries/libsupervise/bin/fit-logger.js`           | fit-logger            |
| 12  | `libraries/libtool/bin/fit-process-tools.js`         | fit-process-tools     |
| 13  | `libraries/libuniverse/bin/fit-universe.js`          | fit-universe          |
| 14  | `libraries/libutil/bin/fit-download-bundle.js`       | fit-download-bundle   |
| 15  | `libraries/libutil/bin/fit-tiktoken.js`              | fit-tiktoken          |
| 16  | `libraries/libvector/bin/fit-process-vectors.js`     | fit-process-vectors   |
| 17  | `libraries/libvector/bin/fit-search.js`              | fit-search            |
| 18  | `libraries/libtelemetry/bin/fit-visualize.js`        | fit-visualize         |

**Change per file:** `options: {` → `globalOptions: {`

### Category B — Has commands, all options stay global → rename only

These CLIs have commands but none of their options are command-specific. The
only change is renaming `options` → `globalOptions`.

| #   | File                                | CLI name     |
| --- | ----------------------------------- | ------------ |
| 19  | `products/basecamp/src/basecamp.js` | fit-basecamp |
| 20  | `products/guide/bin/fit-guide.js`   | fit-guide    |
| 21  | `libraries/librc/bin/fit-rc.js`     | fit-rc       |

### Category C — Has commands with options to scope

These CLIs have options that should be scoped to specific commands. Requires
moving options from the top-level `options` into command entries and adding
per-command `examples` where useful.

| #   | File                                      | CLI name     | Notes                         |
| --- | ----------------------------------------- | ------------ | ----------------------------- |
| 22  | `products/summit/bin/fit-summit.js`       | fit-summit   | Primary motivating case       |
| 23  | `products/pathway/bin/fit-pathway.js`     | fit-pathway  | Most options to scope         |
| 24  | `products/landmark/bin/fit-landmark.js`   | fit-landmark | Multi-word commands           |
| 25  | `products/map/bin/fit-map.js`             | fit-map      | Some command-specific options |
| 26  | `libraries/libeval/bin/fit-eval.js`       | fit-eval     | Supervisor-specific options   |
| 27  | `libraries/libdoc/bin/fit-doc.js`         | fit-doc      | serve-specific options        |
| 28  | `libraries/libstorage/bin/fit-storage.js` | fit-storage  | wait-specific options         |

## Detailed migration: Category C consumers

### 22. fit-summit (`products/summit/bin/fit-summit.js`)

**Global options** (apply to all commands):

- `roster`, `data`, `format`, `help`, `version`

**Move to `what-if` command:**

- `add`, `remove`, `move`, `to`, `promote`, `focus`, `allocation`

**Move to `coverage` command:**

- `evidenced`, `lookback-months`

**Move to `risks` command:**

- `evidenced`, `lookback-months`

**Move to `growth` command:**

- `evidenced`, `lookback-months`, `outcomes`

**Move to `trajectory` command:**

- `quarters`

**Move to `compare` command:**

- `left-project`, `right-project`

**Shared across some commands:** `evidenced`, `lookback-months`, `project`,
`audience`. These options apply to multiple commands (coverage, risks, growth)
but not all. Two approaches:

1. **Duplicate** the option definition into each command that uses it.
2. **Keep global** — simpler, slightly looser validation.

**Decision:** Duplicate into each command. The spec's goal is that global help
does not show `--add` (which only applies to what-if). Options like
`--evidenced` that apply to 3 of 8 commands are similarly confusing in global
help. The small duplication cost is worth the clarity.

`project` → move to: `coverage`, `risks`, `growth`, `what-if`, `trajectory`
`audience` → move to: `coverage`, `risks`, `growth`, `compare`, `what-if`

Add per-command `examples` to at least `coverage`, `what-if`, and `trajectory`.

### 23. fit-pathway (`products/pathway/bin/fit-pathway.js`)

**Global options** (apply across most commands):

- `list`, `json`, `data`, `format`, `help`, `version`

**Move to specific commands:**

- `track`, `level` → `job`, `interview`, `progress`, `agent`, `questions`
- `type` → `interview`
- `compare` → `progress`
- `output` → `build`, `job`
- `stage`, `checklist`, `all-stages` → `stage`
- `maturity` → `behaviour`
- `skill` → `skill`, `questions`
- `behaviour` → `behaviour`, `questions`
- `capability` → `questions`, `job`
- `port` → `dev`
- `path` → `build`
- `url` → `update`
- `role` → `questions`
- `stats` → `skill`, `discipline`
- `agent` → `agent`
- `skills` → `agent`
- `tools` → `agent`
- `clean` → `build`

### 24. fit-landmark (`products/landmark/bin/fit-landmark.js`)

**Global options:** `data`, `format`, `help`, `version`

**Move to specific commands:**

- `manager` → `org team`, `snapshot show`, `snapshot trend`, `snapshot compare`,
  `practice`, `health`, `initiative list`, `initiative impact`, `practiced`,
  `voice`
- `email` → `evidence`, `readiness`, `timeline`, `coverage`, `voice`
- `skill` → `evidence`, `practice`, `marker`, `timeline`
- `level` → `marker`
- `target` → `readiness`
- `snapshot` → `snapshot show`, `snapshot compare`
- `item` → `snapshot trend`
- `id` → `initiative show`

### 25. fit-map (`products/map/bin/fit-map.js`)

**Global options:** `data`, `help`, `version`, `json`

**Move to specific commands:**

- `output` → `export`, `generate-index`
- `url` → `getdx`
- `base-url` → `generate-index`
- `shacl` → `validate`

### 26. fit-eval (`libraries/libeval/bin/fit-eval.js`)

**Global options:** `format`, `help`, `version`, `json`

**Move to specific commands:**

- `task-file`, `task-text`, `task-amend`, `model`, `max-turns`, `output`, `cwd`,
  `agent-profile`, `allowed-tools` → `run`
- `supervisor-cwd`, `supervisor-profile`, `supervisor-allowed-tools`,
  `agent-cwd` → `supervise` (plus the `run` options that also apply)

### 27. fit-doc (`libraries/libdoc/bin/fit-doc.js`)

**Global options:** `src`, `out`, `help`, `version`, `json`

**Move to specific commands:**

- `port`, `watch` → `serve`
- `base-url` → `build`

### 28. fit-storage (`libraries/libstorage/bin/fit-storage.js`)

**Global options:** `help`, `version`, `json`

**Move to specific commands:**

- `prefix` → `upload`, `download`, `list` (not used by `create-bucket` or `wait`
  — same duplication principle as summit's `--evidenced`)
- `timeout` → `wait`

## Migration of test files

One consumer test file constructs a `Cli` with `options:` in its definition and
must migrate to `globalOptions:`:

- `products/basecamp/test/basecamp-cli.test.js` (lines 55–59: `help`, `version`,
  `json` — all global, so this is a straight rename)

No other consumer test files import `Cli` or `HelpRenderer` from libcli.
(Verified via grep — only libcli's own tests and this file construct Cli
instances.)

## Ordering and verification

1. **Category A (18 files):** Mechanical rename. After migrating all 18, run:

   ```sh
   just check
   ```

2. **Category B (3 files):** Mechanical rename. Run:

   ```sh
   just check
   ```

3. **Category C (7 files):** Migrate one at a time. For each:
   - Read the current file
   - Determine which options belong to which commands (use the mapping above)
   - Move options into command entries
   - Add per-command `examples` where the spec specifies them
   - Verify the command's args string no longer embeds option hints (e.g.,
     `what-if`'s current `args: "<team> [--add/--remove/--move/--promote]"`
     should become `args: "<team>"` since options are now self-documenting)
   - Run the product/library tests

4. **Final verification:**

   ```sh
   just check
   ```

5. **Wrapping verification (success criterion 7):** After all consumers are
   migrated, run each Category C CLI with `--help` and each of its commands with
   `<command> --help`. Confirm no output line exceeds 80 columns. If any
   description is too long, shorten it — the description is the only variable
   the consumer controls.

## Note on `--json` in `globalOptions`

The `parse()` method checks `values.json` to decide between text and JSON help.
For this to work, every consumer that supports `--help --json` must include
`json` in its `globalOptions`. Most consumers already have it. If a consumer
omits `json` from `globalOptions` and a user passes `--help --json`, Node's
`parseArgs` will throw `ERR_PARSE_ARGS_UNKNOWN_OPTION`. This is acceptable for
CLIs that intentionally don't support JSON help — the error is clear.

## File change summary

| Files                | Count   | Action                                   |
| -------------------- | ------- | ---------------------------------------- |
| Category A bin files | 18      | `options:` → `globalOptions:`            |
| Category B bin files | 3       | `options:` → `globalOptions:`            |
| Category C bin files | 7       | Restructure: split options into commands |
| Test files           | 1+      | Update definitions                       |
| **Total**            | **28+** |                                          |

## Risks

- **Pathway is the largest migration** — 27 options to redistribute across 16
  commands. Test thoroughly: `cd products/pathway && bun test`.
- **Landmark multi-word commands** — options like `--manager` appear in many
  commands. Verify each command entry includes all the options its handler
  actually reads from `values`.
- **fit-eval has overlapping option sets** — `run` and `supervise` share many
  options. Duplicate definitions into both command entries.
