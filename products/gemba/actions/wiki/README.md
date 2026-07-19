# gemba-wiki

GitHub composite action that runs a [`gemba-wiki`](https://github.com/forwardimpact/monorepo)
agent-memory command in CI.

Long agent jobs outlive the one-hour lifetime of the GitHub App installation
token minted at job start, so pushing the wiki back during cleanup fails
authentication. This action mints a **fresh** installation token immediately
before running the command, and runs as an ordinary `always()` step after the
agent — so memory is flushed reliably regardless of run length or outcome.

## Usage

Run after `forwardimpact/bootstrap@v1` (which sets up Bun, the workspace,
and the checked-out `./wiki` working copy):

```yaml
- if: always()
  uses: forwardimpact/wiki@v1
  with:
    command: push
    app-id: ${{ secrets.KATA_APP_ID }}
    app-private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}
```

Read-only / local commands need no credentials:

```yaml
- uses: forwardimpact/wiki@v1
  with:
    command: audit
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `command` | yes | — | `gemba-wiki` subcommand and args, appended to the resolved CLI (local install, else `bunx --package=@forwardimpact/libwiki gemba-wiki`) |
| `app-id` | no | `""` | GitHub App ID; with `app-private-key`, mints a fresh token as `GH_TOKEN` |
| `app-private-key` | no | `""` | GitHub App private key for fresh-token minting |
| `wiki-path` | no | `wiki` | Path to the checked-out wiki working copy |
