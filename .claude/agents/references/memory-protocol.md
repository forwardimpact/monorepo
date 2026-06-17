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

Every agent-scoped `fit-wiki` invocation below requires an explicit
`--agent <self>` (`--from <self>` for `memo`); there is no environment
fallback. `release --expired` is the one agent-less form.

**Step 0 contract — two tool calls within the first ten:**

1. `Read wiki/MEMORY.md` — the priority surface and `## Active Claims`.
2. `Bash: fit-wiki boot --agent <self>` — JSON digest of the other Tier 1
   surfaces (`--format markdown` for prose).

## On-Boot Routing

Apply this priority against the `boot` digest's JSON fields — first level with
actionable work wins:

1. **Owned priorities** (`owned_priorities[]`) — MEMORY.md `## Cross-Cutting
   Priorities` rows where you are `Owner`; team commitments preempt domain work.
2. **Storyboard items** (`storyboard_items[]`) — per-agent deliverables plus
   open experiment issues labeled `agent:{self}`.
3. **Domain assess** — the numbered steps in your profile's Assess section.
4. **Cross-cutting fallback** (`cross_cutting[]`) — rows listing you under
   `Agents` (not Owner). Report clean only after checking all four.

**Skip-self rule:** treat your own row in `claims[]` as preempting routing —
the work is already in flight. Other agents' claims are settled state.

The `### Decision` block records which level produced the chosen action.

## Tool-vs-Memory Habit

When the next answer can come from either memory or `gh`/`git`/source
re-derivation, **prefer memory** — every primitive is calibrated to cost fewer
tool calls than the alternative.

## During Each Run

Append entries to the current weekly log via `fit-wiki log`:

- `fit-wiki log decision --agent <self> --surveyed ... --chosen ... --rationale
  ... [--alternatives ...]` — required at each entry's **opening**.
- `fit-wiki log note --agent <self> --field "Actions taken" --body "..."` —
  in-run field append.
- `fit-wiki log done --agent <self>` — close the entry.

Rotation is implicit: when the next append would exceed the 500-line cap, `log`
seals the current file as `…-Www-partN.md` and opens a fresh `…-Www.md`
(`fit-wiki rotate` is the operator escape).

Triage the Message Inbox via `fit-wiki inbox {list|ack|promote|drop}`; `promote
--index N` writes a `## Cross-Cutting Priorities` row and drops the bullet.
Cross-agent memos use `fit-wiki memo` (writer-side), triaged via `inbox`. Update
`wiki/{agent}.md` directly at run end.

Keep your own summary and weekly log passing `audit` before run end — it gates
the Stop-hook: trim settled state, `rotate` a full weekly log. Whole-wiki
`fit-wiki fix` is the curator's tool (`kata-wiki-curate`), not a per-run step.

## Summary Contract

Each `wiki/<agent>.md` conforms to a mechanically-checkable contract —
`audit` gates it on Stop-hook and pre-merge CI.

**Permitted sections (in order):** `# {Agent Title} — Summary` (H1) →
`**Last run**:` → `## Message Inbox` (with `<!-- memo:inbox -->` marker —
MUST be the first H2) → agent-specific H2 sections → `## Open Blockers`.

**Budgets:** 496 lines, 6 400 words. State, not history. Shapes:
§ Wiki Filename Grammar.

## Weekly Log Contract

Weekly logs (`wiki/<agent>-YYYY-Www.md`) are append-only Tier 2 records. Named
readers: `kata-wiki-curate` (always), `kata-session` (experiment verification),
agents investigating past decisions. Shapes: § Wiki Filename Grammar.

**Budgets:** 496 lines, 6 400 words. Storyboards (`wiki/storyboard-YYYY-MNN.md`)
share these under separate `storyboard.*-budget` rules, so limits can diverge.

Overflow rotates by rename (see § During Each Run); no part is ever rewritten.
New entries always go through `fit-wiki log`, which emits a conforming
`## YYYY-MM-DD` heading and `### Decision` block by construction (`audit`
enforces both). Reserve direct edits for **repair** — a hand-composed entry
skips the append-time checks, so drift and breaches go unnoticed until CI reds.

## Wiki Filename Grammar

Which files may exist under `wiki/`. The `audit` `admission` rule
(`audit/grammar.js`) enforces it; this section and that classifier are one home,
extended together. **Universe:** git-tracked files under `wiki/` (no git state →
every file is governed). **Calendar tokens** are hyphen-anchored segments — week
`YYYY-Www`, month `YYYY-MNN`, date `YYYY-MM-DD`, bare year `YYYY` (digits inside
a longer segment are not a token). Admitted **root-file** classes:

| Class | Shape |
|---|---|
| Named ledger | `Home.md`, `MEMORY.md`, `STATUS.md` |
| Summary | `<slug>.md`, `<slug>` token-free |
| Weekly log | `<agent>-YYYY-Www.md` and `-partN.md`, `<agent>` token-free |
| Storyboard | `storyboard-YYYY-MNN.md` |
| Dated deliverable | `<topic>-YYYY-MM-DD.md`, `<topic>` token-free |

A token-bearing root file must match a weekly-log, storyboard, or dated shape
*exactly*; the token-free `<slug>`/`<topic>` constraints block trailing-date
smuggling. Any other root file is flagged. **Directories** evaluate at the root
only: admitted iff `metrics/` or an `<agent>/` sidecar of a root summary; files
beneath by membership.

**Remediation is flag-for-human** — never auto-fixed; a wrong move destroys
memory. To admit a new convention, extend this section and `audit/grammar.js`
together in one reviewed change — the single admission path. This section also
hosts the sealed-part heading grammar.

## Cross-Cutting Priorities

`wiki/MEMORY.md`'s cross-cutting priority surface, read by every boot (digest's
`owned_priorities` + `cross_cutting` slices). Schema:
`| Item | Agents | Owner | Status | Added |`, max 10 active. Writers:
`fit-wiki inbox promote` (from a memo) and direct `kata-wiki-curate` edits.

## Active Claims

Sibling H2 to Cross-Cutting Priorities in `wiki/MEMORY.md`. A *claim* asserts an
agent is actively working a named target and will ship the next observable state
change. **Row present = active; row absent = settled.**

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

Rows settle by deletion; `MEMORY.md`'s git history preserves the prior record.

### Claim gate — before first code write

A claim row MUST exist before the first code write — branch creation or worktree
entry, whichever first (strengthening the older "claim before any PR" floor). The
claim is atomic with its push — **the wiki git push is the serialization point**:

1. `fit-wiki pull`
2. Read `## Active Claims` for foreign rows on the same target. Slug equality is
   **not** the test — compare on the coordinating artifact (issue/spec number),
   then read any overlapping in-flight branch or PR.
3. `fit-wiki claim --agent <self> --target <id> --branch <name>`
4. `fit-wiki push`
5. If the push rebases in a foreign row for the same deliverable, abort:
   `release` your row, push, and re-route.

Pair the gate with the pre-PR freshness probe —
[coordination-protocol.md § Claim → probe → create](coordination-protocol.md#claim--probe--create).

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
