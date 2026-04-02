# 280 — Migrate from Make to Just: Plan

## Approach

The migration is a direct translation — every Make target becomes an
identically-named `just` recipe with the same underlying command. No behaviour
changes. The work divides into five phases that must execute in order because
later phases depend on the justfile existing and the env consolidation being
complete.

1. **Consolidate dotenv files** — merge 9 example files into 4.
2. **Create justfile** — translate all 74 targets, with `set dotenv-load`.
3. **Update hooks and CI** — point `.claude/settings.json` and all workflows at
   `just`.
4. **Update documentation and config** — sweep every file that references
   `make`.
5. **Delete old files** — remove `Makefile`, `scripts/env.sh`, and the 6
   obsolete dotenv examples.

Each phase is a separate commit with a clear verification step. The justfile and
dotenv consolidation land together in the first two commits so every subsequent
commit can be tested against the new runner.

---

## Phase 1 — Consolidate Dotenv Files

### 1.1 Create `.env.docker-native.example`

Merge the contents of `.env.docker.example`, `.env.auth.gotrue.example`, and
`.env.storage.minio.example` into one complete profile file. Include every
variable from all three sources — proxy settings, GoTrue auth config, MinIO
storage config — with no layering.

**Create:** `.env.docker-native.example`

```
# Contents combined from:
#   .env.docker.example       — proxy, embedding, map supabase (docker URLs)
#   .env.auth.gotrue.example  — AUTH_TYPE=gotrue, JWT_AUTH_URL (docker), web auth
#   .env.storage.minio.example — STORAGE_TYPE=s3, S3/AWS config (docker URLs)
```

Docker-specific URLs replace localhost URLs (e.g.,
`JWT_AUTH_URL=http://auth-gotrue.local:9999`,
`AWS_ENDPOINT_URL=http://storage-minio.local:9000`).

### 1.2 Create `.env.docker-supabase.example`

Merge `.env.docker.example`, `.env.auth.supabase.example`, and
`.env.storage.supabase.example` into one complete profile file.

**Create:** `.env.docker-supabase.example`

```
# Contents combined from:
#   .env.docker.example            — proxy, embedding, map supabase (docker URLs)
#   .env.auth.supabase.example     — AUTH_TYPE=supabase, JWT_AUTH_URL (docker), web auth
#   .env.storage.supabase.example  — STORAGE_TYPE=supabase, S3/AWS config (docker URLs)
```

### 1.3 Update `.env.local.example`

Append the contents of `.env.auth.none.example` (`AUTH_TYPE=none`,
`EXTENSION_WEB_AUTH_ENABLED=false`) and `.env.storage.local.example`
(`STORAGE_TYPE=local`) to the existing `.env.local.example`, with section
headers. Add a commented-out block showing how to switch to GoTrue auth locally
(copy the relevant vars from the gotrue example with localhost URLs).

**Modify:** `.env.local.example`

### 1.4 Update `.env.example` header comments

Remove references to `.env.storage.*.example` and the layering script from the
header block. Point to the new profile files instead.

**Modify:** `.env.example`

### 1.5 Update `env-reset` recipe logic

The existing `env-reset` target copies all `.env*.example` to `.env*`. The new
profile files are complete alternatives, not layers. Update the recipe (in the
justfile in Phase 2) to copy `.env.example → .env` and append a profile file
(defaulting to `local`), plus config resets. This preserves the current UX where
`env-reset` produces a fully working environment in one command.

**Verify:** `diff <(ENV=local STORAGE=local AUTH=none ./scripts/env.sh env | sort) <(cat .env .env.local | grep -v '^#' | grep '=' | sort)` — the variables
must match for the default local profile.

---

## Phase 2 — Create Justfile

### 2.1 Create `justfile` with configuration

```just
# Monorepo command runner — run `just --list` to list recipes.

set dotenv-load
set quiet

ARGS := ""
```

`set dotenv-load` replaces the entire `ENVLOAD` mechanism. `set quiet` replaces
the `@` prefix on every recipe line. `ARGS` allows passing arguments like
`just cli-chat ARGS="--help"`.

### 2.2 Translate Core recipes

