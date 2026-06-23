# Repo skeleton

Copy-paste seam artifacts for [monorepo-setup](../SKILL.md) Steps 1, 2, and 5 —
the files neither `coaligned-setup` nor `kata-setup` creates. Rename to the
repo; do not commit the lockfile until the pinned `@forwardimpact/*` versions
are published.

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

## .github/workflows/check.yml

```yaml
name: check
on:
  push: { branches: [main] }
  pull_request:
permissions: { contents: read }
jobs:
  coaligned:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
      - uses: actions/setup-node@<sha> # v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npx coaligned
```

Resolve `<sha>` for each action at generation time (`gh api
repos/<action>/git/ref/tags/<tag>`) and pin it. The `github-actions` Dependabot
entry that `kata-setup` adds keeps these pins fresh.
