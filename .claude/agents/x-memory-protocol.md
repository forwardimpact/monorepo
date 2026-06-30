# Memory Protocol

Governs **agent memory and action routing** via the `fit-wiki` CLI. Each
contract below maps to a `fit-wiki` subcommand. For non-wiki outputs see
[coordination-protocol.md](x-coordination-protocol.md).

## On-Boot Read Set

Tier 1 surfaces, all in `wiki/`:

| Surface | Path | Reader |
| --- | --- | --- |
| Own summary | `wiki/{self}.md` | `fit-wiki boot` (digest) |
| Cross-cutting memory | `wiki/MEMORY.md` | direct `Read` + `fit-wiki boot` |
| Current storyboard | `wiki/storyboard-YYYY-MNN.md` | `fit-wiki boot` (slice) |
| Own Carry surface | `wiki/{self}-carries.md` (when present) | `Read` (§ Carry Surface) |

Every agent-scoped `fit-wiki` call needs `--agent <self>` (`--from <self>` for
`memo`), no env fallback; `release --expired` is the lone agent-less form.

**Step 0 contract — two tool calls within the first ten:**

1. `Read wiki/MEMORY.md` — the priority surface and `## Active Claims`.
2. `Bash: fit-wiki boot --agent <self>` — JSON digest of the other Tier 1
   surfaces (`--format markdown` for prose).

**Standing Carries.** An own-summary may carry an optional `## Standing Carries`
section. The boot digest delivers its bullets byte-equal as a distinct
`standing_carries[]` field; `summary` stays the Last-run paragraph. Absence
yields an empty field and no audit obligation. They are own-summary content, not
a routing level; acting on one stays governed by the carry's predicate.

## On-Boot Routing

Apply this priority against the `boot` digest's JSON fields — first level with
actionable work wins:

1. **Owned priorities** (`owned_priorities[]`) — MEMORY.md `## Cross-Cutting
   Priorities` rows where you are `Owner`; team work preempts domain work.
2. **Storyboard items** (`storyboard_items[]`) — per-agent deliverables plus
   open experiment issues labeled `agent:{self}`, reaching the digest via a
   **materialized** surface: `fit-wiki refresh` renders open `agent:{name}`
   `experiment` issues into an `agent-experiments` storyboard block (number,
   title, author, label; bodies never cross, crossing fields sanitized). `boot`
   reads it file-only and offline, so items are only as fresh as the **last
   successful sync** in the block's `<!-- last-successful-sync: … -->` stamp; a
   failed sync keeps prior items and the stamp. Each item carries `source`
   (`"experiment"` or `"bullet"`); experiment items add `issue`/`author`.
3. **Domain assess** — the numbered steps in your agent profile's Assess.
4. **Cross-cutting fallback** (`cross_cutting[]`) — rows listing you under
   `Agents` (not Owner). Report clean only after checking all four.

**Skip-self rule:** your own `claims[]` row preempts routing (work in flight);
other agents' claims are settled. `### Decision` records which level it chose.