| Make target      | Just recipe                                             | Notes                                   |
| ---------------- | ------------------------------------------------------- | --------------------------------------- |
| `memory-update`  | Same shell body                                         | No `ENVLOAD` needed                     |
| `memory-commit`  | Same shell body                                         | No `ENVLOAD` needed                     |
| `install`        | `just memory-update` then `bun install --frozen-lockfile` then codegen | Dependency expressed as `install: memory-update` |
| `quickstart`     | `just env-setup && just synthetic && just data-init && just codegen && just process-fast` | Dependency chain |

### 2.3 Translate Synthetic recipes

Remove `@$(ENVLOAD)` prefix from every command. The recipes become one-liners:

```just
synthetic:
    bunx fit-universe
    bunx fit-map generate-index
```

Targets: `synthetic`, `synthetic-update`, `synthetic-no-prose`, `codegen`,
`codegen-type`, `codegen-client`, `codegen-service`, `codegen-definition`.

### 2.4 Translate Process recipes

Same pattern — drop `@$(ENVLOAD)`:

```just
process: process-agents process-resources process-tools process-graphs process-vectors
```

Targets: `process`, `process-fast`, `process-agents`, `process-resources`,
`process-tools`, `process-vectors`, `process-graphs`.

### 2.5 Translate Data recipes

Targets: `data-init`, `data-clean`, `data-reset`.

`data-init` keeps its `mkdir -p` chain. `data-reset` uses dependency:
`data-reset: data-clean data-init codegen`.

### 2.6 Translate Service recipes (rc-*)

Drop `@$(ENVLOAD)`. Targets: `rc-start`, `rc-stop`, `rc-restart`, `rc-status`.

### 2.7 Translate CLI recipes

Drop `@$(ENVLOAD)`. Pass `ARGS` through:

```just
cli-chat:
    bunx fit-guide {{ARGS}}
```

Targets: `cli-chat`, `cli-search`, `cli-query`, `cli-subjects`,
`cli-visualize`, `cli-window`, `cli-completion`, `cli-tiktoken`, `cli-unary`.

### 2.8 Translate Docs recipes

No `ENVLOAD` was used. Direct translation. Targets: `docs-build`, `docs-serve`,
`docs-watch`.

### 2.9 Translate Quality recipes

Targets: `audit`, `audit-vulnerabilities`, `audit-secrets`.

### 2.10 Translate Environment recipes

Key change: `env-reset` copies `.env.example` *and* appends a profile file by
default (`local`), producing a complete working local environment in one
command — preserving the current UX where `env-reset` gives you everything you
need. Users who want a Docker profile pass an argument:
`just env-reset docker-native` or `just env-reset docker-supabase`.

```just
env-reset PROFILE="local": config-reset
    cp -f .env.example .env
    cat .env.{{PROFILE}}.example >> .env

config-reset:
    cp config/config.example.json config/config.json
    cp config/tools.example.yml config/tools.yml
    for file in config/agents/*.agent.example.md; do [ -f "$file" ] && cp -f "$file" "${file%.example.md}.md" || true; done
```

This ensures `just env-setup` (which depends on `env-reset`) still bootstraps a
complete environment without manual profile selection.

Targets: `env-setup`, `env-reset`, `env-secrets`, `env-storage`, `env-github`,
`config-reset`, `download-bundle`.

### 2.11 Translate Docker recipes

Docker recipes currently pass explicit `--env-file` flags for layered loading.
With `set dotenv-load`, all env vars are exported into the shell environment of
child processes. Docker Compose resolves `${VAR}` references in
`docker-compose.yml` from the shell environment first, then falls back to `.env`
in the project directory. Since `just` exports all dotenv variables into the
shell, `docker compose` picks them up without `--env-file` flags:

```just
# Before (Make):
# @docker compose --env-file .env --env-file .env.docker --env-file .env.storage.minio --profile minio up

# After (just):
docker-up-minio:
    docker compose --profile minio up
```

This works because `just`'s `set dotenv-load` sets variables *as environment
variables* in the recipe's shell, not just as `just` variables. Verified
empirically: `env | grep VAR` inside a recipe shows dotenv values.

Targets: `docker-build`, `docker-up`, `docker-up-minio`, `docker-up-supabase`,
`docker-down`.

### 2.12 Translate Storage recipes

Same `--env-file` simplification as Docker (shell env vars are visible to
`docker compose`). Targets: `storage-setup`,
`storage-start`, `storage-stop`, `storage-wait`, `storage-init`,
`storage-upload`, `storage-download`, `storage-list`.

