# Spec 1300 — svcdiscussion

## Persona and job

Hired by **Teams Using Agents** to give the bridges a single source of truth
for cross-channel discussion state — a foundation the agent team can later
query to recall what was said in any thread, from any side.

Related JTBD: *Run an autonomous, continuously improving development team
that plans, ships, studies its own traces, and acts on findings.*

## Problem

The threaded-discussion bridges (`services/ghbridge`, `services/msbridge`)
each own a private on-disk store, and the agent team cannot reach across
them.

| Concern | Where it lives today |
|---|---|
| GitHub Discussions thread state | `data/bridges/ghbridge/discussions.jsonl` written by ghbridge's in-process `DiscussionContextStore`. |
| Microsoft Teams thread state | `data/bridges/msbridge/discussions.jsonl` written by msbridge's in-process `DiscussionContextStore`. |
| Self-echo dedupe for GitHub replies | `data/bridges/ghbridge/origins.jsonl` written by ghbridge's in-process `OriginIndex`. |

Three concrete consequences fall out of that split:

1. **Records are partitioned by channel even though the schema is uniform.**
   `DiscussionContextStore.keyOf("github-discussions", id)` and
   `keyOf("msteams", id)` already share a key space, but the two files live
   under different process roots and neither bridge can read the other's
   data. A query like "show me every open conversation across all channels"
   has no place to land.
2. **Future cross-bridge agent tools cannot be built.** Recalling a thread's
   history from outside the originating bridge — for example, a Kata RFC
   summary that cites a Teams conversation — requires a callable surface
   over the shared store. The current `BufferedIndex` is a process-local
   `Map`; there is no off-process reader.
3. **`OriginIndex` is locked to one bridge.** Self-echo dedupe is the only
   thing keeping `discussion_comment.created` from feeding ghbridge's own
   replies back into the dispatch dance. As soon as another channel needs
   the same protection — or as soon as the records become interesting to
   trace queries — the index has nowhere to live except a second per-bridge
   file.

The `libbridge` invariants forbid embedding service-level logic in the
library, and `services/CLAUDE.md` mandates that "when building a product
feature that requires graph queries, vector search, pathway derivation,
trace collection, or MCP tool exposure, use the corresponding service. Do
not embed service-level logic in products." A shared store is exactly that
kind of service-level capability, and today no such service exists.

## Scope

### In scope

- A new service, `services/svcdiscussion`, owning the canonical store for
  every threaded-discussion bridge.
- One gRPC interface that exposes both kinds of records the bridges write
  today: thread-state CRUD keyed by `(channel, discussion_id)` and origin
  dedupe keyed by channel-side reply id.
- Both bridges (`services/ghbridge`, `services/msbridge`) become gRPC
  clients of the new service. Their in-process `DiscussionContextStore`
  and `OriginIndex` go away.
- A single canonical on-disk location for each kind of record:
  - `data/bridges/discussions.jsonl`
  - `data/bridges/origins.jsonl`
- The 24-hour conversation TTL and the periodic sweep for stale records
  continue to apply, owned by the service instead of by each bridge.
- `libbridge` retains only the channel-agnostic primitives that have no
  state of their own (`Acknowledgement`, `CallbackRegistry`, `Dispatcher`,
  `ResumeScheduler`, prompt/history/trigger helpers,
  `createBridgeServer`). The two store classes leave the package.
- Clean break: when the new service is in place, the per-bridge JSONL
  files at `data/bridges/{ghbridge,msbridge}/` are no longer written or
  read. No migration utility, no compatibility shim.

### Excluded

- Agent-facing tool surfaces that read the store (cross-bridge lookup,
  history recall in prompts, MCP tools over `service.mcp`). Foundation
  only; the tool catalogue is a follow-up.
- Any change to the kata-dispatch workflow contract, the callback payload
  shape, the suspend/resume trigger model, or the
  `(prompt, callback_url, correlation_id, discussion_id)` workflow inputs.
- Any change to channel adapters: GitHub GraphQL strings stay in
  `services/ghbridge/src/graphql.js`; Bot Framework intake stays in
  `services/msbridge/src/teams.js`.
- Adding a third bridge or a third channel.
- Removing the existing in-flight conversations from the two
  per-bridge files. They expire under their own 24-hour TTL.
- Persisting the `CallbackRegistry` token map in the service. It remains
  process-local on each bridge.

## Success criteria

| Claim | Verifies via |
|---|---|
| A `services/svcdiscussion` service exists with the same structural shape as the other gRPC services. | `ls services/svcdiscussion/{server.js,index.js,proto,test}` lists each entry. |
| The service exposes both record kinds — thread state and origin dedupe — on a single gRPC surface. | The proto definition declares one service whose methods cover loading, saving, and sweeping discussions and recording and checking origin reply ids. |
| Both bridges depend on the service through generated clients, not on the removed library classes. | `grep -E "DiscussionContextStore\|OriginIndex" services/{ghbridge,msbridge}/` returns empty; the bridges import a discussion client from the generated services. |
| The two store classes are gone from `libbridge`. | `ls libraries/libbridge/src/{discussion-context,origin-index}.js` reports both files absent. |
| `libbridge` still exports the channel-agnostic primitives the bridges compose. | `Acknowledgement`, `CallbackRegistry`, `Dispatcher`, `ResumeScheduler`, `createBridgeServer`, the prompt and trigger helpers, and `newDiscussionContext` are still re-exported from `libraries/libbridge/src/index.js`. |
| Discussion state from both channels lands in one file, origins in another. | After exercising both bridges end-to-end against the service, `data/bridges/discussions.jsonl` contains records with both `github-discussions:…` and `msteams:…` ids; `data/bridges/origins.jsonl` is the only origin file on disk. |
| The per-bridge files are no longer written. | After end-to-end exercise, `data/bridges/ghbridge/` and `data/bridges/msbridge/` contain no `discussions.jsonl` or `origins.jsonl`. |
| The 24-hour conversation TTL is honoured by the service. | A test that seeds a record with `last_active_at` older than 24 hours and triggers a sweep observes the record removed. |
| The service is supervised the same way as other gRPC services. | `config/config.json` (or the starter `starter/config.json` consumed by `fit-rc`) lists `svcdiscussion` under `init.services`. |
| ghbridge's self-echo dedupe still suppresses inbound webhooks for replies the bridge just posted. | An integration test posts a reply through ghbridge, replays the resulting `discussion_comment.created` webhook, and observes no dispatch. |
| msbridge's resume-from-recess flow still finds the right thread state after restart. | An integration test enters a recess, restarts msbridge, fires the inbound activity that satisfies the trigger, and observes a fresh dispatch. |
| `libbridge/CLAUDE.md` reflects the new boundary. | The "Invariants" and "What lives where" sections no longer claim that `DiscussionContextStore` belongs to the library, and they direct readers to `services/svcdiscussion` for the persisted state. |
