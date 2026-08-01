# Check workflows

Copy-paste CI for [monorepo-setup](../SKILL.md) Step 5. These check workflows
run on push and on pull request. Use one workflow per concern. Never use a
single `check.yml`. A failed format run and a failed test run must read as two
distinct red checks. Add concerns (build, data, security) as the repo grows.

All workflows share the same trigger and least-privilege permission. Pin every
action by SHA. Run `gh api repos/<action>/git/ref/tags/<tag>` to resolve `<sha>`
when you generate the workflow. The `github-actions` Dependabot entry
`kata-setup` adds keeps the pins fresh. Commands are the repo's own scripts
(`npm run format`, `npm test`, …). Adjust names to the root `package.json`.

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

`jidoka-setup` assumes this workflow. It wires `jidoka` into the check task.
It never adds CI. Use one job per `jidoka` subcommand. A layered-instruction
breach, a stale JTBD block, and an invariant violation then each surface as
their own red check.

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
      - run: npx @forwardimpact/jidoka instructions

  jtbd:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
      - uses: actions/setup-node@<sha> # v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npx @forwardimpact/jidoka jtbd

  invariants:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4
      - uses: actions/setup-node@<sha> # v4
        with: { node-version: "22" }
      - run: npm ci
      - run: npx @forwardimpact/jidoka invariants
```

## Why the wiki audit is not a check here

`gemba-wiki audit` reads the live, shared wiki. Its verdict depends on the
current wiki state. The PR head does not affect it. It would redden a clean
commit whenever the shared wiki is dirty. It would also flip on re-run with no
code change. Keep it out of the per-PR gate. A scheduled curation run owns
live-wiki findings and routes them to one curation issue (see `kata-setup`). A
commit-status check may verify only surfaces the PR's diff fully determines.
