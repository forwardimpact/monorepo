# gemba-watchdog

Count repository activity over a window and engage an operator latch variable
when any counter breaches its threshold.

## Purpose

An agent team that answers repository events can feed itself. A run posts a
comment, files an issue, or opens a pull request, and that output is itself an
event that starts the next run. Nothing in that chain bounds the total volume.

This action is the brake. It runs in two modes:

- **`assess`** counts default-branch commits, pull requests created, issues
  created, and issue and pull-request conversation comments created, each
  against one cutoff. It is read-only, it mints no token, and it exits 0 on
  every outcome.
- **`engage`** writes the latch variable. It runs only after `assess` reports
  a breach, and it exits 1 so the run stands out red.

The action sets the latch. **It never clears it.** A human clears it by writing
a falsy value. Deleting the variable resumes the team too, but forfeits the
quiet window that follows a clear.

It runs no agent and it checks no repository out.

The counters, the threshold and window, the latch contract, the clearing rule,
and the exit codes are documented once, in
[Guard an Agent Team's Activity](https://www.gemba.team/docs/guard-activity/index.md).
This README covers what is specific to the action.

## Prerequisites

- A `ubuntu-latest` (linux-x64) or macOS arm64 runner. The pinned release
  publishes raw per-CLI binaries for those targets only. On any other target
  the installer has no release asset to use and the action fails closed rather
  than resolving the CLI another way.
- For `assess`: a token with read access to contents, issues, and pull
  requests. `secrets.GITHUB_TOKEN` with the job permissions below is enough.
- For `engage`: a GitHub App with `Variables: read & write` at repository scope
  and `Variables: read-only` at organization scope.
- A repository Actions variable the App may write.

## Usage

Measurement and engagement are separate jobs, so the write credential never
appears on a quiet run.

```yaml
name: "Watchdog"

on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

permissions:
  contents: read

env:
  WATCHDOG_THRESHOLD: "32"
  WATCHDOG_WINDOW_HOURS: "2"
  WATCHDOG_VARIABLE: MY_KILLSWITCH

jobs:
  assess:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      issues: read
      pull-requests: read
    outputs:
      verdict: ${{ steps.assess.outputs.verdict }}
      reason: ${{ steps.assess.outputs.reason }}
    steps:
      - id: assess
        uses: forwardimpact/gemba-watchdog@v1
        with:
          mode: assess
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          # The run summary reports the latch's current value only when the
          # caller wires it. A dynamic `vars[...]` index is not available in
          # every context; use `vars.MY_KILLSWITCH` if it does not evaluate.
          killswitch-value: ${{ vars[env.WATCHDOG_VARIABLE] }}
          token: ${{ secrets.GITHUB_TOKEN }}

  engage:
    needs: assess
    if: needs.assess.outputs.verdict == 'engage'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions: {}
    steps:
      - uses: forwardimpact/gemba-watchdog@v1
        with:
          mode: engage
          # Declared required on the action. The engage step consumes none of
          # it, and it costs no second copy of the number: the value comes
          # from the one env home above.
          threshold: ${{ env.WATCHDOG_THRESHOLD }}
          window-hours: ${{ env.WATCHDOG_WINDOW_HOURS }}
          variable: ${{ env.WATCHDOG_VARIABLE }}
          reason: ${{ needs.assess.outputs.reason }}
          app-id: ${{ secrets.MY_APP_ID }}
          app-private-key: ${{ secrets.MY_APP_PRIVATE_KEY }}
```

Give the workflow a name outside the family your latch gates. The watchdog must
keep running after it engages, so it never gates on the variable it writes.

## Inputs

| Input | Required | Default | Role |
| ----- | -------- | ------- | ---- |
| `mode` | yes | — | `assess` or `engage`. Any other value fails the run |
| `threshold` | yes | — | The breach threshold, one number for every counter |
| `window-hours` | yes | — | The window the counters cover |
| `variable` | no | `""` | The latch variable's name. Required in `engage` mode |
| `repository` | no | `${{ github.repository }}` | `owner/repo`. In `engage` mode the App must be installed on it |
| `default-branch` | no | `${{ github.event.repository.default_branch }}` | The commits counter's branch |
| `killswitch-value` | no | `""` | The caller's own latch reading, for the run summary only |
| `reason` | no | `""` | The encoded reason, in `engage` mode |
| `dry-run` | no | `"false"` | Read both scopes and write nothing. Any value other than empty, `0`, `false`, `no`, or `off` is a dry run |
| `token` | no | `""` | Read-only token for `assess` |
| `app-id` | no | `""` | App id for the `engage` token mint |
| `app-private-key` | no | `""` | App key for the `engage` token mint |
| `gear-release` | no | `gear@v0.3.5` | The release the installer pins |
| `installer-sha256` | no | `bdb365c1e73e042092b15c421206f3aa365d04878e124137a00b59ef25c6be97` | SHA-256 of that release's `fit-install.sh` |

`threshold` and `window-hours` carry no default, so the two numbers live once in
the caller's workflow. A composite action's `required:` is documentation rather
than a runner-enforced gate, so the action validates `mode` and `repository`
before anything else, and each step fails fast on an empty value it needs.

**The two release pins move together.** `gear-release` names a release and
`installer-sha256` is that release's own `fit-install.sh` digest. Bumping
either alone fails the digest check and takes the brake down. Nothing advances
them automatically: Dependabot does not reach a published action's inputs.

## Outputs

| Output | Meaning |
| ------ | ------- |
| `verdict` | `engage` when any counter breached, `quiet` otherwise |
| `reason` | The encoded reason string, empty on a quiet run |

## How the CLI is installed

The action downloads `fit-install.sh` from the pinned release into a temporary
directory and verifies it against `installer-sha256`. The installer then
verifies the CLI binary against the `.sha256` sidecar that same release
published. Both anchors travel with the pinned tag.

The step then **asserts the release channel positively**: the installer must
report that it installed `gemba-watchdog` from `gear-release`. Refusing the npm
marker alone would not be enough, because a `gemba-watchdog` already on `PATH`
makes the installer report `tools ready` and install nothing, and a macOS
runner can resolve the unpinned cask. Both now fail the step.

One limitation is worth stating plainly: the installer picks its own channel
and reports afterwards, so on a runner where the release channel is
unreachable the npm install completes before the action inspects the result.
The step then fails closed, but the dependency tree has already resolved on
that runner.

## Credential scope

`engage` needs `Variables: read & write` at repository scope and
`Variables: read-only` at organization scope. The latch resolves the effective
value across both scopes, so the organization read is not optional: without it
the read returns 403 and every engage run exits 1 without writing.
Organization **write** is not needed, and granting it would let the same
credential set or clear the organization-scope latch that every gate falls back
to.

The App needs **no `Secrets` permission** at either scope, so the credential
that can halt the team can never read or write a secret. That scoping is
possible because the latch is an Actions variable.

The action does not rely on the App's permission set alone. It **down-scopes
the installation token it mints** to `variables: write` on the target
repository plus `organization-variables: read`. A mint that fails because the
App lacks one of those two is the correct outcome: the run exits non-zero
rather than writing with a wider credential.

## Containment residual

Agent sessions may run under the same App, so an agent that calls the variables
API can clear the latch that stopped it. This action's own token is down-scoped
to the two variable permissions, but an agent session's token is not, and the
App's own grant is what bounds it. Three controls stand against that, and
**none of them is a permission boundary**:

1. A shared agent instruction states that no agent writes the latch variable.
2. The review rule that gates trust-sensitive settings extends to the
   watchdog's own surface: its workflow, its composite action home, its CLI
   bin, and its guardrail library.
3. Every run records the latch's current value on its run summary, so an
   unexplained clear is visible within one interval. That control needs the
   caller to wire `killswitch-value`.

The residual is deliberate and stated: this brake is robust against an agent
chain that is not trying to defeat it, and not against one that is.

## Exit codes

| Code | Outcome |
| ---- | ------- |
| 0 | `assess` on any verdict. `engage` on a skip or a dry run |
| 1 | `engage` wrote the latch, or could not read or write it |
| 2 | A usage error: an unknown `mode`, a malformed `repository` or `gear-release`, or a missing required option |

A failure **before** the CLI runs — a download error, a stale
`installer-sha256`, or a channel other than the pinned release — fails the step
and engages nothing. That is a red run with the brake absent rather than a
stop, and it is the accepted cost of pinning a released binary. A scheduled
caller sees it every interval.

## License

Apache-2.0. See [LICENSE](LICENSE).
