# gemba-wiki

GitHub composite action that runs a [`gemba-wiki`](https://github.com/forwardimpact/monorepo)
agent-memory command in CI.

Long agent jobs outlive the one-hour lifetime of the GitHub App installation
token minted at job start. So a cleanup step that pushes the wiki back fails
authentication. This action mints a **fresh** installation token immediately
before it runs the command. It runs as an ordinary `always()` step after the
agent. It flushes memory reliably, whatever the run length or outcome.

## Usage

Run after `forwardimpact/gemba-bootstrap@v1` (which sets up Bun, the workspace,
and the checked-out `./wiki` working copy):

```yaml
- if: always()
  uses: forwardimpact/gemba-wiki@v1
  with:
    command: push
    app-id: ${{ secrets.KATA_APP_ID }}
    app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
```

Read-only / local commands need no credentials:

```yaml
- uses: forwardimpact/gemba-wiki@v1
  with:
    command: audit
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `command` | yes | — | `gemba-wiki` subcommand and args that the action appends to the `gemba-wiki` gear binary on `PATH` |
| `app-id` | no | `""` | GitHub App ID. With `app-private-key` it mints a fresh token as `GH_TOKEN` |
| `app-private-key` | no | `""` | GitHub App private key the action uses to mint a fresh token |
| `wiki-path` | no | `wiki` | Path to the checked-out wiki working copy |