**Product-priority tie-break:** among candidates tying *within* a level (levels
stay strictly ordered — an owned priority still preempts all below),
product-aligned work outranks internal. **Exception:** internal work lifting a
constraint that currently blocks product delivery keeps its place. The bias is a
default, not a quota; it never overrides an owned priority or claim, nor forbids
internal work. On a product-vs-internal tie, `### Decision` names the
[axis value](x-work-definition.md#product-aligned-vs-internal) and, if internal
won, the constraint it lifts.

## Tool-vs-Memory Habit

Prefer memory over re-deriving from `gh`/`git`/source; primitives cost less.

## During Each Run

Append entries to the current weekly log via `fit-wiki log`:

- `fit-wiki log decision --agent <self> --surveyed ... --chosen ... --rationale
  ... [--alternatives ...]` — required at each entry's **opening**.
- `fit-wiki log note --agent <self> --field "Actions taken" --body "..."` —
  in-run field append.
- `fit-wiki log done --agent <self>` — close the entry.

Rotation is implicit: when an append would exceed the 500-line cap, `log` seals
the file as `…-Www-partN.md` and opens a fresh `…-Www.md` (`fit-wiki rotate` is
the manual escape).

Triage the Message Inbox via `fit-wiki inbox {list|ack|promote|drop}`; `promote
--index N` writes a `## Cross-Cutting Priorities` row. Cross-agent memos use
`fit-wiki memo`, triaged via `inbox`. Update `wiki/{agent}.md` at run end.

Keep your own summary and weekly log passing `audit` before run end — it gates
the Stop-hook: trim settled state, `rotate` a full weekly log. Whole-wiki `fix`
is the curator's tool, not a per-run step.

## Summary Contract

Each `wiki/<agent>.md` follows a mechanically-checkable contract `audit` gates
on Stop-hook and pre-merge CI.

**Permitted sections (in order):** `# {Agent Title} — Summary` (H1) →
`**Last run**:` → `## Message Inbox` (`<!-- memo:inbox -->` marker, MUST be the
first H2) → agent-specific H2 sections → `## Open Blockers`.

**Budgets:** 496 lines, 6 400 words. State, not history.

## Carry Surface

A **Carry** is a durable per-Assess obligation: a predicate or routing protocol
plus a future clearance trigger (experiment verdict, spec merge, release tag).
Carries live off budget on `wiki/<agent>-carries.md` (one per agent, H1
`# <agent> — Carries`), classified on both axes with Carry-semantic fields. Each
Carry is an H3 block naming its trigger on a `**Carry-clearance:**` line;
`carry-surface.entry-has-clearance` fails one without it. Reconciliation uses a
`**Referenced surface**:` line. No budget, so falsifier text stays verbatim.
**At boot:** walk the `###` blocks.

## Weekly Log Contract

Weekly logs (`wiki/<agent>-YYYY-Www.md`) are append-only Tier 2 records. Named
readers: `kata-wiki-curate` (always), `kata-session` (experiments).

**Budgets:** 496 lines, 6 400 words. Storyboards (`wiki/storyboard-YYYY-MNN.md`)
share these under separate `storyboard.*-budget` rules, which may diverge.

Overflow rotates by rename (see § During Each Run); no part is ever rewritten.
New entries go through `fit-wiki log`, which emits a conforming `## YYYY-MM-DD`
heading and `### Decision` block (`audit` enforces both). Reserve direct edits
for **repair**; a hand-composed entry skips append-time checks.

## Wiki Filename Grammar

Which files may exist under `wiki/`. The `audit` `admission` rule
(`audit/grammar.js`) enforces it. **Universe:** git-tracked files under `wiki/`.
**Calendar tokens** are hyphen-anchored segments — week `YYYY-Www`, month
`YYYY-MNN`, date `YYYY-MM-DD`, bare year `YYYY` (digits inside a longer segment
are not tokens). Admitted **root-file** classes:

| Class | Shape |
|---|---|
| Named ledger | `Home.md`, `MEMORY.md`, `STATUS.md` |
| Summary | `<slug>.md`, `<slug>` token-free |
| Weekly log | `<agent>-YYYY-Www.md` and `-partN.md`, `<agent>` token-free |
| Storyboard | `storyboard-YYYY-MNN.md` |
| Dated deliverable | `<topic>-YYYY-MM-DD.md`, `<topic>` token-free |

A token-bearing root file must match a weekly-log, storyboard, or dated shape
*exactly*; token-free `<slug>`/`<topic>` block trailing-date smuggling, others
flagged. **Directories** are admitted at root only iff `metrics/` or an
`<agent>/` sidecar; files beneath by membership.

**Remediation is flag-for-human** — never auto-fixed; a wrong move destroys
memory. Admit a new convention by extending this section and `audit/grammar.js`
together in one reviewed change — the single admission path.

## Cross-Cutting Priorities

`wiki/MEMORY.md`'s cross-cutting priority surface, read by every boot via
`owned_priorities`/`cross_cutting`. Schema
`| Item | Agents | Owner | Status | Added |`, max 10 active. Writers: `fit-wiki
inbox promote` (from a memo) and direct `kata-wiki-curate` edits.

## Active Claims

Sibling H2 in `wiki/MEMORY.md`. A *claim* asserts an agent is working a named
target and will ship the next state change. **Row present = active; row
absent = settled.**

Schema (header verbatim from `libwiki/constants.js`):

```text
| agent | target | branch | pr | claimed_at | expires_at |
```

Lifecycle:

- `fit-wiki claim --agent <self> --target <id> --branch <name> [--pr <id>] [--expires-at YYYY-MM-DD]`
  — defaults `expires_at = +1 day`; exit 2 on dupes.
- `fit-wiki release --agent <self> --target <id>` — normal removal.
- `fit-wiki release --expired` — operator cleanup; removes every expired row.

Rows settle by deletion; `MEMORY.md`'s git history preserves the prior record.

### Claim gate — before first code write

A claim row MUST exist before the first code write — branch creation or worktree
entry, whichever first. The claim is atomic with its push, **the serialization
point**:

1. `fit-wiki pull`
2. Read `## Active Claims` for foreign rows on the same target. Compare on the
   coordinating artifact (issue/spec number), not slug; then read overlapping
   branch or PR.
3. `fit-wiki claim --agent <self> --target <id> --branch <name>`
4. `fit-wiki push`
5. If the push rebases in a foreign row for the same deliverable, abort:
   `release` your row, push, and re-route.

Pair the gate with the pre-PR freshness probe —
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
