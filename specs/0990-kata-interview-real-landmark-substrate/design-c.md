# Design 0990-c — Supervisor-Driven Persona Pick via `fit-map substrate`

Spec: `specs/0990-kata-interview-real-landmark-substrate/spec.md` (status:
`spec approved`). Alternative to
[`design-a.md`](design-a.md) and [`design-b.md`](design-b.md).

## Architectural insight

`fit-landmark` is the only product CLI that reads its caller-identity
credential outside libconfig (identity.js:159 reads
`env.LANDMARK_AUTH_TOKEN` directly). Other env-direct reads in product
src/ are third-party API tokens (`getdx.js:12` reads `GETDX_API_TOKEN`)
or build-time version pins, not identities. This design closes the
identity anomaly: rename the env-var to libconfig's namespace.name.param
scheme (`LANDMARK_AUTH_TOKEN` → `PRODUCT_LANDMARK_TOKEN`); register
`token` as a known param at the `createProductConfig("landmark")`
callsite (fit-landmark.js:51) so the override loop iterates over it;
point `resolveIdentity()` at `config.token`; extend libconfig's override
loop to consult `#envOverrides` (config.js:125–134) so a key in
`#CREDENTIAL_KEYS` can also participate in config.json override
resolution. The kata-interview-specific surface is three `fit-map`
subcommands under one `substrate` scope; the operator verb
`fit-map auth issue` is unchanged.

## History: why `fit-landmark` bypassed libconfig

