# Spec 940 — Pathway agent generation: dry-run and drift validation

## Problem

`npx fit-pathway agent <discipline> --track=<track>` resolves the standard data
into a concrete agent profile (skills, behaviours, drivers, toolkit, settings)
and either prints it (no `--output`) or writes it to `.claude/`. Today there is
no way to ask "what would Pathway resolve, and is it still coherent?" before
the bytes hit disk.

The persona quote from user testing (issue
[#885](https://github.com/forwardimpact/monorepo/issues/885), `kata-interview`
Pathway run, 2026-05-12):

> No `validate` or `--dry-run` on `agent`. Pathway preaches "edit the YAML,
> regenerate," but offers no nudge to validate the standard before generating.
> If `data/pathway/` is stale, you just get stale agents.

The published workflow ([Configuring Agent
Teams](https://www.forwardimpact.team/docs/products/agent-teams/index.md), §
Preview the agent configuration) tells the reader: run `agent` without
`--output` to "preview." That works for visual scan of the rendered
*markdown*, but it does not surface the *resolved inputs* that produced it
(which skills the discipline×track resolved to; which level fed the toolkit;
whether a skill the standard references still exists). When the standard
drifts under an author who edits YAML and regenerates, the only feedback loop
left is "ship the agent and watch reviewers reject its PRs" — the same problem
Pathway exists to solve.

Two specific classes of drift get through today:

| Drift class | Example | Caught by `fit-map validate`? | Caught by current Pathway? |
| --- | --- | --- | --- |
| **Resolution-empty** | A discipline×track combination resolves to an empty skill set after a track renames its required capabilities | No — `fit-map validate` checks schema and SHACL shapes on entities in isolation, not the cross-entity resolution Pathway performs | No — `agent` happily generates an empty-skill agent profile |
| **Stale reference at resolution time** | A skill the discipline's track entry names was renamed in `capabilities/*.yaml` but the track entry was not updated | Partially (if SHACL shape catches the foreign-key break) | No — `agent` exits with `Unknown ...` only after the missing reference is reached; partial generation may have occurred when `--output` is set |

Both classes are invisible to the current preview because preview shows the
*rendered* artefact, not the resolution that produced it.

JTBD: **Empowered Engineers § Equip Aligned Agent Teams.** The Little Hire
("Help me give agents organizational context without bespoke prompts") is
adjacent; this spec serves the Big Hire ("Help me configure agents to meet the
expectations the organization holds for humans") because trust in the
generation step is the precondition for ever delegating standard maintenance
to YAML edits. The Anxiety force named in JTBD.md ("Over-constraining agents
might limit their usefulness on novel tasks") composes with the persona's own
("the *wrong* constraints silently propagate into every generated agent") —
silent drift makes both anxieties live.

## Scope

| Surface | Change | Excluded |
| --- | --- | --- |
| `fit-pathway agent` | Add a flag that resolves and prints the inputs Pathway would feed to the generators — discipline, track, level, skills (with source capability), behaviours, drivers, toolkit, settings paths — without writing files and without invoking the markdown formatters | Designing a new resolved-profile output format beyond what the existing derivation functions already produce |
| `fit-pathway agent` | Run the new pre-generation drift checks at the start of every invocation (with or without the new flag), exiting non-zero with a structured error before any bytes hit disk | Re-running `fit-map validate` from inside Pathway (data-shape validation stays a Map concern) |
| `fit-pathway` (top level) | Add a standalone validate entry point that runs the same drift checks across every discipline×track the standard publishes, so authors can ask "is the whole standard coherent for agent generation?" without picking a pair | Validating combinations that are intentionally not published (the standard already omits them from `agent --list`) |
| `agent --list` | Annotate each row with a drift status (clean / warning / error) so the discovery surface itself surfaces the problem | Re-architecting `agent --list` output shape; adding new columns beyond status |
| Documentation | Update `websites/fit/docs/products/agent-teams/index.md` to add a "Validate before generating" step between Preview and Generate; update the matching skill `.claude/skills/fit-pathway/SKILL.md` `## Documentation` block if a new guide is introduced (otherwise no new link) | Splitting a new top-level guide unless the docs author judges the existing page over-length |
| `--help` | Reflect both surfaces in libcli `documentation` and command definitions | n/a |

Out of scope: the `interview`, `progress`, `job`, `dev`, `serve`, `build`,
`update` commands. Out of scope: schema changes to entities in
`products/map/starter/` or `data/pathway/`. Out of scope: any change to what
`agent` writes when invoked with `--output` (file layout, file names, contents
of generated artefacts) — this spec only adds a pre-write check and a
no-write preview of the resolution inputs.

## Drift classes the pre-generation check must catch

The check exists to catch resolution-time gaps that schema-level validation
does not surface. Concretely:

| Class | Trigger | Outcome |
| --- | --- | --- |
| **Empty skill set** | `deriveAgentSkills` returns `[]` for the requested discipline×track at the reference level | Error |
| **Unresolved skill reference** | A skill ID named by the agent track or by a capability resolved at the reference level does not match any entry in `skills` / `capabilities` | Error |
| **Unresolved behaviour reference** | A behaviour ID named by `agent.behaviours` does not match any entry in `behaviours` | Error |
| **Missing reference level** | `deriveReferenceLevel` cannot pick a level (zero levels published) | Error |
| **No agent definition** | A discipline×track shown in `agent --list` has no matching entry under the agent data tree | Warning (today this is silently filtered out of `--list`; surface it so authors notice) |
| **Toolkit empty** | `deriveToolkit` returns an empty toolkit despite a non-empty skill set | Warning |

The "error" rows fail the generation; the "warning" rows print and continue
(so authors who deliberately publish a partial standard during a refactor
still get an agent, but with the signal they need).

## Success criteria

| # | Criterion | Verification |
| --- | --- | --- |
| 1 | Running `agent` with the new dry-run flag prints the resolved inputs the generators would use, writes no files, and exits 0 when resolution is clean | `npx fit-pathway agent software_engineering --track=platform --dry-run` on the starter standard prints discipline / track / level / skills / behaviours / drivers / toolkit / settings paths; `test -e .claude` is false after the run; exit code is 0 |
| 2 | `agent` exits non-zero on each error-class drift before any files are written, naming the offending entity ID | A test that mutates a fixture standard to remove a capability referenced by `software_engineering × platform`, runs `agent --output=./out`, asserts exit code != 0, asserts the unresolved skill ID appears in stderr, asserts `./out/.claude` does not exist |
| 3 | The standalone validate entry point exits non-zero when *any* published discipline×track combination has an error-class drift, and prints one error block per failing combination | A test that mutates the same fixture and runs the validate entry point, asserts exit code != 0, asserts every failing discipline×track ID appears in stderr |
| 4 | `agent --list` shows a drift indicator on rows whose resolution is not clean | A test that mutates a fixture to break exactly one combination, runs `agent --list`, asserts the broken row carries a drift indicator distinguishable from clean rows and that other rows do not |
| 5 | Persona-shaped outcome: an engineer who breaks the standard sees the break *before* generating files and can act on the message | A reader following the updated [Configuring Agent Teams](https://www.forwardimpact.team/docs/products/agent-teams/index.md) guide, after the published "Validate before generating" step, can identify which discipline×track is broken and which entity ID is at fault without reading source code |
| 6 | Documentation parity | `fit-pathway` libcli `documentation` array and `.claude/skills/fit-pathway/SKILL.md` `## Documentation` block carry identical entries in identical order after the change |
| 7 | No behaviour change when resolution is clean and the new flag is absent | A test that runs `agent software_engineering --track=platform` (no `--dry-run`, no `--output`) on the unmutated starter standard and asserts stdout bytes are identical to a baseline captured from `origin/main` |

## Out-of-scope drift Pathway will not catch

Some drift is genuinely beyond Pathway's reach and the spec calls it out so
the success bar is honest:

- **Semantic staleness in prose** — a behaviour's `description` text became
  obsolete after a process change. The YAML is structurally valid and resolves
  cleanly; no agent-generation step can detect that the words are wrong.
- **Off-standard expectations** — the standard published by `fit-map` is
  internally consistent but contradicts an external policy the team adopted
  separately. Out of scope for Pathway; this is the job `fit-map validate` or
  a peer-review process owns.
- **Drift in `data/pathway/` relative to the upstream `products/map/starter/`
  the standard was forked from.** Distribution-time concern; out of scope.

## Persona link

Spec 920 (`pathway organizational context slot`) added a `## Organizational
Context` slot so teams can add per-team facts. That spec closed the
*configuration breadth* gap. This spec closes the *configuration trust* gap on
the same JTBD — both are needed for the Little Hire to stop bleeding to "edit
the prompt myself" (the active Fired When for *Equip Aligned Agent Teams*).

## What this spec does not commit to

- **Flag spelling.** Whether the dry-run flag is `--dry-run`, `--preview`, or
  inherits the existing `--validate` shape used by entity commands is a design
  decision; the spec requires the behaviour, not the spelling.
- **Standalone validate command shape.** Whether the standalone surface is a
  new subcommand, an extension of an existing pattern, or a flag on the
  top-level binary is a design decision.
- **Output format for resolved inputs.** Whether the resolution preview is
  bulleted markdown, JSON, or a table is a design decision constrained by
  Success Criterion 1 (the named inputs must all be visible).
- **Drift indicator on `agent --list`.** Whether the indicator is a leading
  symbol, a trailing tag, or a separate column is a design decision; the spec
  requires it be distinguishable from a clean row.
