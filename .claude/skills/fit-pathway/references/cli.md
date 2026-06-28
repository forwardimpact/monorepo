# CLI Reference

## Getting Started

```sh
npx fit-pathway dev                           # Run live development server (default port 3000)
npx fit-pathway dev --port=8080               # Dev server on custom port
npx fit-pathway build                         # Static site to public/
npx fit-pathway build --url=https://example.com  # Static site with distribution packs
npx fit-pathway serve                         # Serve public/ with git smart HTTP (port 3000)
npx fit-pathway serve ./dist --port=8080      # Serve custom dir on custom port
npx fit-pathway update                        # Update local ~/.fit/data/pathway/ installation
npx fit-pathway update --url=URL              # Update from custom source URL
```

`init` writes a starter agent-aligned engineering standard into
`./data/pathway/` (`standard.yaml`, `levels.yaml`, `stages.yaml`,
`drivers.yaml`, plus `disciplines/`, `capabilities/`, `behaviours/`, and
`tracks/` directories). After init, validate with `npx fit-map validate` and
explore with any of the entity commands below.

### Entity Browsing

All entity commands support three modes:

| Mode    | Pattern                        | Description                 |
| ------- | ------------------------------ | --------------------------- |
| Summary | `npx fit-pathway <command>`    | Concise overview with stats |
| List    | `npx fit-pathway <cmd> --list` | IDs for piping              |
| Detail  | `npx fit-pathway <cmd> <id>`   | Full entity details         |

Entity commands: `discipline`, `level`, `track`, `behaviour`, `driver`, `stage`,
`skill`, `tool`.

### Job Generation

```sh
npx fit-pathway job                                       # Summary with stats
npx fit-pathway job --track=<track>                       # Summary filtered by track
npx fit-pathway job --list                                # Valid combinations
npx fit-pathway job --list --track=<track>                # Combinations for a track
npx fit-pathway job <discipline> <level>                  # Trackless job
npx fit-pathway job <discipline> <level> --track=<track>  # With track
npx fit-pathway job <discipline> <level> --skills         # Skill IDs only
npx fit-pathway job <discipline> <level> --tools          # Tool names only
```

### Agent Generation

```sh
npx fit-pathway agent --list                                        # Valid combinations
npx fit-pathway agent <discipline> --track=<track>                  # Preview
npx fit-pathway agent <discipline> --track=<track> --output=./agents # Write files
npx fit-pathway agent <discipline> --track=<track> --skills         # Skill IDs only
npx fit-pathway agent <discipline> --track=<track> --tools          # Tool names only
```

### Interview, Progress & Questions

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
npx fit-pathway questions --format=yaml          # table, yaml, json
```

Interview types: `mission` (skill questions), `decomposition` (capability
questions), `stakeholder` (behaviour questions).

### Skill Detail

```sh
npx fit-pathway skill <id>          # Human-readable detail
npx fit-pathway skill <id> --agent  # Output as agent SKILL.md format
```

### Agent Output Paths

- Agent profiles: `.github/agents/{id}.agent.md` (VS Code Custom Agents)
- Skill files: `.claude/skills/{skill-name}/SKILL.md` (Agent Skills Standard)
