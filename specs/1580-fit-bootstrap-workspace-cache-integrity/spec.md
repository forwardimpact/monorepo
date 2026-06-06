# Spec 1580 — `fit-bootstrap` environment cache integrity

## Persona and job

Hired by **Teams Using Agents** to keep the 3×/day cadence moving on
routine dependency updates by closing a cache-restore path that lets a
single bad environment tree propagate across every subsequent
Dependabot lockfile bump.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)).

## Problem

The `forwardimpact/fit-bootstrap` composite action exposes a single
environment cache (the action step named `Restore environment cache`)
covering the CLI tooling tree, `node_modules`, and the generated
codegen tree. Its key hashes the lockfile and the codegen inputs; when
the key matches exactly, the cache restore is sound — both sides agree
on what the resolved tree should look like. The key also falls back via
a `restore-keys` prefix so that lockfile-changing PRs can seed a
near-recent cache and reduce cold-install time.

That fallback is the defect surface.
[Issue #1458](https://github.com/forwardimpact/monorepo/issues/1458)
records what happens on a PR that bumps the lockfile while the
exact-key cache is cold and the prefix-key cache is warm: the action
restores an environment tree written from a *different* resolved tree,
and the workspace then carries a partial nested layout into the install
step. The observed instance is the `eslint` 10.4.0 → 10.4.1 bump, where
the nested `ajv@6` dependency that `eslint`'s shared adapter requires
at a literal path is missing from the restored tree (file-level
reproduction recorded in #1458); the `Quality/jsdoc` check then fails
on a missing `json-schema-draft-04.json`. The failure reproduces
deterministically on fresh CI runs of PR
[#1457](https://github.com/forwardimpact/monorepo/pull/1457), and a
clean local `rm -rf node_modules && bun install` from the same branch
passes — isolating the failure to the cache-restore path rather than
the lockfile.

The damage compounds across PRs. Each lockfile-changing PR runs the
fallback path, writes its (broken) tree back to the cache, and supplies
the next PR with the same broken seed.

### Why this is structural, not transient

The cache key already content-addresses what the cache is supposed to
hold: it hashes the lockfile and the codegen inputs that determine the
resolved tree. An exact-key miss therefore signals that the resolved
tree is *new*. The `restore-keys` fallback then restores a *different*
tree under the new key, and the install step has to reconcile that
mismatch in place. Issue #1458 demonstrates the partial tree surviving
the reconcile attempt for at least one nested-layout shift; the
generalisation to "future bumps with a different nested-layout shift"
follows from the contract that admits the mismatch, not from the
particular package — the same prefix-key fallback into a
content-addressed cache will admit any future tree that diverges from
the new key.

### Scope alignment with spec 1310

[Spec 1310](../1310-sha-pin-sibling-actions/spec.md) ratified the
sibling-composite supply-chain hygiene surface; this spec is adjacent
rather than co-extensive. 1310 closes the *reference* side (mutable tag
vs SHA); 1580 closes the *content* side (cache restore that perpetuates
a partial tree). Both reduce the rate at which a single bad state
propagates across the cadence, by different mechanisms.

### Ordering dependency on spec 1310

This spec depends on spec 1310 having shipped first. The monorepo
consumes `forwardimpact/fit-bootstrap` via workflow `uses:` references;
propagating the contract change to the monorepo CI requires advancing
those references to a sibling-repo commit that carries the change.
Under 1310 the references are SHA-pinned, and advancing means a
SHA-bump PR — the durable propagation path. Without 1310 the
references would be `@v1` and advancing would require force-moving the
sibling's `v1` tag — exactly the procedure 1310 retires. The two specs
are therefore sequenced: 1310 ships, then 1580.

### Why this spec follows the immediate prefix bump

The release engineer is shipping an in-place cache-key-prefix bump on
the action to evict today's poisoned cache and unblock PR #1457 on the
next CI run. That bump is the right immediate move: it clears the
visible symptom without authoring over the structural answer. This
spec is the follow-up that keeps the next lockfile-changing bump from
re-running the same thread.

## Scope

### In scope

- The `forwardimpact/fit-bootstrap` composite action's environment-cache
  contract: the `Restore environment cache` step restores the cache on
  exact-key match or leaves the cache untouched, with no fallback
  restore path under any other key.
- A note in the sibling repo's `README.md` recording the exact-key
  contract and linking to this spec for rationale.
- Advancing every `forwardimpact/fit-bootstrap` SHA pin in the
  monorepo's workflow `uses:` references (the set spec 1310's
  implementation pins) to a sibling-repo commit that carries the
  contract change, so the monorepo CI actually consumes the new
  contract.

### Excluded

- **The in-place cache-key-prefix bump on the action.** That bump is
  the release engineer's unblocking move for PR #1457 and ships ahead
  of this spec; it is not part of the structural follow-up and this
  spec does not re-author it.
- **The monorepo's `scripts/bootstrap.sh`.** The environment-cache
  contract lives on the action side, and this spec changes the contract
  there.
- **The action's cache-write path.** Removing the fallback restore is
  the only contract change; the action keeps writing the cache under
  the same key it computes today, and the next cold-cycle run writes
  back a tree resolved from the lockfile (closing the
  cross-cycle-poisoning loop without touching the write path).
- **The cache-key composition.** The key continues to hash the same
  inputs it hashes today; the change is in fallback semantics, not key
  composition.
- **The other sibling actions** (`kata-agent`, `fit-eval`, `fit-wiki`,
  `fit-benchmark`, enumerated in [spec 1310](../1310-sha-pin-sibling-actions/spec.md)).
  Whether any of them expose a similar fallback surface is a follow-up
  audit, owned by the security engineer per the sibling-supply-chain
  surface 1310 already tracks.
- **Cache-restore behaviour for non-environment artefacts in consuming
  workflows.** The contract this spec changes governs only the cache
  the action owns.

### Consumer impact

External consumers of `forwardimpact/fit-bootstrap@v1` continue to
receive an action whose environment cache restores on exact-key match;
on any key change, the install step runs against an empty environment
and resolves the lockfile from scratch. Cold-cycle install time on
lockfile-changing PRs is the trade for cross-cycle tree integrity; the
action's inputs, outputs, and step ids are otherwise unchanged.

## Success criteria

| Claim | Verifies via |
|---|---|
| The sibling action's `Restore environment cache` step on the contract-change commit has no `restore-keys` input. | At the sibling-repo commit that lands the contract change, the action's `action.yml` declaration for the step whose `id: env-cache` contains no key named `restore-keys`. |
| The cache-key composition on that commit is unchanged. | At the same commit, the `key` input on the `env-cache` step hashes the same set the pre-change action hashes: `scripts/install-deps.sh`, `bun.lock`, `**/*.proto`, `libraries/libcodegen/src/**`, `libraries/libcodegen/templates/**`, `libraries/libcodegen/bin/**`. |
| The contract change is documented at a named entry point in the sibling repo. | The sibling repo's `README.md` on the contract-change commit names the environment cache as exact-key-restore-only and links to spec 1580. |
| The monorepo's references to `forwardimpact/fit-bootstrap` consume the contract change. | After this spec's monorepo PR merges, every workflow `uses:` reference to `forwardimpact/fit-bootstrap` in `.github/workflows/*.yml` resolves to a sibling-repo commit that satisfies the first three criteria above. |
| The monorepo's `scripts/bootstrap.sh` is unchanged. | `scripts/bootstrap.sh` on `main` after this spec's monorepo PR merges is byte-identical to its pre-change state. |
| The implementation cycle stays bounded to the two repos this spec names. | The implementation diff outside the sibling repo's `action.yml` and `README.md`, the monorepo's `.github/workflows/*.yml` `uses:` references to `forwardimpact/fit-bootstrap`, and the monorepo's `specs/1580-fit-bootstrap-workspace-cache-integrity/` spec tree is empty. |

— Product Manager 🌱
