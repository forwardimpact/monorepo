# Spec 1300 — svcdiscussion

## Persona and job

Hired by **Teams Using Agents** to give the threaded-discussion bridges
a single source of truth for cross-channel state — a foundation the
agent team can later query to recall what was said in any thread, from
any side.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)).

## Problem

The threaded-discussion bridges (`services/ghbridge`, `services/msbridge`)
each own a private on-disk store, and the agent team cannot reach across
them.

| Concern | How it is held today |
|---|---|
| GitHub Discussions thread state | A per-process discussion store inside `services/ghbridge`. |
| Microsoft Teams thread state | A separate per-process discussion store inside `services/msbridge`. |
| Self-echo dedupe for GitHub replies | A per-process origin index inside `services/ghbridge`. |

Three concrete consequences fall out of that split:

1. **Records are partitioned by process even though the schema is
   uniform.** The two bridges already agree on a single key space —
   that is what lets the channel-agnostic `kata-dispatch.yml` workflow
   resume a conversation from either side — but the records themselves
   live behind different process roots and neither bridge can read the
   other's data. A query like "show me every open conversation across
   all channels" has no place to land.
2. **Future cross-bridge agent tools cannot be built.** Recalling a
   thread's history from outside the originating bridge — for example,
   a Kata RFC summary that cites a Teams conversation — requires a
   callable surface over the shared store. Today both stores are
   in-process state in their respective bridges; nothing outside the
   bridge can read them.
3. **Origin dedupe has no shared home.** Self-echo dedupe is the only
   thing keeping `discussion_comment.created` from feeding ghbridge's
   own replies back into the dispatch dance, and it currently runs only
   in ghbridge (the Microsoft Teams adapter does not echo bot messages,
   so msbridge does not need it today). The record kind is already
   channel-agnostic in shape; placing it next to the discussion store
   keeps both kinds of records under one lifecycle.

The `libbridge` invariants forbid embedding service-level logic in the
library, and `services/CLAUDE.md` mandates that service-level
capabilities be reached through services, not embedded in callers. A
shared store is exactly that kind of service-level capability, and
today no such service exists.

## Scope

### In scope

- A new service, `services/svcdiscussion`, owning the canonical store
  for every threaded-discussion bridge.
- A single service interface that exposes both kinds of records the
  bridges write today — discussion state keyed by
  `(channel, discussion_id)` and origin dedupe keyed by channel-side
  reply id — plus the operations the bridges actually need: load a
  discussion by channel, upsert a discussion record, check existence by
  origin id, record an origin id, and trigger a sweep of expired
  records.
- Both bridges (`services/ghbridge`, `services/msbridge`) become
  clients of the new service. Their in-process discussion-store and
  origin-index classes go away.
- One canonical on-disk location for each kind of record, owned and
  written exclusively by the service:
  `data/bridges/discussions.jsonl` and `data/bridges/origins.jsonl`.
- The 24-hour conversation TTL and the periodic sweep of stale records
  move from per-bridge timers into the service.
- `libbridge` retains only the channel-agnostic primitives that have
  no shared state of their own — the acknowledgement and
  callback-handling primitives, the dispatcher, the resume scheduler,
  the rate limiter, the prompt/history/trigger helpers, and the bridge
  HTTP wiring. The discussion-store and origin-index classes leave the
  package. The record factory and payload validator stay because the
  bridges still construct the record locally before sending it to the
  service.
- The persisted record shape is unchanged, including the per-record
  `pending_callbacks` map that pairs callback tokens with correlation
  ids across restarts. The in-memory callback-token registry the
  dispatcher uses on the hot path stays process-local on each bridge.
- Clean break: when the new service is in place, no code reads or
  writes the per-bridge JSONL files at `data/bridges/{ghbridge,msbridge}/`.
  No migration utility, no compatibility shim. Any conversations
  in flight at cutover become un-resumable on the new service; the
  legacy files expire under their existing 24-hour TTL on disk and are
  ignored thereafter.

### Excluded

- Agent-facing tool surfaces that read the store (cross-bridge lookup,
  history recall in prompts, MCP tools over `service.mcp`). Foundation
  only; the tool catalogue is a follow-up.
- Any change to the kata-dispatch workflow contract, the callback
  payload shape, the suspend/resume trigger model, or the
  `(prompt, callback_url, correlation_id, discussion_id)` workflow
  inputs.
- Any change to channel adapters: GitHub GraphQL strings stay in
  `services/ghbridge/src/graphql.js`; Bot Framework intake stays in
  `services/msbridge/src/teams.js`.
- Adding a third bridge or a third channel.

## Success criteria

| Claim | Verifies via |
|---|---|
| A `services/svcdiscussion` service exists and follows the structural conventions documented in `services/CLAUDE.md`. | The service directory contains a server entry point, an implementation module, a proto definition, and a test directory at the conventional locations for a service. |
| The service exposes both record kinds — thread state and origin dedupe — on one service interface. | The proto definition declares a single service whose RPC methods cover loading a discussion by channel, upserting a discussion record, checking and recording origin reply ids, and triggering a sweep. |
| Neither bridge contains a reference to the removed in-process store types. | A repository-wide search across `services/ghbridge/` and `services/msbridge/` returns no occurrences of either removed type name. |
| The store and origin classes are gone from `libbridge`. | The `@forwardimpact/libbridge` package no longer exports the two types, and the package source no longer contains either implementation module. |
| `libbridge` still exports every other symbol the bridges currently import from it. | Every symbol that `services/ghbridge` and `services/msbridge` import from `@forwardimpact/libbridge` today, except the two removed types, is still importable after the change. |
| Discussion state from both channels lands in one file; origins in another. | After both bridges exchange at least one message with the agent team, `data/bridges/discussions.jsonl` contains records with both `github-discussions:…` and `msteams:…` ids, and `data/bridges/origins.jsonl` is the only origin file on disk. |
| The per-bridge files are no longer written. | After end-to-end exercise, the directories `data/bridges/ghbridge/` and `data/bridges/msbridge/` contain no `discussions.jsonl` or `origins.jsonl`. |
| The 24-hour conversation TTL is honoured by the service. | A test seeds a record whose last activity is older than 24 hours, lets the periodic sweep run, and observes the record removed from a subsequent load. |
| The service is supervised the same way as peer gRPC services. | The starter configuration that ships with the products bundling these services lists `svcdiscussion` alongside the existing supervised services. |
| ghbridge's self-echo dedupe still suppresses inbound webhooks for replies the bridge just posted. | An integration test posts a reply through ghbridge, replays the resulting `discussion_comment.created` webhook, and observes no dispatch. |
| msbridge's resume-from-recess flow still finds the right thread state after restart. | An integration test enters a recess, restarts msbridge, fires the inbound activity that satisfies the trigger, and observes a fresh dispatch. |
| `libbridge` documentation reflects the new ownership boundary. | The `libbridge` package documentation no longer claims ownership of the persisted discussion or origin state and directs readers to the new service for that state. |
