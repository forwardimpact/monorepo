# Spec 1530 — `publish-native.yml` runs the publish vulnerability gate

## Persona and job

Hired by **Teams Using Agents** to honour the policy that publish workflows
gate on `npm audit` before any artifact ships, by extending that gate to the
one publish workflow that bypasses it today.

Related JTBD:
*Teams Using Agents — Run a Continuously Improving Agent Team* ([JTBD.md](../../JTBD.md)).
Originating finding: [Issue #1423](https://github.com/forwardimpact/monorepo/issues/1423).

## Problem

[`CONTRIBUTING.md`](../../CONTRIBUTING.md) § Security records two rules:
**vulnerability audit** "runs in CI (via temporary lockfile generation) and
gates publish workflows", and **CI secret scanning** runs on every push and
pull request via `check-security.yml`. The vulnerability rule explicitly
covers the publish path; `publish-native.yml` violates it.

### What every other publish workflow does today

Five publish workflows ship artifacts to external surfaces. Four of them call
`./.github/actions/audit` before any publish step runs. The fifth —
`publish-native.yml`, added 2026-06-02 via PR #1345 — does not call the
composite at all.

| Workflow | Calls `./.github/actions/audit`? | `with:` block | Effective mode at HEAD |
|---|---|---|---|
| `publish-npm.yml` | yes | (none) | vulnerability scanning (composite default) |
| `publish-brew.yml` | yes | (none) | vulnerability scanning (composite default) |
| `publish-macos.yml` | yes | (none) | vulnerability scanning (composite default) |
| `publish-skills.yml` | yes | `vulnerability-scanning: "false"`, `secret-scanning: "true"` | secret scanning only (the publish path syncs markdown to sibling repos; there is no compiled artifact whose dependency tree could carry a CVE) |
| `publish-native.yml` | **no** | — | **no audit at all** |

The audit composite's input defaults are
`vulnerability-scanning: "true"`, `secret-scanning: "false"`
(`.github/actions/audit/action.yml` lines 5–12). The three workflows that pass
no `with:` block therefore run vulnerability scanning only. The
`publish-native.yml` publish path runs neither mode — it is the only publish
workflow without any audit gate.

The reusable `build-binaries.yml` workflow that `publish-native.yml` calls
also does not invoke the audit composite — it compiles, smoke-tests,
checksums, and uploads matrix artifacts. The publish-stage `release` job in
`publish-native.yml` then downloads those artifacts and uploads them to a
GitHub Release without checking out the workspace or running any audit step.

### What this spec asks for

`publish-native.yml` runs `npm audit --audit-level=high --omit=dev
--workspaces` before any artifact reaches a public release surface. This
restores the rule that the other publish workflows already enforce
(vulnerability gate) and that CONTRIBUTING.md already documents.

This spec does **not** ask `publish-native.yml` to run gitleaks. Three of
the four publish workflows in scope today do not run gitleaks either;
extending the secret-scanning rule to the publish path is a separate
policy question (currently codified as a pre-merge gate via
`check-security.yml`) and is left out of scope here so the design and plan
that follow this spec are bounded to the directly-violated rule.

### Why a vulnerability gate at the publish step matters here

`npm audit` against the workspace ranges is the only check that fires
between merge to `main` and the public release. `check-security.yml`'s
vulnerability-scanning job runs on push to `main` and on pull request, so
a CVE flagged by a Dependabot advisory after the most recent main-branch
commit but before a `native@v*` tag push would not have been caught
upstream of the publish.

The bun-compiled native binary statically links every production
dependency reachable from the CLI's entry point, so a `>=high`-severity
CVE in a production dependency lands inside the binary uploaded to the
GitHub Release. End users consuming the native distribution channel pull
these artifacts directly from the release; they do not run `npm install`,
so any per-install npm audit step on the consumer side does not see the
dependency tree. The gate has to fire upstream of the upload, in the
publish workflow itself.

### Triggering surface

`publish-native.yml` triggers on `push` of any tag matching `native@v*`.
The `release` job runs on `ubuntu-latest` with `permissions: contents:
write`, downloads matrix artifacts from `build-binaries.yml`, and uploads
each binary plus its `.sha256` to a public GitHub Release via `gh release
upload … --clobber`. The clobber semantics mean a second push to the same
tag overwrites previously-uploaded assets, so a publish that should have
failed cannot be caught by re-running with an audit gate after the fact —
the asset is already public.

The native binaries that ship through this path are the bun-compiled CLIs
described in `build/cli-manifest.json` for the targets that
`publish-native.yml` passes to `build-binaries.yml`. The target set is a
workflow input (`targets:` at the call site), not a manifest property; a
future caller of `build-binaries.yml` may pass a different target set.

### What is not a constraint here

The audit composite's gitleaks installer is gated on
`secret-scanning == 'true'` and is therefore skipped under this spec's
inputs; the vulnerability-scanning step uses `npm` and `perl` and runs on
any runner the composite is invoked on. `publish-brew.yml` and
`publish-macos.yml` already invoke the composite on `macos-14` runners
with default inputs today, so neither caller-side nor callee-side
placement is foreclosed by OS.

## Scope

### In scope

- The native publish pipeline (the `build-binaries.yml` workflow and the
  `publish-native.yml` workflow that consumes it) runs the vulnerability
  gate via `./.github/actions/audit` before any artifact reaches the
  public release surface — meaning a failing gate prevents `gh release
  upload` from running on the same `native@v*` tag push. Where the gate
  lives, how the upload job depends on it, and which prerequisite steps
  (checkout, environment, etc.) precede it are design choices.

### Excluded

- **Secret scanning (`gitleaks`) at publish time.** Three of the four
  existing in-policy publish workflows do not run gitleaks at publish;
  extending the secret-scanning rule to the publish path is a separate
  policy question.
- **`publish-npm.yml`, `publish-brew.yml`, `publish-macos.yml`,
  `publish-skills.yml`.** Their audit configurations are unchanged.
- **The audit composite itself.** Its inputs, defaults, and tool
  versions are out of scope.
- **CONTRIBUTING.md.** The vulnerability rule it already records (§
  Security, the "Vulnerability audit" bullet) already covers the publish
  path. No documentation change is needed for this spec; if the design or
  plan surfaces a downstream clarification, that lands as a separate
  documentation change.
- **Native artifact signing or attestation.** Whether the published
  binaries are signed, what SBOM ships with them, and how consumers
  verify provenance are separate questions.
- **Workflow inventory or trigger surface.** No change to which
  workflows exist, which tags they fire on, or which secrets they hold.

## Success criteria

| Claim | Verifies via |
|---|---|
| The native publish pipeline runs `./.github/actions/audit` with vulnerability scanning enabled before `gh release upload` runs. | At HEAD on the implementation branch, reading `publish-native.yml` and `build-binaries.yml` shows that every code path reaching `gh release upload` has an upstream job dependency or preceding step that invokes `./.github/actions/audit` with vulnerability scanning enabled (`vulnerability-scanning: "true"` explicit, or no `with:` block so the composite default applies). No path skips the audit. |
| The audit step's prerequisites are present in the chosen job. | At HEAD on the implementation branch, the step (or upstream job) that invokes `./.github/actions/audit` is preceded by an `actions/checkout` step that gives the audit composite the workspace it scans. |
| A `>=high`-severity advisory in any workspace causes the publish to fail. | The implementation PR description records a deterministic verification trace: a temporary commit on the implementation branch adds a workspace dependency with a known `>=high` advisory, the workflow run on that commit fails at the audit step (link to the failed run), and the temporary commit is reverted before merge. |
| The implementation PR's diff does not modify any out-of-scope file. | The PR diff touches no file outside `.github/workflows/publish-native.yml`, `.github/workflows/build-binaries.yml`, and the spec/design/plan tree under `specs/1530-publish-native-audit-gate/`. Other publish workflows, the audit composite, and CONTRIBUTING.md are not modified. |

— Security Engineer 🔒
