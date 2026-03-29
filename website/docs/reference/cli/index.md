---
title: CLI Reference
description: Commands, arguments, and options for all Forward Impact CLI tools.
---

## fit-map

Data validation and index generation.

```sh
npx fit-map validate                    # Validate all data (JSON Schema + referential integrity)
npx fit-map validate --shacl            # Validate RDF/SHACL syntax
npx fit-map validate --data=PATH        # Validate a specific data directory
npx fit-map generate-index              # Generate _index.yaml files for browser loading
npx fit-map people import <file>        # Import people from CSV/YAML
npx fit-map people import <f> --data=P  # Import with custom data directory
```

| Option          | Description                     |
| --------------- | ------------------------------- |
| `--shacl`       | Include RDF/SHACL syntax checks |
| `--data=<path>` | Use a specific data directory   |

---

## fit-pathway

### Entity Browsing

All entity commands support three output modes:

| Mode    | Pattern                        | Description                 |
| ------- | ------------------------------ | --------------------------- |
| Summary | `npx fit-pathway <command>`    | Concise overview with stats |
| List    | `npx fit-pathway <cmd> --list` | IDs for piping              |
| Detail  | `npx fit-pathway <cmd> <id>`   | Full entity details         |

Entity commands: `discipline`, `level`, `track`, `behaviour`, `driver`, `stage`,
`skill`, `tool`.

**Global options** (apply to all fit-pathway commands):

| Option          | Description                  |
| --------------- | ---------------------------- |
| `--data=<path>` | Path to data directory       |
| `--json`        | Output as JSON               |
| `--list`        | Output IDs only (for piping) |
| `--version`     | Show version number          |
| `--help`        | Show help message            |

```sh
npx fit-pathway skill --list          # List all skill IDs
npx fit-pathway skill <id>            # Show skill details
npx fit-pathway skill <id> --agent    # Output as agent SKILL.md format
npx fit-pathway tool --list           # List tools derived from skill toolReferences
```

### Job Generation

```sh
npx fit-pathway job                                       # Summary with stats
npx fit-pathway job --track=<track>                       # Summary filtered by track
npx fit-pathway job --list                                # Valid combinations
npx fit-pathway job --list --track=<track>                # Combinations for a track
npx fit-pathway job <discipline> <level>                  # Trackless job
npx fit-pathway job <discipline> <level> --track=<track>  # With track
npx fit-pathway job <discipline> <level> --checklist=code # With checklist
npx fit-pathway job <discipline> <level> --skills         # Skill IDs only
npx fit-pathway job <discipline> <level> --tools          # Tool names only
```

**Arguments:**

- `<discipline>` -- Discipline ID (e.g. `software_engineering`)
- `<level>` -- Level ID (e.g. `L3`)

**Options:**

| Option                | Description                              |
| --------------------- | ---------------------------------------- |
| `--track=<id>`        | Track ID (e.g. `platform`)               |
| `--list`              | List valid discipline/level combinations |
| `--checklist=<stage>` | Include stage checklist                  |
| `--skills`            | Output skill IDs only                    |
| `--tools`             | Output tool names only                   |

### Agent Generation

```sh
npx fit-pathway agent --list                                         # Valid combinations
npx fit-pathway agent <discipline> --track=<track>                   # Preview
npx fit-pathway agent <discipline> --track=<track> --output=./agents # Write files
npx fit-pathway agent <discipline> --track=<track> --stage=plan      # Single stage
npx fit-pathway agent <discipline> --track=<track> --skills          # Skill IDs only
npx fit-pathway agent <discipline> --track=<track> --tools           # Tool names only
```

**Arguments:**

- `<discipline>` -- Discipline ID

**Options:**

| Option            | Description                           |
| ----------------- | ------------------------------------- |
| `--track=<id>`    | Track ID                              |
| `--output=<dir>`  | Write agent files to directory        |
| `--stage=<stage>` | Generate for a single lifecycle stage |
| `--list`          | List valid combinations               |
| `--skills`        | Output skill IDs only                 |
| `--tools`         | Output tool names only                |

### Interview, Progress, and Questions

```sh
npx fit-pathway interview <discipline> <level>
npx fit-pathway interview <d> <l> --track=<t> --type=mission

npx fit-pathway progress <discipline> <level>
npx fit-pathway progress <d> <l> --compare=<to_level>

npx fit-pathway questions
npx fit-pathway questions --level=practitioner
npx fit-pathway questions --maturity=practicing
npx fit-pathway questions --skill=<id>
npx fit-pathway questions --behaviour=<id>
npx fit-pathway questions --capability=<id>
npx fit-pathway questions --stats
npx fit-pathway questions --format=yaml
```

**Interview options:**

| Option          | Description                     |
| --------------- | ------------------------------- |
| `--track=<id>`  | Track ID                        |
| `--type=<type>` | Interview type (e.g. `mission`) |

**Progress options:**

| Option              | Description                 |
| ------------------- | --------------------------- |
| `--compare=<level>` | Compare with a target level |

**Questions options:**

| Option                  | Description                  |
| ----------------------- | ---------------------------- |
| `--level=<level>`       | Filter by proficiency level  |
| `--maturity=<maturity>` | Filter by behaviour maturity |
| `--skill=<id>`          | Filter by skill ID           |
| `--behaviour=<id>`      | Filter by behaviour ID       |
| `--capability=<id>`     | Filter by capability ID      |
| `--stats`               | Show question statistics     |
| `--format=<format>`     | Output format (e.g. `yaml`)  |

### Build and Development

