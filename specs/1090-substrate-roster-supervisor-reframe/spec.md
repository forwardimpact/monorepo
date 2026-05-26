# Spec 1090: Reframe `substrate roster` around the kata-interview supervisor's persona-pick job

**Issue:** [#993](https://github.com/forwardimpact/monorepo/issues/993)
findings 1, 2, 3, 5 (cluster: "supervisor is doing manual data assembly that
the substrate already has")

**Persona/job:** Teams Using Agents — "Run an autonomous, continuously
improving development team that plans, ships, studies its own traces,
and acts on findings" (per [CLAUDE.md](../../CLAUDE.md) § Primary
Products). The kata-interview workflow is the Study surface in that
loop; this spec reduces supervisor toil on every interview run.
[Spec 1010](../1010-jtbd-teams-using-agents/) promotes this persona to
`JTBD.md` (at `design draft`); if 1010 lands before 1090, both
documents become the anchor.

## Why now

Two end-to-end `kata-interview` workflow runs ([run
25999252444](https://github.com/forwardimpact/monorepo/actions/runs/25999252444)
and [run
25999790849](https://github.com/forwardimpact/monorepo/actions/runs/25999790849))
analysed by `fit-trace` show the supervisor spending the bulk of its Bash
turns reinventing the same data-assembly pipelines:

- **Persona-pick toil.** Run 1 supervisor turns 33–50 + Run 2 supervisor
  turns 22–50 grep'ing `wiki/product-manager-2026-W*.md` for
  `@bionova.example` patterns to find which personas were used
  recently. SKILL.md Step 3a calls this "memory diversification" but
  offers no command for it.
- **Persona-craft toil.** Run 1 supervisor turns 52/55/57/59/61/70/72
  (6 greps) against `data/synthetic/story.dsl` and `prose-cache.json`
  after the persona is picked, to recover team, manager handle,
  teammates, and the current scenario — fields the
  [persona template](../../.claude/skills/kata-interview/references/persona-template.md)
  requires.
- **Tabular-output toil.** Both supervisors ran `bunx fit-map substrate
  roster --format json` and then piped through ad-hoc Python tabulation
  (Run 1 turn 40; Run 2 turn 42) because the JSON output is unreadable
  as a 21-row persona menu and the no-flag default (a bulleted list per
  `substrate-roster.js`) does not align columns either.
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
| `bunx fit-map substrate roster --format json` payload shape | Each persona row carries every Supabase-derivable field the [persona template](../../.claude/skills/kata-interview/references/persona-template.md) `## You` block names (email, name, department/team, manager-or-parent handle, role coordinates). Fields the template sources from `data/synthetic/` (repos, teammates, recent project context) are also carried, with the sourcing path — query-time enrichment, materialization, or another mechanism — design-determined. |
| Memory-diversified persona pick | A substrate command path returns a candidate persona not in the supervisor's recent persona-pick memory, without the supervisor running ad-hoc greps. The memory source (kata-interview wiki logs, `wiki/metrics/kata-interview/2026.csv`, or another canonical record) and the verb name are design-determined. |
| `manager_email` field naming (roster output) | The roster output no longer carries a field whose name promises the persona's parent in the org tree but whose value is the persona's own email or `null`. Resolution path — rename to match the actual semantics (e.g. `parent_email`, `reports_to`), drop the field, or split into two named fields — is design-determined. |
| [`kata-interview` SKILL.md Step 3a](../../.claude/skills/kata-interview/SKILL.md) | Updated to invoke the reframed roster contract (no manual greps for memory diversification or for persona-template fields). |

**Out of scope:**

- `substrate stage` workspace file copies (planned — issue
  [#993](https://github.com/forwardimpact/monorepo/issues/993)
  finding 4; STATUS row claims spec 1100).
- Wiki weekly-log rotation policy (planned — issue #993 finding 9;
  STATUS row claims spec 1110).
- Re-publishing libconfig / guide implementations (release-engineer
  scope; [#940](https://github.com/forwardimpact/monorepo/issues/940)
  + [#983](https://github.com/forwardimpact/monorepo/issues/983)).
- Substrate smoke invariants (audited by `substrate smoke`, untouched
  here).
- Changes to `.substrate.json`'s on-disk field names — the rename in
  this spec applies to **roster output only**. Downstream contract
  coherence with `substrate-issue.js:87` and any gated `fit-landmark`
  consumers is acknowledged as a risk; the design phase decides
  whether to widen scope or hold the downstream key stable.

## Success criteria

1. **Tabular default.** `bunx fit-map substrate roster` (no `--format`
   flag) emits one row per persona in a single output block where
   the columns the supervisor reads to pick a persona — email, name,
   discipline, level, track — are aligned without piping through any
   tabulator. The current bulleted-string default (one persona per
   line in `formatBullet` prose) is no longer produced.
2. **Persona-ready JSON.** `bunx fit-map substrate roster --format
   json` returns rows that, for the picked persona, supply every
   value listed under `## You` in
   `.claude/skills/kata-interview/references/persona-template.md`
   (email, name, department/team, manager-or-parent, role
   coordinates, repos, teammates, recent project context) from one
   command output — no follow-up reads of `data/synthetic/story.dsl`
   or `prose-cache.json` are required by the supervisor.
3. **Memory-diversified pick.** A substrate command path returns a
   candidate persona that does not appear in the supervisor's most
   recent persona-pick memory (whichever record the design names as
   canonical). Verify by running the command path twice in succession
   under a memory state asserting the first invocation's pick as
   recent, and confirming the second invocation returns a different
   candidate.
4. **No misleading field.** The roster output (default and `--format
   json`) does not carry a field whose name promises the persona's
   parent in the org tree (e.g. `manager_email`, `manager_handle`)
   while its value is either `null` or the persona's own email. Any
   manager-related field present in roster output has both a name
   and a value that match its semantic role — verified by reading
   one row of output against the field-naming rule.
5. **SKILL.md alignment.** Reading
   `.claude/skills/kata-interview/SKILL.md` § Step 3a end-to-end
   yields a procedure that invokes the substrate command path from
   criterion 3 instead of manually grep'ing wiki logs, and references
   the roster JSON shape from criterion 2 for persona-template fill
   rather than directing the supervisor to `data/synthetic/`.

## Risks

- **Persona-template field availability.** Some persona-template
  fields (e.g. "recent project context") are not directly queryable
  from the existing Supabase schema and live in
  `data/synthetic/story.dsl` / `prose-cache.json`. Design must decide
  whether to enrich at roster query time, materialize during a prior
  phase, or expose via a separate verb — without widening this
  spec's scope into `substrate stage` (spec 1100 territory).
- **Coherence with `substrate issue`.** Renaming or dropping the
  manager-related field from roster output must remain coherent with
  `substrate-issue.js:87`, which writes `manager_email: persona_email`
  into `.substrate.json`. Gated `fit-landmark` consumers read that
  key. Design must either hold the downstream key stable while
  changing only the operator-facing roster surface, or open a
  separate spec for the downstream rename.
- **CI smoke regression.** The persona-corpus invariant audit
  currently piggybacks on roster output. The reframed contract must
  either preserve every field that `substrate smoke` reads, or
  surface those fields under a documented audit-flavored output.

## References

- Issue [#993](https://github.com/forwardimpact/monorepo/issues/993) —
  9-pattern fit-trace analysis. This spec covers findings 1, 2, 3, 5.
  Sibling specs cover 4 (substrate stage, claimed 1100) and 9 (wiki
  log rotation, claimed 1110). Findings 6/7/8 already tracked on
  existing issues.
- Spec 0990 — `kata-interview-real-landmark-substrate` (the substrate
  this spec rebalances).
- Spec 1010 — `jtbd-teams-using-agents` (`design draft`; promotes
  Teams Using Agents to JTBD.md).
- `products/map/src/commands/substrate-roster.js`,
  `products/map/src/commands/substrate-persona-query.js`,
  `products/map/src/commands/substrate-issue.js` (the surface this
  spec touches; line 87 of `substrate-issue.js` is the downstream
  consumer of the manager-related field).
- `.claude/skills/kata-interview/SKILL.md` § Step 3a, Step 4 +
  `references/persona-template.md` (the consumer this spec serves).
