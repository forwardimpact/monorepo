# Spec 1090: Reframe `substrate roster` around the kata-interview supervisor's persona-pick job

**Issue:** [#993](https://github.com/forwardimpact/monorepo/issues/993)
findings 1, 2, 3, 5 (cluster: "supervisor is doing manual data assembly that
the substrate already has")

**Persona/job:** Teams Using Agents → Plan, Ship, Study, Act (per
[JTBD.md](../../JTBD.md) and [spec 1010](../1010-jtbd-teams-using-agents/)).
The kata-interview workflow is the Study surface in that loop; this spec
reduces supervisor toil on every interview run.

## Why now

Two end-to-end `kata-interview` workflow runs ([run
25999252444](https://github.com/forwardimpact/monorepo/actions/runs/25999252444)
and [run
25999790849](https://github.com/forwardimpact/monorepo/actions/runs/25999790849))
analysed by `fit-trace` show the supervisor spending the bulk of its Bash
turns reinventing the same data-assembly pipelines:

- **Persona-pick toil.** ~5–8 Bash turns per interview grep'ing
  `wiki/product-manager-2026-W*.md` for `@bionova.example` patterns to
  find which personas were used recently. SKILL.md Step 3a calls this
  "memory diversification" but offers no command for it.
- **Persona-craft toil.** ~6 Bash turns per interview grep'ing
  `data/synthetic/story.dsl` and `prose-cache.json` after the persona
  is picked, to recover team, manager handle, teammates, and the
  current scenario — fields the
  [persona template](../../.claude/skills/kata-interview/references/persona-template.md)
  requires.
- **Tabular-output toil.** Both supervisors ran the JSON output through
  ad-hoc Python tabulation (Run 1 turn 40; Run 2 turn 42) because the
  default `--format json` (selected for spec 990's CI smoke purposes)
  is unreadable as a 21-row persona menu.
- **`manager_email` confusion.** Every roster row shows `manager_email:
  NULL` because the substrate intentionally selects personas who ARE
  managers (Persona-corpus invariant (a) at
  `substrate-persona-query.js:11`). The downstream consumer
  `substrate-issue.js:87` then writes `manager_email = persona_email`
  into `.substrate.json` (because `org team --manager <X>` queries the
  persona's OWN email). The field name promises the persona's parent
  in the org tree and means the manager-of-the-team-they-lead.

These are not nine separate problems — they are one product framing
mistake. `substrate roster` was specced as "list personas that satisfy
the smoke invariants" (a CI-correctness check). The actual primary
caller is the kata-interview supervisor, whose job is "give me a
persona ready to craft into a JTBD-test subject, diversified against
recent memory." Reframing the roster contract around the supervisor's
job eliminates four trace-attested toil patterns.

## Strategic decision

Reframe `substrate roster` (and any companion verb) around the
**supervisor's persona-pick + persona-craft job**, not the CI smoke
invariant audit. The substrate already carries every datum the
supervisor reassembles by hand; expose it in the shape the supervisor
needs and stop forcing post-processing.

The persona-corpus invariant audit remains a valid CI need but should
not constrain the default shape of the operator-facing roster output.

## Scope

| Surface | Change |
| --- | --- |
| `bunx fit-map substrate roster` default output | Human-readable table (one row per persona, all selection-relevant fields visible without piping). |
| `bunx fit-map substrate roster --format json` payload shape | Each persona row carries every field the [persona template](../../.claude/skills/kata-interview/references/persona-template.md) "Identity" section lists (name, team/department, manager-or-parent handle, teammates, current scenario or recent project context). |
| Memory-diversified persona pick | A substrate command path exists that returns a candidate diversified against the most-recent N kata-interview supervisor wiki log entries, without the supervisor running ad-hoc greps. Verb name + mechanism deferred to design. |
| `manager_email` field naming | Roster output's manager-related field carries a name whose semantics match how downstream `substrate issue` populates `.substrate.json`, OR the field is removed from roster output if no downstream consumer reads it. |
| [`kata-interview` SKILL.md Step 3a](../../.claude/skills/kata-interview/SKILL.md) | Updated to invoke the reframed roster contract (no manual greps for memory diversification or for persona-template fields). |

**Out of scope:**

- `substrate stage` workspace file copies (tracked separately as
  [spec 1100](../1100-substrate-stage-activity-copy/)).
- Wiki weekly-log rotation policy
  ([spec 1110](../1110-wiki-log-rotation/)).
- Re-publishing libconfig / guide implementations (release-engineer
  scope; [#940](https://github.com/forwardimpact/monorepo/issues/940)
  + [#983](https://github.com/forwardimpact/monorepo/issues/983)).
- Substrate smoke invariants (audited by `substrate smoke`, untouched
  here).
- Changes to `.substrate.json`'s on-disk shape (used by gated
  `fit-landmark` commands; out-of-band from the operator-facing roster).

## Success criteria

1. **Tabular default.** `bunx fit-map substrate roster` (no `--format`
   flag) emits a single, aligned table to stdout where each row pairs
   one persona with all fields a kata-interview supervisor uses to
   pick: identity (email, name), role coordinates (discipline, level,
   track), and the invariant-satisfaction counts that gate selection.
   Verify by running the command and visually confirming alignment
   without piping through any tabulator.
2. **Persona-ready JSON.** `bunx fit-map substrate roster --format
   json` returns rows that, for the picked persona, mechanically fill
   every "## You" bullet in
   `.claude/skills/kata-interview/references/persona-template.md`
   lines 30–38 from a single command output — no follow-up greps of
   `data/synthetic/story.dsl` or `prose-cache.json` required.
3. **Memory-diversified pick.** A documented substrate command path
   returns a candidate persona that does not appear in the last N
   kata-interview supervisor wiki log entries for a chosen discipline
   and level filter. Verify by running it twice in succession with a
   simulated N=1 history and confirming the second invocation returns
   a different candidate.
4. **No misleading field.** Searching the roster output for the
   substring `manager_email` returns either zero results, or returns
   a field whose value matches the persona's actual downstream
   contract in `.substrate.json` (i.e. the persona's own email, not
   `null`). The default `null`-on-all-rows shape is no longer present.
5. **SKILL.md alignment.** Reading
   `.claude/skills/kata-interview/SKILL.md` § Step 3a end-to-end
   yields a procedure that invokes the substrate command path from
   criterion 3 instead of manually grep'ing wiki logs, and references
   the roster JSON shape from criterion 2 for persona-template fill
   rather than directing the supervisor to `data/synthetic/`.

## Risks

- **Persona-template field availability.** Some persona-template
  fields (e.g. "current scenario") may not be directly queryable from
  the existing Supabase schema and may require reading the synthetic
  source files server-side at roster time. Design must decide whether
  to enrich at roster time, materialize during `substrate stage`, or
  expose via a separate verb.
- **Coherence with `substrate issue`.** Renaming or dropping
  `manager_email` from roster output must not break the contract
  `substrate issue` writes into `.substrate.json` (consumed by gated
  `fit-landmark` commands). Design must hold both shapes coherent or
  migrate the downstream contract in the same change.
- **CI smoke regression.** The persona-corpus invariant audit
  currently piggybacks on roster output. The reframed contract must
  either preserve every field that `substrate smoke` reads, or
  surface those fields under a documented audit-flavored output.

## References

- Issue [#993](https://github.com/forwardimpact/monorepo/issues/993) —
  9-pattern fit-trace analysis (this spec covers 1, 2, 3, 5).
- Spec 990 — `kata-interview-real-landmark-substrate` (the substrate
  this spec rebalances).
- Spec 1010 — `jtbd-teams-using-agents` (the persona/job anchor).
- `products/map/src/commands/substrate-roster.js`,
  `substrate-persona-query.js`,
  `substrate-issue.js` (the surface this spec touches).
- `.claude/skills/kata-interview/SKILL.md` § Step 3a, Step 4 +
  `references/persona-template.md` (the consumer this spec serves).