```sh
npx fit-pathway init                          # Create ./data/ with example framework data
npx fit-pathway dev                           # Run live development server
npx fit-pathway dev --port=8080               # Dev server on custom port
npx fit-pathway build --output=./public --url=https://example.com  # Static site
npx fit-pathway update                        # Update local installation
```

| Option           | Description                     |
| ---------------- | ------------------------------- |
| `--port=<port>`  | Dev server port (default: 3000) |
| `--output=<dir>` | Static site output directory    |
| `--url=<url>`    | Base URL for the built site     |

---

## fit-basecamp

Personal operations center: calendar sync, meeting briefings, and background AI
agents.

```sh
fit-basecamp                         # Wake due agents once and exit
fit-basecamp --daemon                # Run continuously (poll every 60s)
fit-basecamp --wake <agent>          # Wake a specific agent immediately
fit-basecamp --stop                  # Gracefully stop daemon and agents
fit-basecamp --status                # Show agent status and last decisions
fit-basecamp --validate              # Validate agent definitions exist
fit-basecamp --init <path>           # Initialize a new knowledge base
fit-basecamp --update [path]         # Update KB with latest templates
```

| Option            | Description                                |
| ----------------- | ------------------------------------------ |
| `--daemon`        | Run continuously, polling every 60 seconds |
| `--wake <agent>`  | Wake a specific agent by name              |
| `--stop`          | Graceful shutdown of daemon and agents     |
| `--status`        | Display agent status and last decisions    |
| `--validate`      | Check that agent definitions exist         |
| `--init <path>`   | Initialize a new knowledge base at path    |
| `--update [path]` | Update existing KB with latest templates   |

---

## fit-landmark

Signal analysis on engineering framework data. Combines GitHub evidence with
GetDX snapshots.

```sh
fit-landmark evidence --skill <id>                          # Personal evidence
fit-landmark practice --skill <id> --manager <username>     # Practice patterns
fit-landmark snapshot trend --item <id> --manager <username> # Snapshot trends
fit-landmark snapshot compare --snapshot <id> --manager <username> # Snapshot comparison
fit-landmark health --manager <username>                     # Health views
```

| Command            | Description                                         |
| ------------------ | --------------------------------------------------- |
| `evidence`         | View evidence for a skill                           |
| `practice`         | View practice patterns across a manager's team      |
| `snapshot trend`   | Track score trajectory for an item across snapshots |
| `snapshot compare` | Compare a snapshot with benchmarks                  |
| `health`           | Team health view combining signals and evidence     |

| Option             | Description                |
| ------------------ | -------------------------- |
| `--skill <id>`     | Skill ID to query          |
| `--manager <user>` | Manager username for scope |
| `--item <id>`      | Snapshot item ID           |
| `--snapshot <id>`  | Snapshot ID for comparison |

---

## fit-summit

Team capability analysis. Deterministic, no LLM calls.

```sh
fit-summit coverage <team>                                   # Capability coverage
fit-summit risks <team>                                      # Structural risks
fit-summit what-if <team> --add "{ discipline: se, level: L3, track: platform }" # Scenario
```

| Command    | Description                                      |
| ---------- | ------------------------------------------------ |
| `coverage` | Show capability coverage for a team              |
| `risks`    | Identify structural risks in team composition    |
| `what-if`  | Model staffing scenarios with `--add`/`--remove` |

**Arguments:**

- `<team>` -- Team identifier

**what-if options:**

| Option     | Description                                  |
| ---------- | -------------------------------------------- |
| `--add`    | Add a hypothetical team member (YAML object) |
| `--remove` | Remove a team member from the scenario       |

---

## fit-universe

Synthetic data generation from a universe DSL file.

```sh
npx fit-universe                     # Use cached prose (default)
npx fit-universe --generate          # Generate prose via LLM
npx fit-universe --no-prose          # Structural scaffolding only
npx fit-universe --strict            # Fail on cache miss
npx fit-universe --load              # Load raw docs to storage
npx fit-universe --only=pathway      # Render only one content type
npx fit-universe --dry-run           # Show what would be written
npx fit-universe --story=path        # Custom story DSL file
npx fit-universe --cache=path        # Custom prose cache file
```

| Option           | Description                         |
| ---------------- | ----------------------------------- |
| `--generate`     | Call LLM to produce new prose       |
| `--no-prose`     | Skip prose, structural output only  |
| `--strict`       | Fail if prose cache is missing keys |
| `--load`         | Load generated docs into storage    |
| `--only=<type>`  | Render a single content type        |
| `--dry-run`      | Preview without writing files       |
| `--story=<path>` | Path to custom story DSL file       |
| `--cache=<path>` | Path to custom prose cache file     |

---

## fit-doc

Documentation site builder.

```sh
npx fit-doc build --src=website --out=dist    # Build static site
npx fit-doc serve --src=website               # Development server
npx fit-doc serve --src=website --port=8080   # Custom port
npx fit-doc build --src=website --out=dist --base-url=https://example.com  # With base URL
```

| Option             | Description                         |
| ------------------ | ----------------------------------- |
| `--src=<dir>`      | Source directory                    |
| `--out=<dir>`      | Output directory (build only)       |
| `--base-url=<url>` | Base URL for absolute links         |
| `--port=<port>`    | Dev server port (default: 3000)     |
| `--watch`, `-w`    | Watch for changes (serve mode only) |

---

## Related Documentation

- [Guides](/docs/guides/) -- Task-oriented usage walkthroughs
- [Core Model](/docs/reference/model/) -- Entity definitions and derivation
- [YAML Schema](/docs/reference/yaml-schema/) -- File format reference
