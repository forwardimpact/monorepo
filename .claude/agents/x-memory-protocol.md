# Memory Protocol

This file governs **agent memory and action routing** with the `gemba-wiki`
CLI. Each contract below maps to a `gemba-wiki` subcommand. For non-wiki
outputs see [coordination-protocol.md](x-coordination-protocol.md).

## On-Boot Read Set

Tier 1 surfaces, all in `wiki/`:

| Surface | Path | Reader |
| --- | --- | --- |
| Own summary | `wiki/{self}.md` | `gemba-wiki boot` (digest) |
| Cross-cutting memory | `wiki/MEMORY.md` | direct `Read` + `gemba-wiki boot` |
| Current storyboard | `wiki/storyboard-YYYY-MNN.md` | `gemba-wiki boot` (slice) |
| Own Carry surface | `wiki/{self}-carries.md` (when present) | `Read` (§ Carry Surface) |

Every agent-scoped `gemba-wiki` call needs `--agent <self>` (`--from <self>` for
`memo`), with no env fallback. `release --expired` is the lone agent-less form.

**Step 0 contract — two tool calls within the first ten:**

1. `Read wiki/MEMORY.md` — the priority surface and `## Active Claims`.
2. `Bash: gemba-wiki boot --agent <self>` — JSON digest of the other Tier 1
   surfaces (`--format markdown` for prose).

**Standing Carries.** An own-summary may carry an optional `## Standing Carries`
section. The boot digest delivers its bullets byte-equal as a distinct
`standing_carries[]` field. `summary` stays the Last-run paragraph. Absence
yields an empty field and no audit obligation. They are own-summary content.
They are not a routing level. The carry's predicate governs when to act on one.

## On-Boot Routing

Apply this priority against the `boot` digest's JSON fields. The first level
with actionable work wins:

1. **Owned priorities** (`owned_priorities[]`) — MEMORY.md `## Cross-Cutting
   Priorities` rows where you are `Owner`. Team work preempts domain work.
2. **Storyboard items** (`storyboard_items[]`) — per-agent deliverables plus
   open experiment issues labeled `agent:{self}`. Both reach the digest
   through a **materialized** surface. `gemba-wiki refresh` renders open
   `agent:{name}` `experiment` issues into an `agent-experiments` storyboard
   block (number, title, author, label). Bodies never cross. `refresh`
   sanitizes the fields that do. `boot` reads it file-only and offline, so
   items are only as fresh as the **last successful sync** in the block's
   `<!-- last-successful-sync: … -->` stamp. A failed sync keeps prior items
   and the stamp. Each item carries `source` (`"experiment"` or `"bullet"`).
   Experiment items add `issue`/`author`.
3. **Domain assess** — the numbered steps in your agent profile's Assess.
4. **Cross-cutting fallback** (`cross_cutting[]`) — rows that list you under
   `Agents` (not Owner). Report clean only after you check all four.

**Skip-self rule:** your own `claims[]` row preempts routing (work in flight).
Other agents' claims are settled. `### Decision` records which level it chose.

