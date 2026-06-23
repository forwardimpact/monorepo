# Check workflows

Copy-paste CI for [monorepo-setup](../SKILL.md) Step 5 — the check workflows
that run on push and pull request. One workflow per concern, never a single
`check.yml`: a failing format run and a failing test run must read as two
distinct red checks. Add concerns (build, data, security) as the repo grows.

All share the same trigger and least-privilege permission, and pin every action
by SHA — resolve `<sha>` at generation time (`gh api
repos/<action>/git/ref/tags/<tag>`); the `github-actions` Dependabot entry
`kata-setup` adds keeps the pins fresh. Commands are the repo's own scripts
(`npm run format`, `npm test`, …); adjust names to the root `package.json`.

## .github/workflows/check-quality.yml

```yaml
name: Quality

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
      - uses: actions/setup-node@<sha> # v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npm run format

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
      - uses: actions/setup-node@<sha> # v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npm run lint
```

## .github/workflows/check-test.yml

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
      - uses: actions/setup-node@<sha> # v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npm test
```

## .github/workflows/check-context.yml

This is the workflow `coaligned-setup` assumes: it wires `coaligned` into the
check task but never adds CI. One job per `coaligned` subcommand so a layered
instruction breach, a stale JTBD block, and an invariant violation each surface
as their own red check.

```yaml
name: Context

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  instructions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
      - uses: actions/setup-node@<sha> # v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npx coaligned instructions

  jtbd:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
      - uses: actions/setup-node@<sha> # v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npx coaligned jtbd

  invariants:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
      - uses: actions/setup-node@<sha> # v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npx coaligned invariants
```

## Why the wiki audit is not a check here

`fit-wiki audit` reads the live, shared wiki, so its verdict is a function of
the current wiki state, not the PR head — it would redden a clean commit
whenever the shared wiki happens to be dirty, and flip on re-run with no code
change. Keep it out of the per-PR gate. A scheduled curation run owns live-wiki
findings and routes them to a single curation issue (see `kata-setup`). A
commit-status check may verify only surfaces the PR's diff fully determines.
