# CLI

## Agent-Aligned Engineering Standard commands

```sh
npx fit-map init                            # Bootstrap ./data/pathway/ + ./config/config.json; re-runs are idempotent
npx fit-map validate                        # Validate all data (JSON schema + referential)
npx fit-map validate --shacl                # Validate RDF/SHACL syntax
npx fit-map validate --data=PATH            # Validate a specific data directory
npx fit-map generate-index                  # Generate _index.yaml files for browser loading
npx fit-map export                          # Render base entities to HTML microdata
npx fit-map export --output=PATH            # Export to a custom directory
```

Validation output includes a data summary showing entity counts. Use this to
quickly verify data is loading correctly after changes.

### People commands

```sh
npx fit-map people validate <file>          # Validate a people file against the agent-aligned engineering standard (no DB)
npx fit-map people push <file>              # Store raw + upsert into activity.organization_people
```

`people validate` is a local pre-flight check — it never opens a Supabase
connection. `people push` writes the raw file to the `raw` bucket for audit,
then calls the shared `transformPeople` helper to upsert rows into
`activity.organization_people` (manager-less rows first so foreign keys
resolve). Both accept YAML or CSV with the same column names.

### Activity commands

Activity commands require the Supabase CLI. Install via Homebrew
(`brew install supabase/tap/supabase`) or npm (`npm install supabase`) —
`fit-map` finds either and falls back to `npx supabase` for the npm-local
install. See the
[engineering leaders getting-started guide](../../website/docs/getting-started/leaders/map/index.md#activity-install-the-supabase-cli)
for details.

```sh
npx fit-map activity start                  # Start the bundled local Supabase stack
npx fit-map activity stop                   # Stop the local stack
npx fit-map activity status                 # Report local stack health
npx fit-map activity migrate                # Reset + re-apply migrations (drops data)
npx fit-map activity transform              # Reprocess every raw document in the raw bucket
npx fit-map activity transform people       # Reprocess only people
npx fit-map activity transform getdx        # Reprocess only GetDX
npx fit-map activity transform github       # Reprocess only GitHub webhooks
npx fit-map activity verify                 # Smoke-test the activity database
```

The activity commands wrap the bundled Supabase project so consumers don't need
to `cd` into `node_modules/@forwardimpact/map`. `activity transform` reads from
the `raw` bucket and upserts on natural keys — safe to re-run. `activity verify`
reads `organization_people` and at least one derived table and exits non-zero if
either is empty.

### GetDX commands

```sh
GETDX_API_TOKEN=xxx npx fit-map getdx sync  # Extract + transform GetDX snapshots
```

Fetches `teams.list`, `snapshots.list`, and `snapshots.info` for every undeleted
snapshot, stores each response under `raw/getdx/`, and upserts
`activity.getdx_teams`, `activity.getdx_snapshots`, and
`activity.getdx_snapshot_team_scores`. The CLI and the hosted `getdx-sync` edge
function run the same extract-and-transform code — pick whichever fits your
deployment.
