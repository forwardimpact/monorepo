# Memory Protocol

Governs **agent memory and action routing** via the `fit-wiki` CLI. Every
contract below maps to one or more `fit-wiki` subcommands — the CLI is the
path, not an alternative. For non-wiki outputs see
[coordination-protocol.md](coordination-protocol.md).

## On-Boot Read Set

Three Tier 1 surfaces, all in `wiki/`:

| Surface | Path | Reader |
| --- | --- | --- |
| Own summary | `wiki/{self}.md` | `fit-wiki boot` (digest) |
| Cross-cutting memory | `wiki/MEMORY.md` | direct `Read` + `fit-wiki boot` |
| Current storyboard | `wiki/storyboard-YYYY-MNN.md` | `fit-wiki boot` (slice) |

**Step 0 contract — two tool calls within the first ten:**

1. `Read wiki/MEMORY.md` — direct file open of the priority surface and `##
   Active Claims`.
2. `Bash: fit-wiki boot --agent <self>` — structured digest of the other
   Tier 1 surfaces. JSON output; `--format markdown` for prose.

## On-Boot Routing

Apply this priority against the `boot` digest's JSON fields — first level with
actionable work wins:

1. **Owned priorities** (`owned_priorities[]`) — MEMORY.md `## Cross-Cutting
   Priorities` rows where you are `Owner`. Team commitments preempt domain
   work.
2. **Storyboard items** (`storyboard_items[]`) — per-agent deliverables plus
   open experiment issues labeled `agent:{self}`.
3. **Domain assess** — the numbered steps in your agent profile's Assess
   section.
4. **Cross-cutting fallback** (`cross_cutting[]`) — rows listing you under
   `Agents` (not Owner). Report clean only after checking all four.

**Skip-self rule:** treat your own row in `claims[]` as preempting routing —
the work is already in flight. Other agents' claims are settled state.

The `### Decision` block records which level produced the chosen action.

## Tool-vs-Memory Habit

The competing habit is `gh` / `git` / source re-derivation. When the next
answer can come from either path, **prefer memory** — every primitive is
calibrated to cost fewer tool calls than the alternative. The CLI is the
path, not the alternative.

## During Each Run

Append entries to the current weekly log via `fit-wiki log`:

- `fit-wiki log decision --agent <self> --surveyed ... --chosen ...
  --rationale ... [--alternatives ...]` — required at the **opening** of
  each weekly-log entry.
- `fit-wiki log note --agent <self> --field "Actions taken" --body "..."` —
  in-run field append.
- `fit-wiki log done --agent <self>` — close the entry.

Rotation is implicit: when the next append would push the file past the
500-line cap, `log` seals the current file as `…-Www-partN.md` and writes
the new entry to a fresh `…-Www.md`. `fit-wiki rotate` is the operator
escape.

Triage the Message Inbox via `fit-wiki inbox {list|ack|promote|drop}`.
`promote --index N` writes a row into `## Cross-Cutting Priorities` and
removes the inbox bullet.

Cross-agent memos use `fit-wiki memo` (writer-side); the recipient triages
via `inbox`. Update `wiki/{agent}.md` directly with Actions taken and Open
Blockers as needed at run end.

Keep your own summary and weekly log passing `audit` before run end — it
gates the Stop-hook: trim settled state, and `rotate` a full weekly log.
Whole-wiki auto-fix (`fit-wiki fix`) — which rewrites any agent's files — is
the curator's tool (`kata-wiki-curate`), not a per-run step.

## Summary Contract

Each `wiki/<agent>.md` conforms to a mechanically-checkable contract —
`audit` gates it on Stop-hook and pre-merge CI.

**Permitted sections (in order):** `# {Agent Title} — Summary` (H1) →
`**Last run**:` → `## Message Inbox` (with `<!-- memo:inbox -->` marker —
MUST be the first H2) → agent-specific H2 sections → `## Open Blockers`.

**Budgets:** 496 lines, 6 400 words. State, not history.

## Weekly Log Contract

Weekly logs (`wiki/<agent>-YYYY-Www.md`) are append-only Tier 2 records.
Named readers: `kata-wiki-curate` (always), `kata-session` (for experiment
verification), agents explicitly investigating past decisions.

**Budgets:** 496 lines, 6 400 words. Storyboards
(`wiki/storyboard-YYYY-MNN.md`) share the same budgets, gated by separate
`storyboard.line-budget` / `storyboard.word-budget` audit rules so the
limits can diverge later.

Overflow rotates: `log` seals the current file as
`<agent>-YYYY-Www-partN.md` and writes the day's append into a fresh
`<agent>-YYYY-Www.md`. A sealed part is never rewritten for cosmetics and a
sibling is never renumbered — the append-only guarantee is preserved by rename,
not in-place edit. The one sanctioned rewrite is the in-place re-bisection of a
single over-budget part (`fit-wiki fix`), which splits that part's own content
across fresh sibling slots without touching any other part. The sealed-part H1
grammar lives in [§ Wiki Filename Grammar](#wiki-filename-grammar).

Every dated `## YYYY-MM-DD` entry opens with `### Decision` (required;
`audit` enforces).

## Wiki Filename Grammar

The single home for what the wiki tree's structured files are named and titled.

**Sealed weekly-log part heading.** A freshly sealed part's H1 is
`# <agent> — YYYY-Www (part N)`, where **N is the part's own filename slot** (the
`N` in `<agent>-YYYY-Www-partN.md`). The header therefore agrees with the
filename at seal time and forever after, on both seal paths — whole-log rotation
and over-budget re-bisection. There is no "of M" total: under the
never-renumber invariant M is unknowable at seal time and goes stale on the next
seal. The main (unsealed) log keeps the suffix-less `# <agent> — YYYY-Www`.

Legacy parts are grandfathered: the audit accepts the bare heading and the
historical `(part N of M)` shape alongside `(part N)`, with no scheduled sunset.
Structurally broken headings (bad week token, missing separator) still fail.

## Cross-Cutting Priorities

`wiki/MEMORY.md` carries the cross-cutting priority surface. Read by every
boot (digest's `owned_priorities` + `cross_cutting` slices). Schema:
`| Item | Agents | Owner | Status | Added |`, max 10 active. Writers:
`fit-wiki inbox promote` (from a memo) and direct `kata-wiki-curate` edits.

## Active Claims

Sibling H2 to Cross-Cutting Priorities in `wiki/MEMORY.md`. A *claim*
asserts that an agent is actively working on a named target and intends to
ship the next observable state change. **Row present = active; row absent
= settled.**

Schema (header copied verbatim from `libwiki/constants.js`):

```
| agent | target | branch | pr | claimed_at | expires_at |
```

Lifecycle:

- `fit-wiki claim --agent <self> --target <id> --branch <name> [--pr <id>]
  [--expires-at YYYY-MM-DD]` — defaults `expires_at = claimed_at + 7 days`.
  Refuses duplicates with exit 2.
- `fit-wiki release --agent <self> --target <id>` — normal removal.
- `fit-wiki release --expired` — operator cleanup, removes every row past
  `expires_at`.

Audit history lives in git history of `MEMORY.md` — rows are settled by
deletion; the prior commit preserves the claim record.

## CLI Contract Map

| Subcommand | Contract(s) realized |
| --- | --- |
| `boot` | On-Boot Read Set; On-Boot Routing |
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
| `refresh` | Storyboard + obstacle/experiment marker refresh |

One-shot administrative scripts (`scripts/spec-NNN-*.mjs`) write to `wiki/`
transiently and self-delete in the same commit; they are not part of this
protocol.
