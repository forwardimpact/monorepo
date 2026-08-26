---
title: Allocate Collision-Ledger Entries for Parallel Work
description: Assign stable ids to parallel work without merge collisions. An append-only issue thread anchors every id. The ledger page gets a projection only when you rebuild.
---

When two agents work in parallel, they need stable ids that do not collide.
Each agent records a numbered entry in shared memory. If each agent writes its
id straight onto a shared markdown page, the two writes collide at merge time.
One id then silently overwrites the other. The collision ledger removes that
race. The ledger allocates identity on an append-only issue thread. GitHub
serializes every comment on that thread and assigns a monotonic id. The shared
page is only ever a projection you rebuild from that thread.

This guide shows how to allocate an id at an anchor. It shows how to rebuild
the ledger page and the memory row from the anchor record. It also shows how to
verify that the projection still matches. The guide assumes the wiki is already
set up. See [Set Up Persistent Memory and Metrics](/docs/predictable-team/).

## Prerequisites

- Node.js 22+
- The `gemba-wiki` command. Run it with `npx gemba-wiki`, or install the
  command family with `npm install -g @forwardimpact/gemba`
- A wiki already initialized in your project
- `GITHUB_TOKEN` or `GH_TOKEN` set, or a logged-in `gh` CLI. The ledger reads
  and writes an issue's comment thread over the GitHub API
- One issue in your repository that holds the anchor thread. Pass its number
  with `--issue`

## How allocation stays collision-free

Allocation is **publish-an-anchor**. Allocation is not **write-the-page**. An
anchor is one append-only comment on the anchor issue that carries a small
fenced block:

```yaml alloc
kind: occ
ids: ["#97", "#98"]
event: 7d0f8bca
note: two sessions on one task
```

The durable key is `event`. It holds a commit SHA or a prior anchor id. The
`ids` are display labels only, so a later relabel is lossless. Because GitHub
assigns each comment a monotonic id, the comment order is an allocation order
that no merge can erase. When two sessions race for the same label, the lowest
comment id wins, first-published-wins. The command writes nothing to the ledger
page at allocation time, so the contested page never participates in the race.

Each anchor has one of four kinds. The projection groups the ids under one
heading per kind:

| Kind   | Projection heading | Used for                                  |
| ------ | ------------------ | ----------------------------------------- |
| `occ`  | Occurrences        | One occurrence of the tracked event.      |
| `nm`   | Near-misses        | A near-miss.                              |
| `fold` | Folds              | A fold of prior allocations into one id.  |
| `meta` | Meta-instances     | An allocation about the practice itself.  |

The ledger allocates ids. It does not define what each kind means. That
meaning belongs to the practice your team runs on the platform. Kata is the
reference tenant, and its improvement practice defines an occurrence, a
near-miss, and a fold. See [Kata](https://www.kata.team/).

## Allocate an id

Mint the next free id of a kind, keyed to a durable event:

```sh
npx gemba-wiki ledger allocate --kind occ --issue 42 --event 7d0f8bca --note "two sessions on one task"
```

```text
#97
```

The command prints the provisional id it minted. To allocate several at once:

```sh
npx gemba-wiki ledger allocate --kind occ --count 2 --issue 42 --event 7d0f8bca
```

```text
#97 #98
```

The printed ids are provisional. A later `rebuild` over the published comment
sequence is authoritative. It resolves any concurrent interleave
first-published-wins, so two racing allocations never keep the same label.

### Backfill an id that predates the ledger

Some ids already exist in history but were never anchored. Do not mint new ones
for them. Register them explicitly:

```sh
npx gemba-wiki ledger allocate --kind occ --ids "#42,#43" --issue 42 --event a1b2c3d4
```

If any named id already has an anchor, the command refuses. It does not
double-register the id.

### Allocation options

| Flag      | Required | Description                                                  |
| --------- | -------- | ------------------------------------------------------------ |
| `--kind`  | Yes      | `occ`, `nm`, `fold`, or `meta`.                              |
| `--event` | Yes      | Durable key for the allocation (a SHA or a prior anchor id). |
| `--count` | No       | How many ids to mint (default 1).                            |
| `--ids`   | No       | Comma-separated ids to backfill, instead of `--count`.        |
| `--note`  | No       | Free-text note recorded on the anchor.                        |
| `--issue` | No       | Anchor issue number.                                          |

Omit `--issue` and the command falls back to a single built-in issue number.
That number is the reference tenant's own anchor thread. Pass `--issue` in
your own project, on every `ledger` subcommand.

## Rebuild the projection

The ledger page and the memory row are projections of the anchor record. After
you publish new anchors, rebuild them from the authoritative thread:

```sh
npx gemba-wiki ledger rebuild --issue 42
```

```text
rebuilt: 12 ids, 0 double-allocation(s)
```

`rebuild` reads the full anchor sequence. It folds that sequence and resolves
any double allocation first-published-wins. It then writes the result to the
ledger page and the memory row. It preserves any prose you wrote against an
anchor. If the prose cites an anchor that no longer exists, the command warns:

```text
warning: prose cites missing anchors: #44
```

By default, `rebuild` renumbers a double-allocation loser. Pass `--gapped` to
render it as a gap instead. A gap keeps the original numbers visible.

## Verify

Confirm that the projection matches the anchor record. This check writes
nothing:

```sh
npx gemba-wiki ledger verify --issue 42
```

```text
verify: clean
```

`verify` re-projects the anchor record. It compares the result against the
ledger page and the memory row. When they diverge, it lists the problems and
exits non-zero:

```text
verify: ledger page diverges from the anchor record; MEMORY row diverges from the anchor record
```

Run `rebuild` to fix this. `rebuild` re-projects both surfaces. Then run
`verify` again to confirm they agree.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../wiki-operations -->
<!-- part:card:../wiki-integrity -->
<!-- part:card:../xmr-analysis -->

</div>