`storage-start` currently uses `--env-file .env --env-file .env.$(ENV) --env-file .env.storage.$(STORAGE)` — all these vars come from dotenv-load now, but the
`--profile` flag still needs the storage type. The compose profiles are named
`minio` and `supabase`, matching the `STORAGE` variable values used in the
Makefile. Use a recipe parameter defaulting to `minio`:

```just
storage-start PROFILE="minio":
    docker compose --profile {{PROFILE}} up -d storage-{{PROFILE}}
```

Users pass the profile explicitly: `just storage-start supabase`. The profile
names match the compose file’s `profiles:` values directly.

### 2.13 Translate Auth recipes

Same simplification. Targets: `auth-start`, `auth-stop`, `auth-user`.

`auth-start` needs a profile parameter like `storage-start`. The compose
profiles for auth are `gotrue` and `supabase`, matching the `AUTH` variable
values used in the Makefile:

```just
auth-start PROFILE="gotrue":
    docker compose --profile {{PROFILE}} up -d auth-{{PROFILE}}
```

### 2.14 Translate Supabase recipes

Direct translation. Targets: `supabase-install`, `supabase-up`,
`supabase-down`, `supabase-start`, `supabase-stop`, `supabase-migrate`,
`supabase-status`, `supabase-setup`.

### 2.15 Translate TEI recipes

Targets: `tei-install`, `tei-start`.

### 2.16 Add recipe groups with comments

`just` supports `[group]` attributes or `# group` comments for
`just --list --list-heading` categorization. Use section-header comments matching
the existing Makefile sections:

```just
# ── Core ──────────────────────────────────────────────────

# Initialize and update agent memory submodule (wiki)
memory-update:
    ...
```

`just --list` will show recipe names and their doc comments, matching or
improving on `grep '##' Makefile` discoverability.

**Verify:** `just --list` shows all recipes grouped and documented. Run
`just install`, `just synthetic`, `just data-init` to confirm parity.

---

## Phase 3 — Update Hooks and CI

### 3.1 Update `.claude/settings.json`

```diff
- "command": "make install"
+ "command": "just install"

- "command": "make memory-commit"
+ "command": "just memory-commit"
```

**Modify:** `.claude/settings.json`

### 3.2 Update GitHub Actions workflows

All 12 workflows that use `make install` need two changes:

1. Add a `just` installation step after the Bun setup step.
2. Replace `make install` / `make synthetic` with `just install` /
   `just synthetic`.

The `just` installation step:

```yaml
- name: Install just
  uses: extractions/setup-just@e33e0265a09d0d9e33f4558b0461f616a6b44220 # v2
```

Pin to SHA per the repo's security policy (CONTRIBUTING.md § Security).

**Modify (12 files):**

| Workflow | Make targets used |
| --- | --- |
| `.github/workflows/check-quality.yml` | `make install` (2 jobs) |
| `.github/workflows/check-test.yml` | `make install` (2 jobs), `make synthetic` |
| `.github/workflows/dependabot-triage.yml` | `make install` |
| `.github/workflows/guide-setup.yml` | `make install` |
| `.github/workflows/improvement-coach.yml` | `make install` |
| `.github/workflows/product-backlog.yml` | `make install` |
| `.github/workflows/product-feedback.yml` | `make install` |
| `.github/workflows/publish-npm.yml` | `make install` |
| `.github/workflows/release-readiness.yml` | `make install` |
| `.github/workflows/release-review.yml` | `make install` |
| `.github/workflows/security-audit.yml` | `make install` |

Note: `check-security.yml`, `publish-skills.yml`, and `publish-macos.yml` do
not use `make` — leave unchanged.

**Verify:** Push to a branch, confirm all CI jobs pass.

---

## Phase 4 — Update Documentation and Config

### 4.1 Documentation files

Replace all `make <recipe>` references with `just <recipe>` in:

| File | Approximate changes |
| --- | --- |
| `README.md` | 1 (`make quickstart`) |
| `CONTRIBUTING.md` | 3 (`make quickstart`, `make audit`, `make audit-vulnerabilities`) |
| `CONTINUOUS_IMPROVEMENT.md` | 3 (`make memory-update`, `make install`, `make memory-commit`) |
| `website/docs/internals/operations/index.md` | 29 references |
| `website/docs/internals/guide/index.md` | 1 (`make rc-start`) |
| `products/guide/README.md` | 1 (`make services`) |

