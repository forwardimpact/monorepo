# State Script Reference

`req-scan` uses `node scripts/state.mjs <command> [args]` for **all** state-file
operations. Do **not** write bespoke scripts to update cursor, seen, prospects,
failures, or log files.

## Cursor (source rotation)

```bash
node scripts/state.mjs cursor list
node scripts/state.mjs cursor get github_open_to_work
node scripts/state.mjs cursor set github_open_to_work "2026-03-09T22:00:00Z" "UK-done_next:Europe"
```

## Seen (deduplication)

```bash
# exit 0 = seen, 1 = new
node scripts/state.mjs seen check github_open_to_work mxmxmx333

node scripts/state.mjs seen add github_open_to_work mxmxmx333
node scripts/state.mjs seen batch github_open_to_work id1 id2 id3 id4
```

## Prospects

```bash
node scripts/state.mjs prospect add "Hasan Cam" github_open_to_work strong "J060-J070 platform"
node scripts/state.mjs prospect list --limit 10
node scripts/state.mjs prospect count
```

## Failures

```bash
# Source selection — skip if ≥ 3
node scripts/state.mjs failure get mastodon_hachyderm

node scripts/state.mjs failure increment mastodon_hachyderm
node scripts/state.mjs failure reset github_open_to_work
```

## Logs

```bash
node scripts/state.mjs log-wake github_open_to_work "Primary query: 'open to work' location:UK — 30 results, 2 new prospects"
node scripts/state.mjs log "Manual note about source rotation"
```

## Summary

```bash
node scripts/state.mjs summary
```
