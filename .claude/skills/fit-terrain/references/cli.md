# CLI Reference

`fit-terrain` is verb-driven. Each verb names one outcome.

```sh
npx fit-terrain check                      # Verify prose cache is complete
npx fit-terrain validate                   # Cross-content checks (no writes)
npx fit-terrain build                      # Render and write all content
npx fit-terrain build --only=pathway       # Render only one content type
npx fit-terrain build --load               # Also load raw docs to Supabase
npx fit-terrain generate                   # Fill cache via LLM, then build
npx fit-terrain --story=path build         # Custom story DSL file (global flag)
npx fit-terrain --cache=path check         # Custom prose cache file (global flag)
```

Run `npx fit-terrain <verb> --help` for verb-scoped options.

## Verbs

| Verb       | Outcome                                         | Exit code     |
| ---------- | ----------------------------------------------- | ------------- |
| `check`    | Cache hit-rate report; fails on miss            | 0 hit, 1 miss |
| `validate` | Entity + cross-content checks, no writes        | 0 / 1         |
| `build`    | Render and write to `data/`                     | 0 / 1         |
| `generate` | LLM prose generation, write cache, then `build` | 0 / 1         |
| `inspect`  | Dump intermediate stage output (Phase D)        | 2 (deferred)  |

### Content Types

`build --only=<type>` renders a single content type:

| Type       | Output Directory | Contents                                                            |
| ---------- | ---------------- | ------------------------------------------------------------------- |
| `html`     | `data/knowledge` | Articles, guides, FAQs, courses; plus the seven clinical pages when the DSL declares a `clinical {}` block |
| `pathway`  | `data/pathway`   | YAML standard files                                                 |
| `raw`      | `data/activity`  | Roster, GitHub events, evidence                                     |
| `markdown` | `data/personal`  | Briefings, notes, KB content                                        |

Dataset outputs (declared via `output` blocks in the DSL) are written
regardless of `--only` to the paths each `output` block names.

## Substrate Verbs

Identity capability against the
[Substrate Contract](https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md).
Stack-facing verbs need `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`;
`issue` also needs `JWT_SECRET`; `init` is offline.

```sh
npx fit-terrain substrate up --cwd . --emit-env "$GITHUB_ENV"  # Start stack, emit URL/anon key
npx fit-terrain substrate init --cwd .                         # Scaffold starter contract migration
npx fit-terrain substrate check                                # Validate stack against the contract
npx fit-terrain substrate provision                            # Reconcile auth.users vs substrate.people
npx fit-terrain substrate pick --format json --memory picks.csv --memory-window 5
npx fit-terrain substrate roster --format json                 # List qualifying personas
npx fit-terrain substrate issue --email <e> --cwd <dir> --token-env <NAME> [--ttl 1h] [--stash <path>]
```

| Verb        | Outcome                                                         | Exit code |
| ----------- | --------------------------------------------------------------- | --------- |
| `up`        | Local Supabase started; URL/anon key emitted                    | 0 / 1     |
| `init`      | Timestamped starter migration under `<cwd>/supabase/migrations` | 0 / 1     |
| `check`     | One diagnostic per missing/malformed relation                   | 1 only when a required relation fails |
| `provision` | auth.users created/restored/decommissioned from the roster      | 0 / 1     |
| `pick`      | One persona (JSON payload with `applied_invariants`)            | 1 when none qualifies or diversifies |
| `roster`    | Every qualifying persona (table or JSON)                        | 0 / 1     |
| `issue`     | Atomic `.env` / `.substrate.json` / stash set, mode 0600        | 0 / 1     |

### Global Flags

| Flag             | Description                       |
| ---------------- | --------------------------------- |
| `--story=<path>` | Custom story DSL file             |
| `--cache=<path>` | Custom prose cache file           |
| `--help, -h`     | Show help (top-level or per-verb) |
| `--version`      | Show version                      |
| `--json`         | Emit help as JSON                 |
