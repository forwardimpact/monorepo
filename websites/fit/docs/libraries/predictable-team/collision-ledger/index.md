---
title: Allocate Collision-Ledger Entries for Parallel Work
description: Assign stable ids to parallel work without merge collisions — anchored on an append-only issue thread, projected onto a ledger page only when you rebuild.
---

When two agents work in parallel, they need stable, non-colliding ids for the
things they coordinate over — overlapping occurrences, near-misses, folds. If
each one writes its id straight onto a shared markdown page, the two writes
collide at merge time and one id silently overwrites the other. The collision
ledger removes that race: identity is allocated on an append-only issue thread,
where GitHub serializes every comment and assigns a monotonic id, and the shared
page is only ever a projection you rebuild from that thread.

This guide covers allocating an id at an anchor, rebuilding the ledger page and
memory row from the anchor record, and verifying the projection still matches.
It assumes the wiki is already set up — see
[Set Up Persistent Memory and Metrics](/docs/libraries/predictable-team/).

## Prerequisites

- Node.js 22+
- A wiki already initialized in your project
- `GITHUB_TOKEN` or `GH_TOKEN` set, or a logged-in `gh` CLI — the ledger reads
  and writes an issue's comment thread over the GitHub API

## How allocation stays collision-free

Allocation is **publish-an-anchor**, not **write-the-page**. An anchor is one
append-only comment on a coordination issue carrying a small fenced block:

```yaml alloc
kind: occ
ids: ["#97", "#98"]
event: 7d0f8bca
note: dual-execution episode
```

The durable key is `event` — a commit SHA or a prior anchor id. The `ids` are
display labels only, so relabeling later is lossless. Because GitHub assigns
each comment a monotonic id, the comment order is an allocation order no merge
can erase: when two sessions race for the same label, the lowest comment id
wins, first-published-wins. Nothing is written to the ledger page at allocation
time, so the contested page never participates in the race.

Each anchor has one of four kinds:

| Kind   | Used for                                |
| ------ | --------------------------------------- |
| `occ`  | An overlapping occurrence.              |
| `nm`   | A near-miss.                            |
| `fold` | A fold of prior allocations.            |
| `meta` | A meta-level allocation.                |

## Allocating an id

Mint the next free id of a kind, keyed to a durable event:

```sh
npx gemba-wiki ledger allocate --kind occ --event 7d0f8bca --note "dual-execution episode"
```

```text
#97
```

The command prints the provisional id it minted. To allocate several at once:

```sh
npx gemba-wiki ledger allocate --kind occ --count 2 --event 7d0f8bca
```

```text
#97 #98
```

The printed ids are provisional. A later `rebuild` over the published comment
sequence is authoritative — it resolves any concurrent interleave
first-published-wins, so two racing allocations never keep the same label.

### Backfilling an id that predates the ledger

For ids that already exist in history but were never anchored, register them
explicitly instead of minting new ones:

```sh
npx gemba-wiki ledger allocate --kind occ --ids "#42,#43" --event a1b2c3d4
```

If any named id already has an anchor, the command refuses rather than
double-registering it.

### Allocation options

| Flag        | Required | Description                                                  |
| ----------- | -------- | ------------------------------------------------------------ |
| `--kind`    | Yes      | `occ`, `nm`, `fold`, or `meta`.                              |
| `--event`   | Yes      | Durable key for the allocation — a SHA or a prior anchor id. |
| `--count`   | No       | How many ids to mint (default 1).                            |
| `--ids`     | No       | Comma-separated ids to backfill, instead of `--count`.       |
| `--note`    | No       | Free-text note recorded on the anchor.                       |
| `--issue`   | No       | Anchor issue number (defaults to the coordination issue).    |

## Rebuilding the projection

The ledger page and the memory row are projections of the anchor record. After
new anchors are published, rebuild them from the authoritative thread:

```sh
npx gemba-wiki ledger rebuild
```

```text
rebuilt: 12 ids, 0 double-allocation(s)
```

`rebuild` reads the full anchor sequence, folds it (resolving any double
allocation first-published-wins), and writes the result to the ledger page and
the memory row, preserving any prose you have written against an anchor. If the
prose cites an anchor that no longer exists, the command warns:

```text
warning: prose cites missing anchors: #44
```

By default, a double-allocation loser is renumbered. To render it as a gap
instead — keeping the original numbering visible — pass `--gapped`.

## Verify

Confirm the projection matches the anchor record without writing anything:

```sh
npx gemba-wiki ledger verify
```

```text
verify: clean
```

`verify` re-projects the anchor record and compares it against the ledger page
and the memory row. When they diverge it lists the problems and exits non-zero:

```text
verify: ledger page diverges from the anchor record; MEMORY row diverges from the anchor record
```

The fix is to run `rebuild`, which re-projects both surfaces, then `verify`
again to confirm they agree.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../wiki-operations -->
<!-- part:card:../wiki-integrity -->

</div>
