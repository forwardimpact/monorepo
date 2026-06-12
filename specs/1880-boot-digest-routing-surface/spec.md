# Spec 1880 — Boot digest delivers the routing contract: materialized per-agent experiments and standing carries

**Status:** draft · **Addresses:** #1666 (the closing keyword ships on the
**implementation** PR only — the obstacle stays open until the structural half
lands) · **Persona/Job:** Teams Using Agents —
[Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team)
(Kata)

## Problem

The memory protocol's On-Boot Routing level 2 promises that the `fit-wiki boot`
digest delivers "per-agent deliverables plus open experiment issues labeled
`agent:{self}`". Three independent observers plus a source-mechanism read
(#1666) established that the promise is broken in both halves:

| Claim | Evidence |
| --- | --- |
| The labeled-issue clause was never implemented — the digest's storyboard parser has no issue source, so level 2 cannot fire | Live boots: `storyboard_items = []` for release-engineer despite open #1625 (`agent:release-engineer` + `experiment`) and for improvement-coach despite open #1648; source verification [#1666 issuecomment-4688844457](https://github.com/forwardimpact/monorepo/issues/1666#issuecomment-4688844457) |
| Standing carries never reach the digest — the summary extraction returns only the first paragraph (the Last-run block) | Release-engineer's carry stack and the coach's Active Patterns are structurally excluded; every schedule-pinned commitment relies on de-facto full-file reads, not the documented Tier-1 digest path |
| Three test surfaces — the audit fixtures, the boot-digest golden file, and the integration seed helper — encode a dead storyboard format (`### {agent} — backlog` + bullets), so the gap ships green | The live storyboard carries h4 metrics + fenced XmR blocks and zero agent-section bullets; PR #1669 added one live-format regression test, but the three named surfaces still encode the dead format |

The team-wide mitigation is "read the storyboard file directly; do not act on
digest `storyboard_items`" — the full-file read is exactly the path the digest
exists to replace. A routing level that cannot fire weakens every
schedule-pinned commitment in the Kata PDSA loop: experiment protocols,
carry-clearance predicates, and verdict-window obligations all assume the boot
digest is a reliable carrier.

The narrow misattribution defect (team-wide `## Notes` bullets delivered as the
last-listed agent's items) is already fixed by PR #1669, which *addresses* but
does not close #1666. This spec covers the remaining structural scope; its
implementation closes the issue.

## Contract Decision

**Implement the level-2 clause — do not amend it away.** Open experiment issues
labeled `agent:{self}` become deliverable through the digest under these
binding contract properties:

- **Materialized, not queried:** issues are written into a boot-readable wiki
  file at an existing sync point that already touches the issue tracker; which
  sync point and which renderer is a design decision.
- **Boot stays offline, file-only, fail-never:** the digest builder reads only
  wiki files — no network, no subprocess, no new failure mode on the path
  every agent runs first.
- **Freshness is bounded by the sync cadence:** digest items are as fresh as
  the last materialization, not live tracker state, and the protocol says so.

Feasibility evidence (not a binding mechanism choice): the storyboard's
`## Experiments → ### Active` section is already an auto-generated issue-list
block re-rendered from the tracker at the storyboard refresh — so the team
already operates a materialization sync point, and the gap to the contract is
attribution and parsing, not new machinery. Implementing the clause extends
something that exists; amending the contract to match the implementation would
permanently demote the digest from routing surface to Last-run echo and codify
the full-file read as the real protocol.

| Direction | Disposition |
| --- | --- |
| (a) Materialize labeled issues at an existing sync point; boot stays file-only | **Chosen** — restores level 2 under the properties above |
| (a′) `boot` queries the issue tracker directly | Rejected — adds a network + auth dependency to a currently offline, fail-never path every agent runs first thing |
| (b) Deliver standing carries through the digest via a designated summary block | **Chosen** (complementary) — covers the carries half, which no issue materialization can; delivered as a distinct digest field, with `summary` unchanged |
| (c) Narrow the contract text to match the implementation | Rejected — abandons the routing promise; the protocol amendment instead documents the materialized mechanism and its freshness bound |

## What Changes

1. **Per-agent experiment materialization.** The experiment issues materialized
   into the wiki become agent-attributable: each item records the issue
   number, title, author, and owning `agent:{name}` label, regenerated from
   the issue tracker at the chosen sync point. Open experiment issues carrying
   no `agent:{name}` label keep today's behavior — they appear in the
   team-wide experiments list but route to no agent's digest. Placement and
   markup of the attributed items are design decisions.
2. **Sync failure must not erase the materialized surface.** This is a
   required behavior change, not an inherited property: today a tracker
   failure during refresh splices an empty render over an issue-list block,
   wiping its previous content. For the attributed surface, a failed tracker
   query at sync time must preserve the previously materialized items (warn
   and keep), so boot serves the last good materialization instead of an
   empty routing surface.
3. **Boot reads the materialized surface.** The boot digest's
   `storyboard_items` include the open experiment issues attributed to the
   booting agent, sourced from the materialized file under the contract
   properties above. Agent-section bullets remain a second source: a bullet
   under the agent's own storyboard h3 still yields a digest item, and the
   rewritten fixtures must cover that path in the live format.
4. **Standing carries reach the digest.** An agent summary may carry a
   designated `## Standing Carries` section; the boot digest delivers its
   bullets as a distinct `standing_carries` field. The `summary` field stays
   the Last-run paragraph. The section is optional — absence yields an empty
   field, and no new audit obligation is created. Standing carries are
   delivered at the On-Boot Read Set layer (own-summary content), not as a new
   routing level: acting on a carry remains governed by the carry's own
   predicate. Moving existing carries into the section is each agent's own
   adoption step, not part of this change set.
5. **Protocol amendment ships inside this change set.** memory-protocol.md is
   amended in the same change set: § On-Boot Routing level 2 describes the
   materialized mechanism and its freshness bound; § On-Boot Read Set and the
   summary-contract text describe the `## Standing Carries` section and its
   digest field; § CLI Contract Map reflects both. Technical-writer writes or
   reviews the amendment, recorded on the spec's implementation PR (per
   [#1666 issuecomment-4688877078](https://github.com/forwardimpact/monorepo/issues/1666#issuecomment-4688877078)).
6. **Fixture corpus rewritten to the live storyboard format.** Every libwiki
   test surface encoding the dead `### {agent} — backlog` format — the
   CLI-level and engine-level audit fixtures, the boot-digest golden file, the
   integration seed helper, and any inline test storyboards — is rewritten to
   the live shape: h4 metric + fenced XmR block agent sections, a team-wide h2
   immediately following the last agent section, the materialized experiments
   surface, and at least one live-format agent-section bullet. PR #1669's
   regression coverage (the h2-after-last-agent shape) is preserved in intent;
   its fixtures may be restyled to the live format like the rest.

## Security Acceptance Criteria

Materialization moves anyone-editable issue-tracker content into agent boot
context. These criteria adopt
[#1666 issuecomment-4688873711](https://github.com/forwardimpact/monorepo/issues/1666#issuecomment-4688873711)
with one deliberate strengthening: where the comment requires capping and
sanitizing materialized *bodies*, this spec excludes bodies from
materialization entirely and applies the cap-and-sanitize requirement to the
fields that do cross.

1. **Label re-check on every sync.** Only issues bearing the `agent:{name}`
   label at sync time are materialized as attributed items; an issue whose
   label was removed since the previous sync drops out at the next successful
   one. The label is the authorization signal and is never cached across
   successful syncs.
2. **Bodies never cross the boundary; crossing fields are neutralized.**
   Routing needs a pointer, not a payload: only issue number, title, author,
   and the owning `agent:{name}` label are materialized — issue bodies are
   never written into boot-readable wiki surfaces by this mechanism. Every
   non-numeric crossing field — title, author identifier, and label-derived
   agent name — is length-capped and sanitized so protocol-markup lookalikes
   (`[ask#N]`, checklist tags, session/memo control structures, auto-generated
   block markers) render inert. A negative fixture is required: a hostile
   issue carrying protocol impersonation in title, body, and author must
   produce a materialized item that is inert and body-free.
3. **Provenance on every item.** Each materialized item records issue number,
   author, and owning label, so anything in boot context is auditable back to
   its source and editor.

## Coherence Constraints

- **#1583 / #1580 / #1576 (open wiki-sync write-path issues):**
  materialization rides the existing sync → wiki-file → wiki-sync path and
  introduces no new commit, push, or sweep surface. Whatever fixes those
  issues produce for conflict handling, push-reject reporting, and sweep
  scoping apply to this surface automatically; this spec must not extend the
  silent-clobber or phantom-success exposure they document.
- **Storyboard budgets:** if the materialized surface lives in the storyboard,
  it counts against the existing storyboard line/word budgets
  (`storyboard.line-budget`, `storyboard.word-budget`); attribution must not
  push the live storyboard over them.

## Success Criteria

All libwiki test criteria are verified by `cd libraries/libwiki && bun test`
passing with the named coverage present.

| # | Claim | Verification |
| --- | --- | --- |
| 1 | A boot digest for an agent includes an open experiment issue labeled `agent:{self}` after a sync that materialized it | libwiki boot test: fixture wiki containing the materialized surface |
| 2 | The boot path stays offline and fail-never | libwiki boot tests construct the digest builder with only a filesystem surface — no subprocess or network capability injected |
| 3 | An issue de-labeled since the previous sync is absent from the next successful materialized render | libwiki sync test: label removed between two renders → item dropped |
| 4 | A failed tracker query at sync time preserves the previously materialized items | libwiki sync test: tracker failure between two renders → prior items intact, warning emitted |
| 5 | A hostile issue (protocol impersonation in title, body, and author) materializes inert and body-free | libwiki negative fixture test |
| 6 | Every materialized item carries issue number, author, and owning label | libwiki sync test asserting provenance fields |
| 7 | Boot consumes what the sync actually writes — no renderer/parser format drift | libwiki round-trip test: digest built from a file produced by the materialization renderer, not a hand-built lookalike |
| 8 | A live-format agent-section bullet still yields a digest item for that agent | libwiki boot test against the rewritten live-format fixtures |
| 9 | Bullets under `## Standing Carries` appear in the digest's `standing_carries` field; a summary without the section yields an empty field; `summary` remains the Last-run paragraph | libwiki boot tests covering both presence and absence |
| 10 | memory-protocol.md matches the shipped mechanism, amended in the same change set with technical-writer review recorded | implementation PR diff includes the amendment; TW review comment on the PR |
| 11 | No libwiki test surface retains the dead storyboard format | `cd libraries/libwiki && bun test` green with the rewritten fixtures, and `grep -rn -- '— backlog' libraries/libwiki/test/` returns no matches |
| 12 | If the materialized surface lives in the storyboard, the live storyboard stays within its audit budgets after attribution | `fit-wiki audit` passes on the refreshed wiki |

## Exclusions

- The h2-boundary parser fix — shipped in PR #1669; its regression coverage is
  preserved in intent (fixtures may be restyled, per What Changes item 6).
- Changes to wiki-sync conflict/push/sweep semantics — owned by issues #1583,
  #1580, #1576.
- Routing for obstacle-labeled issues — level 2's contract names experiment
  issues only; widening it is a separate decision.
- A network-querying boot path — explicitly rejected above.
- Migration of existing agent summaries to `## Standing Carries` — agent-owned
  adoption, not part of this change set.

— Product Manager 🌱
