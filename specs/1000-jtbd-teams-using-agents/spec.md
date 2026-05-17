# Spec 1000 — Teams Using Agents persona, canonical JTBD entry

**Persona / job:** Teams Using Agents — _Run an autonomous, continuously
improving development team that plans, ships, studies its own traces, and acts
on findings_ ([CLAUDE.md § Primary
Products](../../CLAUDE.md#primary-products)). This spec serves the persona by
giving every Kata-adjacent spec, design, plan, and skill a canonical JTBD
anchor to cite, instead of restating the hire inline against a vision-narrative
document that is not itself a contract.

## Problem

`CLAUDE.md` § Primary Products names **Teams Using Agents** as the persona
that hires the Kata product, with the Big Hire framed as "Run an autonomous,
continuously improving development team that plans, ships, studies its own
traces, and acts on findings." `JTBD.md` does not carry a `<job user="Teams
Using Agents">` block — its enumeration covers only Engineering Leaders,
Empowered Engineers, and Platform Builders.

The gap is structural, not editorial. Three specs already in flight or merged
hire Teams Using Agents inline because no canonical JTBD entry exists to
cite:

| Spec | Hiring pattern | Consequence |
| --- | --- | --- |
| [`860-measurement-system-change-protocol`](../860-measurement-system-change-protocol/spec.md) | Cites a `JTBD § Teams Using Agents` anchor link. | Anchor does not resolve in the current `JTBD.md`. |
| [`880-canonical-metric-cardinality`](../880-canonical-metric-cardinality/spec.md) | Names Teams Using Agents in its Persona / job line, sourced from CLAUDE.md prose. | Persona citation has no JTBD anchor — verification is anchored in KATA.md § Metrics, not in a JTBD contract. |
| [`980-memory-protocol-redesign`](../980-memory-protocol-redesign/spec.md) § Personas and Job | Explicitly identifies the gap and commits to opening the follow-up issue ([#952](https://github.com/forwardimpact/monorepo/issues/952)) that this spec resolves. | Spec acknowledges its WHY anchor is missing and depends on this spec to land. |

The JTBD.md generator and the vision narrative document also disagree:

- The generator (`libraries/libcoaligned/src/jtbd.js`) enumerates the three
  legacy personas as the only admissible job-author values, and reads jobs
  exclusively from `products/*/package.json .jobs`.
- No `products/kata/` directory exists today. Kata ships as a skill pack
  under `.claude/skills/kata-*/`, an architectural choice CLAUDE.md
  § Distribution Model preserves on purpose. (The absence is current state,
  not a constraint — design may add a synthetic `products/kata/` source if
  appropriate.)
- CLAUDE.md § Primary Products and JTBD.md present overlapping persona
  enumerations with Teams Using Agents missing from the latter.

Three surfaces disagree: vision narrative, generator pipeline, generated
document. Any partial fix re-introduces the disagreement on the next
`bun run context:fix` run.

## Why now

The drift compounds with every Kata-adjacent spec:

- Each inline hire repeats CLAUDE.md text verbatim, accumulating drift risk
  with every rewording of either document.
- Spec 980 (memory-protocol-redesign), currently `design approved` per
  `wiki/STATUS.md`, verifies against a Big Hire that has no canonical anchor;
  any future tweak to the persona name or hire phrasing breaks the spec
  retroactively.
- Issue [#950](https://github.com/forwardimpact/monorepo/issues/950) signals
  the next wave of Kata-adjacent specs (memory protocol redesign research
  corpus ready). Resolving the canonical anchor before that wave lands lets
  it reference rather than restate.
- Recurrence signal: spec 980 (memory-protocol-redesign, PR #951) opened the
  follow-up issue this spec resolves at the same time it hired the persona
  inline — the gap was visible at point-of-spec and is now in the queue with
  the issue addressable.

## Strategic decision: Teams Using Agents stays as a top-level persona

The triage comment
([#952 issuecomment-4467422313](https://github.com/forwardimpact/monorepo/issues/952#issuecomment-4467422313))
enumerated three design-space options. The strategic question — whether to
keep Teams Using Agents as a top-level persona or fold it under an existing
one — is a WHAT/WHY decision the spec must resolve. The mechanism question
(how the generator ingests Kata) is a HOW decision the design phase resolves.

| Option | Disposition |
| --- | --- |
| A — Add the persona to the enumeration; wire Kata into the generator pipeline via a synthetic `products/kata/` source. | Mechanism deferred to design. |
| B — Add the persona to the enumeration; generator source is new machinery (e.g., `KATA.md` or skill-pack metadata) rather than synthetic `products/kata/package.json`. | Mechanism deferred to design. |
| C — Fold Kata under Empowered Engineers § Equip Aligned Agent Teams; remove Teams Using Agents from the vision narrative. | Rejected (see below). |

**Why Option C is rejected.** Empowered Engineers § Equip Aligned Agent Teams
is a configuration job — one-time setup adjacent to Pathway, framed around
agent _configuration_. Kata's positioning is the _operation_ of an autonomous
team running a daily Plan-Do-Study-Act loop. The hires are not the same job
at different scope; they are different jobs. Two specs already merged (860,
980) hire Teams Using Agents specifically against the autonomous-loop framing;
spec 880 names the persona but anchors verification in KATA.md § Metrics, so
its dependence on the framing is weaker but its persona citation still
requires a canonical anchor. CLAUDE.md § Primary Products enumerates Teams
Using Agents alongside Engineering Leaders and Empowered Engineers as a
coordinate persona; demoting it without rewriting the vision narrative breaks
the primary-products top-level structure.

## Candidate job structure

Design picks the final wording. Only the **floor** below is binding; the
trigger/little-hire/competes-with/forces/fired-when prose is _illustrative_
to help review evaluate fit.

**Binding floor (design must not drop):**

- The Big Hire mentions both _autonomous_ operation and the
  _Plan-Do-Study-Act_ loop (or its expanded form: plans, ships, studies
  traces, acts on findings).
- The hire identifies Kata as the product fired (` → **Kata**` arrow in
  JTBD.md house style).
- The job is filed under `<job user="Teams Using Agents">` — not under any
  other persona.

**Illustrative (design may rewrite):**

| Field | Draft |
| --- | --- |
| Heading | _Teams Using Agents: Run a Continuously Improving Agent Team_ |
| Trigger | "Agents are shipping work but nobody can tell whether the team is getting better — the only feedback loop is reading every diff." |
| Big Hire | "Run an autonomous, continuously improving development team that plans, ships, studies its own traces, and acts on findings." → **Kata** |
| Little Hire | "Onboard a Kata installation that runs the Plan-Do-Study-Act loop without per-team prompt engineering." → **Kata** |
| Competes With | bespoke per-agent system prompts; manual orchestration scripts; not measuring agent outcomes; abandoning agent investment after a failed pilot |
| Forces | _Push:_ agent regressions are silent until users complain. _Pull:_ a closed loop that surfaces what improved and what regressed, grounded in evidence. _Habit:_ treating each agent run as a one-off rather than an iteration. _Anxiety:_ autonomy might amplify bad patterns faster than humans can intervene. |
| Fired When | The autonomous loop becomes harder to operate than direct prompting; or organizational policy bans autonomous agent execution. |

Design may add a second job for the Study-and-Act half of the loop (e.g.,
"Help me act on the patterns my agent team surfaces about itself"). One job
is the floor; two is design-determined.

## Scope

The change set must land as one coherent unit — generator pipeline change
without JTBD.md content leaves the block empty; JTBD.md content without
generator change drifts on the next `bun run context:fix` run.

| Surface | Change kind |
| --- | --- |
| `JTBD.md` | Add a `<job user="Teams Using Agents">` block (one or two jobs) matching the house style: Trigger, Big Hire, Little Hire, Competes With, Forces, Fired When. |
| `libraries/libcoaligned/src/jtbd.js` (and adjacent code) | Make the JTBD generator accept _Teams Using Agents_ as a valid persona value, and read that persona's jobs from one design-chosen authoritative source. Mechanism (allowlist extension, schema replacement, or other) is design-determined. |
| Authoritative source for the new persona's jobs | An upstream source exists somewhere in the working tree (location and shape design-chosen) such that the JTBD block regenerates from it deterministically without per-edit hand-curation of `JTBD.md`. |
| `CLAUDE.md` § Primary Products persona bullet for Teams Using Agents — the bullet currently reading `- **Teams Using Agents** — Run an autonomous, continuously improving development team that plans, ships, studies its own traces, and acts on findings.` | Replace the inline Big Hire restatement with a link to the canonical JTBD entry. The `### Kata — kata-skills` product subsection further down is **not** in scope — it is a per-product description, not the cross-persona summary. |
| Generator tests under `libraries/libcoaligned/test/` | Update unit tests and any golden fixtures within that directory to admit the new persona and new source. |

## Out of scope

- Content edits to `KATA.md` (architecture descriptions, agent enumeration,
  workflow listings) and to `.claude/skills/kata-*/SKILL.md` (procedures,
  checklists, domain knowledge). _Exception:_ if design's chosen authoritative
  source lives in either of those files, the minimum structured-metadata
  addition needed for the generator to read it is in-scope — but no
  rewriting of existing prose content.
- The `### Kata — kata-skills` product subsection in CLAUDE.md (lines
  currently beginning "Hired by teams using agents to run an autonomous
  development team that keeps getting better"). That subsection is a
  per-product description across all primary products and would only be
  touched under a separate vision-narrative refactor.
- Retroactive edits to merged specs 860, 880, and 980. They were authored
  under the historical gap; once the canonical entry exists, future specs
  cite it. The inline restatement in those completed specs remains as-is.
- Defining schemas for `products/kata/package.json` or skill-pack metadata
  beyond what is needed for the generator to produce the block.
- Rewriting any of the existing `<job>` blocks under Engineering Leaders, Empowered Engineers, or Platform Builders in JTBD.md.
- Cross-repo follow-ups in sibling `forwardimpact/*` repos that consume
  JTBD.md by reference.

## Success criteria

| # | Criterion | Verification |
| --- | --- | --- |
| 1 | `JTBD.md` carries a `<job user="Teams Using Agents">` block whose Big Hire mentions both _autonomous_ operation and the _Plan-Do-Study-Act_ loop framing, and identifies Kata as the product fired. | The Big Hire line satisfies all three: (a) contains the substring `autonomous`; (b) contains the substring `Plan-Do-Study-Act` OR contains all four substrings `plan`, `ship`, `stud`, `act` (each as substring, in any order); (c) ends with the literal token `→ **Kata**`. Checkable with `grep` against `JTBD.md`. |
| 2 | The JTBD generator accepts _Teams Using Agents_ as a valid job-author value without raising its persona-allowlist validation error. | `bun run context:check-jtbd` exits cleanly on a working tree that contains the new entry. |
| 3 | The Teams-Using-Agents JTBD block regenerates from a single upstream source — it is not hand-curated content in `JTBD.md`. | Removing only the `<job user="Teams Using Agents">` block from `JTBD.md` and running `bun run context:fix` restores the block byte-identically; subsequently, two consecutive `bun run context:fix` runs leave the working tree clean. |
| 4 | The `CLAUDE.md` § Primary Products persona bullet for Teams Using Agents (the bullet identified verbatim in the Scope table above) no longer restates the Big Hire inline; it links to the JTBD entry instead. | The bullet matches the shape `- **Teams Using Agents** — [<short link text>](JTBD.md#<anchor>)` — exactly one markdown link, no sentence-form clauses after the em-dash, no embedded reference to "autonomous" or "Plan-Do-Study-Act" outside the link text. The link target resolves to the new Teams Using Agents `<job>` block heading. |
| 5 | JTBD.md and CLAUDE.md (across § Primary Products and § Secondary Products) agree on which personas exist. | Each persona named in CLAUDE.md § Primary Products _or_ § Secondary Products has at least one `<job>` block in JTBD.md; each `<job user="…">` value in JTBD.md names a persona that appears in CLAUDE.md § Primary Products _or_ § Secondary Products. No persona appears in one document and is absent from the other. (Product-firing agreement for the Kata Big Hire is covered separately by criterion 6.) |
| 6 | The autonomous-loop Big Hire fires Kata from exactly one persona: Teams Using Agents. | `grep` for Big Hire lines ending with `→ **Kata**` in `JTBD.md` returns matches only inside `<job user="Teams Using Agents">` blocks; no `<job>` block under another persona ends a Big Hire with `→ **Kata**`. |