### 4.2 Skill files

Replace `make <recipe>` with `just <recipe>` in:

| File | Approximate changes |
| --- | --- |
| `.claude/skills/fit-guide/SKILL.md` | 69 references |
| `.claude/skills/fit-universe/SKILL.md` | 6 references |
| `.claude/skills/libs-system-utilities/SKILL.md` | 3 (`make codegen`, `make audit`) |
| `.claude/skills/libs-web-presentation/SKILL.md` | 1 (`make audit-vulnerabilities`) |
| `.claude/skills/dependabot-triage/SKILL.md` | 1 (`make audit`) |

### 4.3 Config and scripts

| File | Change |
| --- | --- |
| `config/config.example.json` | `make supabase-up` → `just supabase-up`, `make supabase-down` → `just supabase-down` |
| `config/config.json` | Same changes (if not gitignored) |
| `.devcontainer/setup.sh` | `make codegen` → `just codegen`, `make env-setup` → `just env-setup`, `make data-init` → `just data-init` |
| `scripts/auth-user.js` | Error messages: `make auth-user` → `just auth-user`, `make env-storage` → `just env-storage`, `make env-secrets` → `just env-secrets` |
| `.prettierignore` | `**/Makefile` → `**/justfile` |

### 4.4 CLAUDE.md

Update the "Required Development Workflow" section — `Makefile` references, if
any, become `justfile`. The CLAUDE.md currently references `bun run check`
directly, not `make`, so this may require no changes. Verify and update only if
needed.

**Verify:** `grep -rn 'make [a-z]' --include='*.md' --include='*.js' --include='*.json' --include='*.yml' --include='*.sh' . | grep -v specs/ | grep -v node_modules/ | grep -v .git/` — should return zero results (excluding specs/ which are immutable records).

---

## Phase 5 — Delete Old Files

### 5.1 Delete files

| File | Reason |
| --- | --- |
| `Makefile` | Replaced by `justfile` |
| `scripts/env.sh` | Replaced by native just dotenv loading |
| `.env.docker.example` | Replaced by `.env.docker-native.example` and `.env.docker-supabase.example` |
| `.env.auth.none.example` | Folded into `.env.local.example` |
| `.env.auth.gotrue.example` | Folded into `.env.docker-native.example` |
| `.env.auth.supabase.example` | Folded into `.env.docker-supabase.example` |
| `.env.storage.local.example` | Folded into `.env.local.example` |
| `.env.storage.minio.example` | Folded into `.env.docker-native.example` |
| `.env.storage.supabase.example` | Folded into `.env.docker-supabase.example` |

**Verify:** `ls Makefile scripts/env.sh .env.auth.* .env.storage.* .env.docker.example 2>&1` — all should report "No such file or directory".

---

## Commit Plan

| # | Commit message | Phase |
| --- | --- | --- |
| 1 | `feat(env): consolidate 9 dotenv examples into 4 profiles` | 1 |
| 2 | `feat(build): replace Makefile with justfile` | 2 |
| 3 | `fix(ci): migrate hooks and workflows from make to just` | 3 |
| 4 | `docs: update all make references to just` | 4.1–4.2 |
| 5 | `fix: update config, scripts, and ignore files for just` | 4.3–4.4 |
| 6 | `chore: delete Makefile, env.sh, and obsolete dotenv files` | 5 |

Commits 1–2 can be squashed if the env consolidation is tightly coupled with
the justfile creation. Commits 3–6 are independent of each other but must follow
commits 1–2.

---

## Verification Checklist

After all commits:

1. `just install` — succeeds from repo root.
2. `cd libraries/libskill && just install` — succeeds from subdirectory
   (justfile found via ancestor search).
3. `just --list` — shows all recipes, grouped and documented.
4. `just synthetic` — generates data without errors.
5. `just env-setup` — resets env, generates secrets.
6. All CI workflows pass on the PR.
7. `grep -rn 'make [a-z]' . --include='*.md' --include='*.js' --include='*.json' --include='*.yml' --include='*.sh' | grep -v specs/ | grep -v node_modules/` — zero results.
8. `ls Makefile scripts/env.sh` — "No such file or directory".
