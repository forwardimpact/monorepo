# Repo skeleton

Copy-paste seam artifacts for [monorepo-setup](../SKILL.md) Steps 1 and 2 — the
skeleton files neither `coaligned-setup` nor `kata-setup` creates. CI templates
live in [check-workflows.md](check-workflows.md) (Step 5); the wiki lifecycle
and ledgers in [wiki-init.md](wiki-init.md) (Step 6). Rename to the repo; do not
commit the lockfile until the pinned `@forwardimpact/*` versions are published.

## Directory layout

Per MONOREPO.md. Create only what the repo will use; each shippable directory
carries a `README.md` naming its jobs.

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

## Check workflows

Never a single `check.yml`. Generate one workflow per concern — at minimum
`check-quality.yml`, `check-test.yml`, and `check-context.yml`. Templates and
the SHA-pinning rule are in [check-workflows.md](check-workflows.md).

## Wiki lifecycle and ledgers

The `.claude/settings.json` hooks that drive the wiki and the three named
ledgers (`Home.md`, `MEMORY.md`, `STATUS.md`) are in
[wiki-init.md](wiki-init.md).
