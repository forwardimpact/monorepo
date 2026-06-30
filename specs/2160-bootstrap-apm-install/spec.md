# Spec 2160 — Provision declared packs in the bootstrap action

**Classification:** Internal — CI/build tooling for the published `bootstrap`
action, with no user-facing product surface change, though its impact lands on a
product job (see Proposal).

The `bootstrap` action installs the `apm` CLI but never runs `apm install`. A
repository that declares its skill and agent packs in `apm.yml` /
`apm.lock.yaml` and does not commit the materialized trees therefore has no
agent profiles or skills present when an agent runs. This spec adds a gated
`apm install` to the action so declared packs are provisioned before the agent
step.

## Problem

The published `bootstrap` action sets up Bun, restores its environment cache,
installs pinned CLIs (`apm` among them via `fit-install.sh`), optionally checks
out the wiki, and runs `scripts/bootstrap.sh`. No step runs `apm install`. The
`apm` binary is on `PATH`, but the packs declared in the consuming repo's
`apm.yml` are never fetched or deployed.

`apm install` is the step that materializes a repo's declared packs — agent
profiles and skills — onto disk. A Kata workflow names the profiles it runs
(`agent-profile` / `agent-profiles`). For a repo that declares those profiles as
packs and does not commit the materialized trees, the profiles exist only after
`apm install`. Because the action never runs it, such a repo's agents cannot
resolve their configured profiles at run time.

`kata-setup` already names this provisioning path: its verify step expects a
repo's named agent profiles to be either **committed** or **bootstrap-installed
from the pinned packs**. The second option assumes the bootstrap runtime
installs the declared packs — which it does not. This spec closes that gap. It
does not change the committed-trees path, which works today and stays valid.

### Evidence

| Claim | How to confirm |
| --- | --- |
| The action installs the `apm` CLI but never runs `apm install`. | `.github/actions/bootstrap/action.yml` installs the `apm` CLI and then runs `scripts/bootstrap.sh` as its final step; no step invokes `apm install`. `fit-install.sh` lists `apm` in its default tool set. |
| `scripts/bootstrap.sh` does not install packs either. | The script runs the workspace install and wiki sync only. |
| A consumer that declares its profiles as packs and does not commit the trees has unresolved profiles at run time. | `forwardimpact/bionova-apps`, the public reference consumer, declares its Kata profiles via the `kata-skills` pack in `apm.yml`/`apm.lock.yaml`, gitignores the materialized trees, and runs the Kata team through `kata-agent` (which delegates to `bootstrap`, per `.github/CLAUDE.md`); with the trees gitignored, those profiles exist only after `apm install`. |

### Who is affected

| Affected | How |
| --- | --- |
| Teams Using Agents | A Kata installation whose agent profiles are declared as packs (not committed) has no profiles at run time, so scheduled and dispatched agents cannot resolve their configured profile. |
| Platform Builders | The published `bootstrap` action does not provision the `apm.yml` it expects a consuming repo to declare. |
| `kata-setup` | Its "bootstrap-installed from the pinned packs" provisioning path is not implemented by the runtime it names. |

## Proposal

Add a gated `apm install` to the `bootstrap` action. When the consuming repo
declares packs in a root `apm.yml`, the action provisions them — pinned by
`apm.lock.yaml` — before it runs `scripts/bootstrap.sh`, so agent profiles and
skills are present for any later agent step. When the repo declares no root
`apm.yml`, the action provisions nothing and behaves exactly as it does today.

This serves the JTBD job **Teams Using Agents → Run a Continuously Improving
Agent Team** (Little Hire: _onboard a Kata installation that runs the
Plan-Do-Study-Act loop without per-team prompt engineering_). Onboarding cannot
succeed if the runtime never provisions the team's configured agents.

## Scope

### Included

| Item | What it does |
| --- | --- |
| Gated provisioning | The action provisions the declared packs when the repo has a root `apm.yml`, pinned by `apm.lock.yaml`. |
| No-op without `apm.yml` | When the repo declares no root `apm.yml`, no provisioning runs and behavior is unchanged. |
| Ordering | Provisioning completes before `scripts/bootstrap.sh`, so materialized profiles and skills are available to any later agent step. |
| Hard failure | When a declared or pinned pack cannot be resolved, the action fails the run rather than continuing with a partial environment. |

### Excluded

| Item | Why |
| --- | --- |
| Monorepo tree tracking | The monorepo commits its instruction trees and declares no root `apm.yml`; its runtime behavior is unchanged. |
| Consumer commit-vs-declare choice | Whether a consuming repo commits its trees or declares them as packs is the consumer's decision, untouched here. |
| An opt-in toggle | Provisioning is governed only by whether the repo declares a root `apm.yml`; no separate input gates it. |
| The `apm.yml` MCP-server section | This spec covers skill and agent packs; MCP-server provisioning is separate. |
| The caching strategy | Whether and how provisioning output is cached is a performance mechanism for the design; SC5 states only the observable outcome. |
| `kata-agent` / `harness` / `wiki` actions | `kata-agent` delegates to `bootstrap`; provisioning belongs in `bootstrap` and needs no change to the others. |

## Success criteria

| # | Criterion | Verification |
| --- | --- | --- |
| 1 | With a root `apm.yml` present, a bootstrap run leaves the declared packs' agent profiles and skills on disk before `scripts/bootstrap.sh` runs. | In a repo with `apm.yml`, each declared profile file exists at its expected path after the provisioning step and before `scripts/bootstrap.sh`; a following agent step that names one of those profiles starts without an unresolved-profile error. |
| 2 | With no root `apm.yml`, the action provisions nothing and creates no `apm.yml`. | In a repo without `apm.yml`, the action's gate skips the provisioning step entirely (it does not run a bare `apm install`, which would auto-create `apm.yml`); no `apm.yml` appears and no packs are fetched. |
| 3 | Provisioning is pinned. | Each provisioned pack's commit matches the `resolved_commit` recorded for it in `apm.lock.yaml`. |
| 4 | An unresolvable declared or pinned pack fails the run. | A bootstrap run whose `apm.yml` references an unresolvable pack exits non-zero at the provisioning step. |
| 5 | Warm runs do not re-download unchanged packs. | A second run with an unchanged `apm.lock.yaml` provisions without re-downloading the packs; changing `apm.lock.yaml` re-provisions them. |
