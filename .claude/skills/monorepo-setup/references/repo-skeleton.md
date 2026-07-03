# Repo skeleton

Copy-paste seam artifacts for [monorepo-setup](../SKILL.md) Steps 1 and 2 — the
skeleton files neither `coaligned-setup` nor `kata-setup` creates. CI templates
live in [check-workflows.md](check-workflows.md) (Step 5); the wiki lifecycle
and ledgers in [wiki-init.md](wiki-init.md) (Step 6). Rename to the repo; do not
commit the lockfile until the pinned `@forwardimpact/*` versions are published.

## Directory layout

Per the [Monorepo standard](https://www.monorepo.team/). Create only what the
repo will use; each shippable directory carries a `README.md` naming its jobs.

- `products/` `services/` `libraries/` — shippable code (README each).
- `websites/` — docs hub. `infrastructure/` — deployment assets.
- `wiki/` — Kata memory, a separate checkout; gitignored, never created here.

## .gitignore

```gitignore
node_modules/
.env
*.log
wiki/             # Kata memory: separate checkout, cloned on demand
dist/
build/
generated/
apm_modules/      # APM writes this on first install
```

## package.json

```json
{
  "name": "<repo>",
  "version": "0.0.0",
  "private": true,
  "workspaces": [
    "products/*/cli",
    "products/*/site",
    "products/*/handlers",
    "libraries/*"
  ],
  "scripts": { "check": "coaligned" },
  "devDependencies": { "@forwardimpact/libcoaligned": "^0.1.15" }
}
```

`coaligned` resolves from this devDependency — there is no bare npm launcher.
Pin a version whose budgets exempt YAML frontmatter (0.1.15+); published skill
packs carry publish-injected frontmatter that otherwise breaches the caps.

## scripts/bootstrap.sh

This is the **workspace** half of the two-layer bootstrap (the installer that
puts the toolchain on `PATH` is the other half — see
[wiki-init.md](wiki-init.md)). Both entry points run installer-then-this-script
in the same order: the `bootstrap` composite action in every Kata workflow, and
the `SessionStart` hook in a Claude session. So every environment-setup step
that must hold in both places lives here, not in the CI-only action. The action
requires this file with no guard — a repo missing it fails every workflow at
that step with `exit 127`.

Keep it to environment setup: install the workspace, reconstitute the APM skill
packs and agent profiles, then sync the wiki. The `apm install` step is what
lets a repo treat `.claude/skills/` and `.claude/agents/` as reconstitutable
build output rather than committed source — the kata agent workflows require
those present, and this is the only step that rebuilds them on a fresh
environment.

```sh
#!/usr/bin/env bash
set -euo pipefail

# Install workspace dependencies with the repository's install command.
<install-command>

# Reconstitute the APM skill packs + agent profiles when this repo uses APM.
if [ -f apm.yml ] || [ -f apm.lock.yaml ]; then
  apm install
fi

# Sync agent memory. Non-fatal so a missing or empty wiki never blocks CI.
npx fit-wiki init || echo "bootstrap: wiki init skipped" >&2
npx fit-wiki pull || echo "bootstrap: wiki pull skipped" >&2
```

Commit it executable (`chmod +x scripts/bootstrap.sh`).

## Check workflows

Never a single `check.yml`. Generate one workflow per concern — at minimum
`check-quality.yml`, `check-test.yml`, and `check-context.yml`. Templates and
the SHA-pinning rule are in [check-workflows.md](check-workflows.md).

## Wiki lifecycle and ledgers

The `.claude/settings.json` hooks that drive the wiki and the three named
ledgers (`Home.md`, `MEMORY.md`, `STATUS.md`) are in
[wiki-init.md](wiki-init.md).