**Product-priority tie-break:** among candidates that tie *within* a level,
product-aligned work outranks internal. Levels stay strictly ordered. An owned
priority still preempts all below. **Exception:** internal work keeps its place
if it lifts a constraint that currently blocks product delivery. The bias is a
default rather than a quota. It never overrides an owned priority or claim, nor
forbids internal work. On a product-vs-internal tie, `### Decision` names the
[axis value](x-work-definition.md#product-aligned-vs-internal) and, if internal
won, the constraint it lifts.

## Tool-vs-Memory Habit

Use memory before you re-derive from `gh`/`git`/source. Primitives cost less.

## During Each Run

Append entries to the current weekly log with `gemba-wiki log`:

- `gemba-wiki log decision --agent <self> --surveyed ... --chosen ... --rationale ... [--alternatives ...]`
  — required when each entry **opens**.
- `gemba-wiki log note --agent <self> --field "Actions taken" --body "..."` —
  in-run field append.
- `gemba-wiki log done --agent <self>` — close the entry.

Rotation is implicit. When an append would exceed the 500-line cap, `log` seals
the file as `…-Www-partN.md` and opens a fresh `…-Www.md` (`gemba-wiki rotate`
is the manual escape).

Triage the Message Inbox with `gemba-wiki inbox {list|ack|promote|drop}`.
`promote --index N` writes a `## Cross-Cutting Priorities` row. Cross-agent
memos use `gemba-wiki memo`. Triage them with `inbox`. Update
`wiki/{agent}.md` at run end.

Make your own summary and weekly log pass `audit` before run end. `audit` gates
the Stop-hook. Trim settled state. `rotate` a full weekly log. Whole-wiki `fix`
is the curator's tool. It is not a per-run step.

## Summary Contract

Each `wiki/<agent>.md` follows a mechanically-checkable contract `audit` gates
on Stop-hook and pre-merge CI.

**Permitted sections (in order):** `# {Agent Title} — Summary` (H1) →
`**Last run**:` → `## Message Inbox` (`<!-- memo:inbox -->` marker, MUST be the
first H2) → agent-specific H2 sections → `## Open Blockers`.

**Budgets:** 496 lines, 6 400 words. Record state. Do not record history.

## Carry Surface

A **Carry** is a durable per-Assess obligation. It is a predicate or routing
protocol plus a future clearance trigger (experiment verdict, spec merge,
release tag). Carries live off budget on `wiki/<agent>-carries.md` (one per
agent, H1 `# <agent> — Carries`). Classify each Carry on both axes with
Carry-semantic fields. Each Carry is an H3 block that names its trigger on a
`**Carry-clearance:**` line. `carry-surface.entry-has-clearance` fails one
without it. Reconciliation uses a `**Referenced surface**:` line. It has no
budget, so falsifier text stays verbatim. **At boot:** walk the `###` blocks.

## Weekly Log Contract

Weekly logs (`wiki/<agent>-YYYY-Www.md`) are append-only Tier 2 records. Named
readers: `kata-wiki-curate` (always), `kata-session` (experiments).

**Budgets:** 496 lines, 6 400 words. Storyboards (`wiki/storyboard-YYYY-MNN.md`)
share these under separate `storyboard.*-budget` rules, which may diverge.

Overflow rotates by rename (see § During Each Run). Never rewrite a part. New
entries go through `gemba-wiki log`, which emits a compliant `## YYYY-MM-DD`
heading and `### Decision` block (`audit` enforces both). Reserve direct edits
for **repair**. A hand-composed entry skips append-time checks.

## Wiki Filename Grammar

This section says which files may exist under `wiki/`. The `audit` `admission`
rule (`audit/grammar.js`) enforces it. **Universe:** git-tracked files under
`wiki/`. **Calendar tokens** are hyphen-anchored segments: week `YYYY-Www`,
month `YYYY-MNN`, date `YYYY-MM-DD`, bare year `YYYY` (digits inside a longer
segment are not tokens). Admitted **root-file** classes:

| Class | Shape |
|---|---|
| Named ledger | `Home.md`, `MEMORY.md`, `STATUS.md` |
| Summary | `<slug>.md`, `<slug>` token-free |
| Weekly log | `<agent>-YYYY-Www.md` and `-partN.md`, `<agent>` token-free |
| Storyboard | `storyboard-YYYY-MNN.md` |
| Dated deliverable | `<topic>-YYYY-MM-DD.md`, `<topic>` token-free |

A token-bearing root file must match a weekly-log, storyboard, or dated shape
*exactly*. A token-free `<slug>` or `<topic>` blocks a smuggled trailing date.
The rule flags every other file. The rule admits **directories** at root iff
`metrics/` or an `<agent>/` sidecar. Files beneath belong by membership.

**Remediation is flag-for-human.** Never auto-fix it. A wrong move destroys
memory. To admit a new convention, extend this section and `audit/grammar.js`
together in one reviewed change. That is the single admission path.

## Cross-Cutting Priorities

This is `wiki/MEMORY.md`'s cross-cutting priority surface. Every boot reads it
through `owned_priorities`/`cross_cutting`. Schema
`| Item | Agents | Owner | Status | Added |`, max 10 active. Writers:
`gemba-wiki inbox promote` (from a memo) and direct `kata-wiki-curate` edits.

## Active Claims

Sibling H2 in `wiki/MEMORY.md`. A *claim* asserts that an agent works on a
named target and will ship the next state change. **Row present = active. Row
absent = settled.**

Schema (header verbatim from `libwiki/constants.js`):

```text
| agent | target | branch | pr | claimed_at | expires_at |
```

Lifecycle:

- `gemba-wiki claim --agent <self> --target <id> --branch <name> [--pr <id>] [--expires-at YYYY-MM-DD]`
  — defaults `expires_at = +1 day`. Exits 2 on a duplicate.
- `gemba-wiki release --agent <self> --target <id>` — normal removal.
- `gemba-wiki release --expired` — operator cleanup. Removes every expired row.

Rows settle by deletion. `MEMORY.md`'s git history preserves the prior record.

### Claim gate — before first code write

A claim row MUST exist before the first code write. That write is branch
creation or worktree entry, whichever comes first. The claim is atomic with its
push, **the serialization point**:

1. `gemba-wiki pull`
2. Read `## Active Claims` for foreign rows on the same target. Compare on the
   coordinating artifact (issue/spec number) instead of the slug. Then read any
   branch or PR that overlaps.
3. `gemba-wiki claim --agent <self> --target <id> --branch <name>`
4. `gemba-wiki push`
5. If the push rebases in a foreign row for the same deliverable, abort.
   `release` your row. Push. Re-route.

Pair the gate with the pre-PR freshness probe in
[coordination-protocol.md § Claim → probe → create](x-coordination-protocol.md#claim--probe--create).

## CLI Contract Map

| Subcommand | Contract(s) realized |
| --- | --- |
| `boot` | On-Boot Read Set (incl. `standing_carries`); On-Boot Routing (materialized `agent-experiments`) |
| `log decision` | Decision-block opening (write) |
| `log note` / `log done` | Weekly log field append / close |
| `claim` / `release` | Active Claims write |
| `inbox list` | Message Inbox read |
| `inbox ack` / `drop` | Message Inbox triage |
| `inbox promote` | Cross-Cutting Priorities write (from inbox) |
| `rotate` | Weekly Log Contract (explicit rotation) |
| `audit` | Summary; Active Claims schema; Decision-block gate; Weekly Log cap; Expired claims |
| `fix` | Auto-fix `audit` findings: rotate, Haiku agent, flag (curator-run) |
| `memo` | Cross-agent memo writer |
| `push` / `pull` | Wiki git lifecycle |
| `init` | Active Claims scaffold; Stop-hook installation |
| `refresh` | Storyboard marker refresh; expired-claim sweep |
