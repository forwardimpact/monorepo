# Design 2160 — Provision declared packs in the bootstrap action

Adds a self-contained, `apm.yml`-gated provisioning unit to the `bootstrap`
composite action so a consuming repo's declared skill and agent packs are
materialized before any later agent step. The unit is inert for repos that
commit their trees (the monorepo) and for repos that declare no root `apm.yml`.

## Restated problem

`.github/actions/bootstrap/action.yml` installs the `apm` CLI but never runs
`apm install`, so a repo that declares its profiles and skills as packs (and
gitignores the materialized trees) has no instruction trees on disk at agent
run time. The action must provision those packs — pinned by `apm.lock.yaml`,
gated on a root `apm.yml`, completing before `scripts/bootstrap.sh` — and stay
exactly as it is today for every other repo.

## Architecture

Provisioning is one cohesive unit added to the existing composite action: a
**Restore apm cache** step and a **Provision packs** step, both gated on the
presence of a root `apm.yml`. They sit after PATH setup and before the
`Bootstrap` step. No new action inputs; the gate is the file, not a toggle.

```mermaid
flowchart TD
  A[setup-bun] --> B[Configure git identity]
  B --> C[Sync to origin/main]
  C --> D[Checkout wiki]
  D --> E[Resolve cache paths]
  E --> F[Restore environment cache]
  F --> G[Install CLI deps incl. apm]
  G --> H[Add deps to PATH]
  H --> I{root apm.yml?}
  I -- no --> K[Bootstrap: scripts/bootstrap.sh]
  I -- yes --> J1[apm cache restore+save key=apm.lock.yaml]
  J1 --> J2[Provision: apm install]
  J2 --> K
```

The consuming repo owns deployment shape. The action runs a plain `apm install`
from the repo root; `apm` reads the repo's `apm.yml` and `apm.lock.yaml` and
deploys profiles and skills to the paths it records under `deployed_files`
(auto-detected, or from `apm.yml targets:`). For an `apm_package` dependency
`apm` deploys the agent profiles itself — a consumer lockfile lists each
`.claude/agents/<name>.md` under `deployed_files` (verified against the
reference consumer's `apm.lock.yaml`). The action never post-processes the
deployed tree.

## Components

| Component | Where | Responsibility |
| --- | --- | --- |
| Provisioning gate | `if: hashFiles('apm.yml') != ''` on both new steps | Declarative no-op for repos without a root `apm.yml`; never runs a bare `apm install` (SC2). |
| Restore apm cache | new `actions/cache` step | Restores `apm`'s content-addressed download cache, keyed on `apm.lock.yaml`, so warm runs reuse checkouts (SC5). |
| Provision packs | new composite `run` step | Runs `apm install` from the repo root; nonzero exit fails the run (SC4). Deploys profiles + skills (SC1). |
| `apm` CLI | already installed by `fit-install.sh` | Resolves packs against `apm.lock.yaml` `resolved_commit` (SC3) and deploys profiles + skills (its `deployed_files`) per the repo's `apm.yml`. |

## Interfaces

- **Gate** — `hashFiles('apm.yml')` matches only the workspace-root file (no
  `**`), so it returns `''` for any repo without a root `apm.yml` and the step
  `if:` skips both new steps with no shell invoked. This is the only thing that
  governs provisioning; there is no new input.
- **apm cache location** — `apm` honors `XDG_CACHE_HOME` (verified: it sets the
  cache root to `$XDG_CACHE_HOME/apm`), where it holds its git repository db and
  checkouts content-addressed by commit. Each new step sets `XDG_CACHE_HOME` in
  its own `env:` so the `actions/cache` `path:` names `$XDG_CACHE_HOME/apm`
  deterministically on the Linux runner.
- **Provision command** — `apm install`, run with the working directory at the
  repo root. No `--target`; the repo's `apm.yml` (`targets:` or auto-detected)
  decides deploy paths.
- **Failure contract** — the composite `run` step fails the action on `apm`'s
  nonzero exit (unresolvable declared or pinned pack), so the run never reaches
  `scripts/bootstrap.sh` with a partial environment.

## Key Decisions

| Decision | Choice | Rejected alternative |
| --- | --- | --- |
| Where provisioning lives | In `bootstrap`, the action every workflow already calls and `kata-agent` delegates to. | A new step in `kata-agent`/`harness` — duplicates the gate across actions; spec scopes this to `bootstrap`. |
| Provisioning gate | File presence via `hashFiles('apm.yml')` in step `if:`. | A boolean action input — spec excludes an opt-in toggle; an input can disagree with reality and the file is the real signal. |
| Deploy mechanism | Plain `apm install`; let the repo's `apm.yml`/`apm.lock.yaml` drive paths and `apm` deploy profiles itself (its `deployed_files` for an `apm_package` dep include `.claude/agents/`). | Replicate the benchmark installer's manual `apm_modules/**/agents/` staging — that staging exists for a `skill_bundle` dep that deploys skills only; for `apm_package` deps it is redundant and couples `bootstrap` to `apm` internals. |
| Cache isolation | A separate `apm.yml`-gated `actions/cache` for `$XDG_CACHE_HOME/apm`, keyed on `apm.lock.yaml`. | Fold `apm.lock.yaml` into the existing env-cache key — a pack bump would needlessly drop `node_modules`/`generated`; gating keeps the apm concern inert for non-apm repos. |
| Re-download avoidance | Rely on `apm`'s content-addressed cache (git db + checkouts by commit); always run `apm install` on a warm cache (cheap local deploy). | Skip `apm install` on a cache hit — the deployed trees live in the (uncached) workspace, so they must be re-deployed every run. |

## Data flow

```mermaid
sequenceDiagram
  participant Action as bootstrap action
  participant Cache as actions/cache
  participant Apm as apm CLI
  participant FS as workspace + XDG cache
  Action->>Action: hashFiles('apm.yml') != '' ?
  Action->>Cache: restore key=apm.lock.yaml hash
  Cache-->>FS: warm apm download cache (if hit)
  Action->>Apm: apm install (cwd=repo root)
  Apm->>FS: resolve apm.lock.yaml, fetch missing commits
  Apm->>FS: deploy profiles + skills to configured paths
  Apm-->>Action: exit 0 (or nonzero -> action fails)
  Action->>Action: Bootstrap (scripts/bootstrap.sh)
```

## Success criteria coverage

| # | Met by |
| --- | --- |
| 1 | Provision step runs `apm install` before the `Bootstrap` step; profiles + skills land at their configured paths. |
| 2 | `hashFiles('apm.yml') != ''` gate skips both steps; no bare `apm install`, so no `apm.yml` is auto-created. |
| 3 | `apm install` resolves against `apm.lock.yaml`; deployed commits match each `resolved_commit`. |
| 4 | Composite `run` step fails the action on `apm`'s nonzero exit. |
| 5 | Separate cache keyed on `apm.lock.yaml` + `apm`'s content-addressed checkouts: unchanged lock reuses, changed lock re-provisions. |

## Clean break and scope

The action gains steps; it removes nothing and wraps nothing in a fallback. The
monorepo (commits its trees, no root `apm.yml`) and any non-apm consumer take
the gate's `no` branch and behave exactly as before — no shim, no compat path.
MCP-server provisioning, the consumer's commit-vs-declare choice, and changes to
`kata-agent`/`harness`/`wiki` stay out of scope per the spec.
