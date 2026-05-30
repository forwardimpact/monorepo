# Bridge Service

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Canonical threaded-discussion store — single source of truth for
GitHub/Microsoft Teams bridge state.

<!-- END:description -->

## Records

| Kind | File | Key |
|---|---|---|
| Discussion | `data/bridges/discussions.jsonl` | `<channel>:<discussion_id>` |
| Origin | `data/bridges/origins.jsonl` | `<comment_node_id>` |
| Inbox | `data/bridges/inbox.jsonl` | `<correlation_id>:<seq>` |

## Service supervision

If you supervise `ghbridge` or `msbridge` via `fit-rc`, list `bridge`
ahead of the bridge entries in `init.services` so
`createClient('bridge', …)` resolves at startup.

## Configuration

All keys live under `SERVICE_BRIDGE_*`:

| Key | Default | Description |
|---|---|---|
| `discussion_flush_interval_ms` | `5000` | Discussion index flush interval |
| `discussion_max_buffer_size` | `1000` | Discussion index buffer limit |
| `origin_flush_interval_ms` | `1000` | Origin index flush interval |
| `origin_max_buffer_size` | `100` | Origin index buffer limit |
| `conversation_ttl_ms` | `86400000` | Discussion TTL (24 h) |
| `origin_ttl_ms` | `86400000` | Origin TTL (24 h) |
| `sweep_interval_ms` | `60000` | Periodic sweep cadence |