| Surface | When | Stated rationale | Reading | Response |
|---|---|---|---|---|
| `resolveIdentity()` reads `env.LANDMARK_AUTH_TOKEN` | Spec 0960 ([PR #933](https://github.com/forwardimpact/monorepo/pull/933)), design-a:109 | "kept on `env` to avoid expanding this spec's scope" | Scope-deferred. Not architecture. | Fold in. |
| `credentials.js` avoids libconfig (file header) | Spec 0840 slice 1.5 ([PR #927](https://github.com/forwardimpact/monorepo/pull/927)) | "libconfig's 'config' bucket is rooted at the codebase's config/ directory, which is right for internal contributors but wrong for external `npx fit-landmark` users" | Identifies a real distinction: `findUpward("config")` from CWD works for `fit-guide` invoked from a project root, and for `fit-landmark` invoked inside a project tree, but does **not** work for `fit-landmark login` from arbitrary directories — that command needs per-host platform paths (`~/Library/Application Support/landmark/`, `%APPDATA%/landmark/`, `~/.config/landmark/`). | Out of scope here. `config/config.json` is a valid path for users invoking from a project root; OAuth-session storage class is a follow-up (platform-aware "user-credentials" bucket in libstorage). |

## Three setup paths, three audiences

| Audience | What user does | Where value lives | Reaches libconfig via |
|---|---|---|---|
| Single-host external user invoking from project root | Edit `config/config.json` → `{"product":{"landmark":{"token":"<jwt>"}}}` | `config/config.json` on disk, mode 0600 | `findUpward("config")` from cwd discovers `config/config.json`; loaded into `data` |
| Shell / `.env` (CI / multi-tenant / private repos) | Export `PRODUCT_LANDMARK_TOKEN=<jwt>` | `process.env` or `.env` (in cwd) | libconfig reads `.env` from `process.cwd()` directly (config.js:400) → `#envOverrides`; override loop sees `PRODUCT_LANDMARK_TOKEN` |
| kata-interview's agent (this spec) | n/a (supervisor writes for them) | `$AGENT_CWD/.env`, mode 0600 | Agent's `fit-landmark` runs in `$AGENT_CWD`; libconfig reads `$AGENT_CWD/.env` directly |

The kata-interview agent's cwd is a `mktemp -d` directory. libconfig's
`.env` read is directly off `process.cwd()/.env` (config.js:400, no
`findUpward`), so the supervisor's `.env` write is always discoverable.
The workflow's workspace-prep step also provisions `$AGENT_CWD/config/`
so `findUpward("config")` resolves uniformly — not used by the supervisor
in this spec (which uses `.env` for atomicity with `.substrate.json`),
but parity matters so future external-user code reading the same agent
cwd behaves identically to the standalone external-user case.

## Architecture

```mermaid
sequenceDiagram
    participant W as kata-interview.yml (CI)
    participant S as fit-map substrate stage
    participant DB as Supabase (local)
    participant SV as Supervisor (kata-interview)
    participant R as fit-map substrate roster
    participant I as fit-map substrate issue
    participant A as Agent
    participant LC as libconfig (in agent's fit-landmark)

    W->>S: invoke (if landmark; env: JWT_SECRET, SERVICE_ROLE_KEY)
    S->>DB: stack + migrate + seed + provision (all humans)
    S->>S: self-smoke: short JWT, spawn each gated command with env-injected token
    S->>W: exit 0 / fail workspace-prep
    W->>SV: Run interview (env: AGENT_CWD, JWT_SECRET, SERVICE_ROLE_KEY)
    SV->>R: bunx fit-map substrate roster --format json
    R->>SV: [{email, name, team, role, ...}, ...]
    SV->>SV: pick by memory diversification + JTBD-role alignment
    SV->>I: bunx fit-map substrate issue --email <pick> --cwd $AGENT_CWD
    I->>I: atomically write .env (token) + .substrate.json (discovery); mode 0600
    SV->>SV: write CLAUDE.md from synthetic content for <pick>
    SV->>A: Ask 1 (agent cwd = $AGENT_CWD)
    A->>LC: fit-landmark org show
    LC->>LC: load .env → #envOverrides; override loop → config.token
    LC->>A: resolveIdentity returns identity; command reads .substrate.json for options
```

## Components

| Component | Location | Role |
|---|---|---|
| `fit-map substrate stage` | new subcommand on `fit-map` | Workspace-prep verb: stack-up, migrate, seed, provision-all-humans, then self-smoke. Self-smoke picks any invariant-satisfying persona, mints a short-lived JWT against `SUPABASE_JWT_SECRET`, iterates the `fit-landmark` gated-command list discovered via subprocess `bunx fit-landmark --json` (so the smoke does not internal-import `fit-landmark`'s `COMMANDS` map), spawns each command in turn with the JWT in spawn-options env, asserts three named row-class smokes (`org team`, `evidence`, `practice`) return non-empty. JWT process-local; not written to disk. Smoke spawns inherit `stage`'s own cwd (the CI checkout root). |
| `fit-map substrate roster` | new subcommand on `fit-map` | Read-only via `SUPABASE_SERVICE_ROLE_KEY` (libconfig accessor, supplied by workflow env). Emits invariant-satisfying personas with `manages_count`, `evidence_count`, `practice_directs_count`, qualifying snapshot/item ids, plus a `selection_metadata` block. |
| `fit-map substrate issue` | new subcommand on `fit-map` (`fit-map auth issue` unchanged) | Mints JWT for `--email <e>` using `SUPABASE_JWT_SECRET`, verifies row exists in `organization_people` (`kind='human'`) and `auth.users`, then atomically writes two files into `--cwd <path>`: `.env` with one `PRODUCT_LANDMARK_TOKEN=<jwt>\n` line, and `.substrate.json` with `{ persona_email, manager_email, snapshot_id, item_id, generated_at }` (the four spec § Discovery vector values plus a timestamp). Both mode 0600. Stdout: success line only. JWT TTL: `--ttl <d>`, default `1h` (long enough for any single interview, short enough that disk-resident JWT exposure is bounded); the workflow's `kata-interview.yml` `jobs.interview.timeout-minutes` is declared (new) so a job that exceeds it is killed rather than continuing past the JWT's `exp`. |
| `LANDMARK_AUTH_TOKEN` → `PRODUCT_LANDMARK_TOKEN` rename | `products/landmark/src/`, `products/landmark/test/`, the published guides surface | Clean break, no shim. Docs sweep covers every `LANDMARK_AUTH_TOKEN` literal in `websites/`, enumerated by `rg LANDMARK_AUTH_TOKEN websites/` at implementation time. |
| `Config.token` accessor | `libraries/libconfig/src/config.js` (modified) | One-line change to `createProductConfig("landmark", { token: undefined })` at `products/landmark/bin/fit-landmark.js:51` registers `token` as a known param; the override loop (extended below) then resolves it. `PRODUCT_LANDMARK_TOKEN` joins `#CREDENTIAL_KEYS`. Resolution: `process.env` (extended loop) > `#envOverrides` (extended loop) > `config.json`'s `product.landmark.token` > `undefined`. |
| libconfig override-loop fix | `libraries/libconfig/src/config.js:125-134` (modified) | Extend the loop to consult `#envOverrides[varName]` in addition to `process.env[varName]`. Backward-compatible: existing credential keys carry no default in `data`, so the loop's behavior for them is unchanged. The new pattern (credential + config.json overridable) is opt-in via `#CREDENTIAL_KEYS` membership AND a default registered in `data`. |
| `resolveIdentity()` in fit-landmark | `products/landmark/src/lib/identity.js:159` (one-line read change) | `if (env.LANDMARK_AUTH_TOKEN)` → `if (config.token)`. `env` parameter still flows for `LANDMARK_CREDENTIALS_FILE`. Precedence preserved: `config.token` > credentials file > throw. |
| `kata-interview.yml` | modified | Two new gated steps: (1) `fit-map substrate stage` between `Prepare interview workspace` and `Run interview`, with `env:` exposing `SUPABASE_JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`; (2) post-`Run interview` log scan asserting the literal values of `PRODUCT_LANDMARK_TOKEN`, `SUPABASE_JWT_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` are absent. `Prepare interview workspace` step adds `mkdir -p $AGENT_CWD/config` so libconfig's `findUpward("config")` resolves from the agent's cwd. `Run interview` env gains `AGENT_CWD`, plus the two secrets (Landmark-gated). All new steps and env keys carry `if:` predicates / value-level ternaries that evaluate false for non-Landmark inputs. |
| `.claude/skills/kata-interview/SKILL.md` | modified | Step 3 staging-table Landmark row; new Step 3a (Landmark only) names `roster` + `substrate issue` and the selection-signal taxonomy (signal names only; scoring detail is plan-level); read-do-checklist line rewritten per spec § Persona-file invariant amendment. |

## Interfaces

`fit-map substrate stage --product landmark` — exits 0 only after stack
+ migrations + seed + provision + self-smoke pass.

`fit-map substrate roster --format json` — JSON array of invariant-satisfying
personas with selection metadata; empty → non-zero with which-invariant-filtered-most
diagnostic.

`fit-map substrate issue --email <e> --cwd <path> [--ttl <d>]` — atomically
writes `<path>/.env` + `<path>/.substrate.json`; stdout success line only.

`Config.token` — string getter on a `createProductConfig("landmark")`
instance. Returns `undefined` when no source is set; `resolveIdentity()`
falls through to the credentials store.

## CI workflow surface

Two new GH repo secrets (`SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`),
configured once by a repo admin, exposed via `env:` on the Landmark-gated
steps. Static repo secrets are the right channel: the local Supabase stack
lives for ~5 minutes per workflow run, so per-run rotation has no security
benefit over per-rotation-cycle rotation, and the secrets are auditable at
the repo-settings surface. Same operational shape as `ANTHROPIC_API_KEY`.

## Supervisor experience

1. Steps 0–2 (existing) — read memory; pick `product=landmark`; pick job.
2. Step 3 (existing) — stage `data/*` into `$AGENT_CWD`.
3. **Step 3a (new, Landmark only):** Bash `bunx fit-map substrate roster --format json`; pick a persona using two signals — **memory diversification** (exclude personas referenced in recent log entries) and **JTBD-role alignment** (the supervisor LLM matches the picked job's audience against roster-row `role`); Bash `bunx fit-map substrate issue --email <pick> --cwd $AGENT_CWD`. Supervisor never sees JWT bytes.
4. Step 4 (existing) — write `CLAUDE.md` from synthetic content for `<pick>`.
5. Steps 5–9 (existing) — Asks proceed; agent inherits `$AGENT_CWD` cwd; libconfig reads `.env`; agent reads `./.substrate.json` for command options.

Selection-signal **scoring detail** (weights, window sizes, tie-break order)
is plan-level — the design names only the two signals and their data sources.

## Failure modes

| Failure | Detection | Workflow exit |
|---|---|---|
| Any `stage` phase fails (stack-up, migrate, seed, provision) | `stage` non-zero with named phase | Workspace-prep step fails; `Run interview` skipped |
| `stage`'s self-smoke fails (no invariant-satisfying persona, gated command fails, or row-class smoke empty) | Smoke non-zero with diagnostic | Workspace-prep step fails; `Run interview` skipped |
| Supervisor's `roster` or `issue` Bash call returns non-zero mid-run | Supervisor's Bash tool surfaces the exit code | Supervisor must fail loudly — write a one-line diagnostic to its session output and exit the skill before Ask 1 (no further Ask handoff); the `Run interview` step exits non-zero because the supervisor session ends with no completed interview. This is a new pathway named explicitly because existing kata-interview Step 6 supervises **the agent**, not supervisor-side Bash failures, and conflating the two would silently swallow infra-surprise failures. |

## Key decisions

| Decision | Choice | Rejected alternatives |
|---|---|---|
| Rename instead of special-case accessor | `LANDMARK_AUTH_TOKEN` → `PRODUCT_LANDMARK_TOKEN` (namespace.name.param) with generic `config.token` getter; `createProductConfig("landmark", { token: undefined })` callsite registers the default | (a) Special-case `landmarkToken()` accessor — perpetuates the layering anomaly. (b) Add to `#CREDENTIAL_KEYS` without rename — closes `.env` path but not config.json path. (c) `authToken` param — `AUTHTOKEN` is hard to parse and existing `mcpToken()` doesn't carry `auth`. |
| All substrate verbs under one subcommand scope | `fit-map substrate {stage, roster, issue}` | (a) Reuse `fit-map auth issue --write-env` — overloads operator verb with substrate concerns. (b) New CLI `fit-substrate` — duplicates plumbing. |
| `substrate issue` writes both files atomically | Yes — one verb, one operation, atomic rename per file | (a) Two verbs — supervisor needs ordering. (b) JWT in `.substrate.json` — token-on-disk one `Read` from the persona. |
| Static GH repo secrets for `SUPABASE_JWT_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` | Yes, exposed via `env:` | (a) Generate fresh per run via `env-setup` — adds complexity for no security benefit. |
| Self-smoke passes JWT via spawn-options env | Yes — standard child_process pattern, no disk | (a) Temp `.env` — adds surface for an in-process value. (b) Reuse `substrate issue` — couples smoke to interview-cwd write. |
| libconfig override loop consults `#envOverrides` | Yes | (a) Keep loop reading only `process.env` — then a credential-isolated key can't have a config.json fallback, forcing a special-case accessor. |
| Who picks the persona | Supervisor LLM, using memory + JTBD-role signals (recent-features signal deferred until memory-schema spec lands) | (a) CI lex-first (design-a/b) — ignores memory. |
| How supervisor knows `$AGENT_CWD` | New `env:` line on `Run interview` | (a) `pwd` returns supervisor cwd. (b) Task-amend — couples path to prompt text. |
| Smoke runs inside `stage` (terminal phase) | Yes — atomic gate on workspace-prep | (a) Separate CI step — doubles new-step count. |

## Trade-offs

| Concern | Cost |
|---|---|
| Public env-var name changes | Docs sweep across every `websites/` markdown file matching `rg LANDMARK_AUTH_TOKEN` plus the CLI `--help`. External operators with private scripts setting the old name silently fall through to the credentials file. |
| `config.token` is generic at read site | Less self-documenting than `env.LANDMARK_AUTH_TOKEN`. Future Landmark tokens would need distinct param names. |
| Two new GH repo secrets | Repo admin configures `SUPABASE_JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` once. |
| JWT on disk in `$AGENT_CWD/.env` | Lifetime ≤ interview run; mode 0600; same surface the spec amendment permits for product-named env vars. |
| Corpus satisfiability | `stage`'s self-smoke fails fast pre-Run-interview. |

## SKILL.md amendments

Step 3 staging-table Landmark row: "Substrate (auth.users for all
humans, schema, seed, smoke) staged by the workflow." New **Step 3a**
(Landmark only) names `roster` + `substrate issue` and the two
selection signals (memory diversification, JTBD-role alignment).
Scoring weights and window sizes are plan-level. Step 4 unchanged in
spirit; for Landmark the persona email comes from Step 3a's pick.
Read-do-checklist line rewritten per spec's Persona-file invariant
amendment. Step 4's `CLAUDE.md` exclusion list unchanged.
