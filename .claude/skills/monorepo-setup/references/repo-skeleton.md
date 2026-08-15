# Repo skeleton

Copy-paste seam artifacts for [monorepo-setup](../SKILL.md) Steps 1 and 2.
These are the skeleton files neither `jidoka-setup` nor `kata-setup` creates.
CI templates live in [check-workflows.md](check-workflows.md) (Step 5). The
wiki lifecycle and the ledgers live in [wiki-init.md](wiki-init.md) (Step 6).
Rename to the repo. Do not commit the lockfile until the pinned
`@forwardimpact/*` versions are published.

## Directory layout

Follow the [Monorepo standard](https://www.monorepo.team/). Create only what
the repo uses. Each shippable directory carries a `README.md` that names its
jobs.

- `products/` `services/` `libraries/` — shippable code (README each).
- `websites/` — docs hub. `infrastructure/` — deployment assets.
- `wiki/` — Kata memory in a separate checkout. `.gitignore` lists it. Never
  create it here.

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
  "scripts": { "check": "jidoka" },
  "devDependencies": { "@forwardimpact/jidoka": "^0.2.0" }
}
```

`jidoka` resolves from this devDependency. The bin ships in the product
package. There is no bare npm launcher.

## scripts/bootstrap.sh

This is the **workspace** half of the two-layer bootstrap. The installer that
puts the toolchain on `PATH` is the other half. See
[wiki-init.md](wiki-init.md). Both entry points run the installer, then this
script: the `gemba-bootstrap` composite action in every Kata workflow, and the
`SessionStart` hook in a Claude session. So every environment-setup step that
must hold in both places lives here. It does not live in the CI-only action. The
action requires this file with no guard. A repo that lacks it fails every
workflow at that step with `exit 127`.

Keep it to environment setup: install the workspace, reconstitute the APM skill
packs and agent profiles, then sync the wiki. The `apm install` step lets a repo
treat `.claude/skills/` and `.claude/agents/` as reconstitutable build output.
The repo does not have to commit them as source. The kata agent workflows
require those directories. This step is the only one that rebuilds them on a
fresh environment.

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
gemba-wiki init || echo "bootstrap: wiki init skipped" >&2
gemba-wiki pull || echo "bootstrap: wiki pull skipped" >&2
```

Commit it executable (`chmod +x scripts/bootstrap.sh`).

## Check workflows

Never use a single `check.yml`. Generate one workflow per concern. Generate at
minimum `check-quality.yml`, `check-test.yml`, and `check-context.yml`. The
templates and the SHA-pin rule live in [check-workflows.md](check-workflows.md).

## Wiki lifecycle and ledgers

The `.claude/settings.json` hooks that drive the wiki and the three named
ledgers (`Home.md`, `MEMORY.md`, `STATUS.md`) are in
[wiki-init.md](wiki-init.md).
