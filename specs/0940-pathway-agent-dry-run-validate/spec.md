# Spec 0940 — Pathway agent generation: dry-run and drift validation

## Problem

`npx fit-pathway agent <discipline> --track=<track>` resolves the standard data
into a concrete agent profile (skills, behaviours, drivers, toolkit, settings)
and either prints the rendered markdown (no `--output`) or writes the full
artefact tree to `.claude/`. Today there is no way to ask "what would Pathway
*resolve* for this combination, and is the resolution coherent?" before the
bytes hit disk.

The persona quote from user testing (issue
[#885](https://github.com/forwardimpact/monorepo/issues/885), `kata-interview`
Pathway run, 2026-05-12):

> No `validate` or `--dry-run` on `agent`. Pathway preaches "edit the YAML,
> regenerate," but offers no nudge to validate the standard before generating.
> If `data/pathway/` is stale, you just get stale agents.

### What's already covered, and what isn't

`fit-pathway` *calls* `validateAllData` from `@forwardimpact/map/validation`
at the start of every command (`products/pathway/bin/fit-pathway.js:324`),
which is the same entity-level reference and shape check `fit-map validate`
performs. The agent generation path additionally calls `validateAgentProfile`
and `validateAgentSkill` against the fully-resolved in-memory profile
**before any file is written** (`products/pathway/src/commands/agent.js:187`),
so partial-on-disk artefacts are not the gap.

The genuine gap is what neither check looks at: the *resolved output of a
specific discipline×track combination at the reference level*. Entity-level
validation confirms each reference points to a published entry, but does not
ask "after composing capabilities, applying skill modifiers, and filtering
to the reference level, did this combination produce a usable agent?" A
discipline tier may reference valid published skills, yet level filtering
reduce the matrix to empty; a non-empty skill set may produce an empty
toolkit. Those resolution outcomes are invisible to any entity-level pass.

The drift classes this spec adds to the gap:

| Drift class | Already caught? | Why current checks miss it |
| --- | --- | --- |
| **Empty skill set after composition** | No | Each discipline tier (`coreSkills`/`supportingSkills`/`broadSkills`) may reference valid published skills, yet the agent-skill filter reduces the matrix to zero at the reference level; entity-level validation checks entries one at a time and never composes them |
| **Empty toolkit despite a non-empty skill set** | No | The toolkit is derived from the union of tools across resolved skills; the combination may produce a non-empty skill set whose toolkit is empty |

Beyond the resolution gap, the published workflow ([Configuring Agent
Teams](https://www.forwardimpact.team/docs/products/agent-teams/index.md), §
Preview the agent configuration) tells the reader: run `agent` without
`--output` to "preview." That works for visual scan of the *rendered*
markdown, but it hides the resolved inputs that produced it (which skills the
discipline×track resolved to with their source capability; which level fed the
toolkit; which behaviours composed). When the standard drifts under an author
who edits YAML and regenerates, the only feedback loop on the *inputs* today
is reading the rendered profile and inferring backwards.

### JTBD

**Empowered Engineers § Equip Aligned Agent Teams.** This spec serves the
Big Hire ("Help me configure agents to meet the expectations the organization
holds for humans"): trust in the resolution step is the precondition for
delegating standard maintenance to YAML edits. The Anxiety force named in
JTBD.md ("Over-constraining agents might limit their usefulness on novel
tasks") composes with the persona's own ("the *wrong* constraints silently
propagate into every generated agent") — silent resolution gaps make both
anxieties live.

## Scope

| Surface | Change | Excluded |
| --- | --- | --- |
| `fit-pathway agent` | Add a flag that resolves and prints the inputs Pathway would feed to the generators — discipline ID, track ID, reference level ID, the resolved skill set (each entry tagged with its source capability), behaviour set, driver set, toolkit, and the merge targets for `claudeSettings` and `vscodeSettings` — without writing any file and without producing the rendered markdown profile | Designing a richer resolved-input data structure beyond what the existing derivation functions produce |
| `fit-pathway agent` | When invoked in a generation mode (with or without `--output`), run the per-combination resolution check named in § Drift classes; on an error-class drift, exit non-zero with a structured stderr message before any file is written | Re-implementing entity-level reference checks inside Pathway; surfacing the `validateAllData` result that `fit-pathway` currently calls but does not act on (a separate plumbing fix tracked elsewhere) |
| `fit-pathway` (top level) | Add a standalone validate entry point that runs the same per-combination resolution check across the set of pairs surfaced by `agent --list`, so authors can ask "is every published combination still coherent?" without picking a pair | Iterating combinations the standard does not publish (the `--list` filter defines "published") |
| `agent --list` | Annotate each emitted row with one of three resolution states (clean / warning / error) so the discovery surface itself surfaces resolution drift; warning and error must be visually distinguishable from each other and from clean | Re-architecting `agent --list` output shape; adding new columns beyond status; surfacing rows currently filtered out by `findValidCombinations` |
| Documentation | Update `websites/fit/docs/products/agent-teams/index.md` to add a "Validate before generating" step between Preview and Generate, so the published workflow reaches the dry-run and validate entry points; keep `.claude/skills/fit-pathway/SKILL.md` `## Documentation` and the libcli `documentation` array in parity per [skills/CLAUDE.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/skills/CLAUDE.md) | Splitting a new top-level guide page; cross-linking to a guide that does not yet exist |
| `--help` | Surface both the new `agent` flag and the standalone validate entry point in their libcli command definitions | — |

Out of scope: the `interview`, `progress`, `job`, `dev`, `serve`, `build`,
`update` commands. Out of scope: schema changes to entities in
`products/map/starter/` or `data/pathway/`. Out of scope: any change to what
`agent` writes when invoked with `--output` (file layout, file names, contents
of generated artefacts) — this spec only adds a pre-write resolution check
and a no-write preview of the resolution inputs. Out of scope: running the
new check on `agent --list`, `agent --skills`, `agent --tools`, or any
non-generating mode beyond the `--list` row-state annotation in the row
above.

## Drift classes the pre-generation check must catch

The check exists to catch resolution-time gaps that entity-level validation
does not surface, and that are distinct from the cases entity-level checks
already cover (whether or not the existing pipeline surfaces those cases to
the user today).

| Class | Trigger | Outcome |
| --- | --- | --- |
| **Empty skill set after composition** | The skill set resolved for the requested discipline×track at the reference level is empty even though each tier's references are individually valid | Error |
| **Toolkit empty** | The toolkit derived from the resolved skill set is empty despite the skill set being non-empty | Warning |

The error row fails the generation; the warning row prints and continues
(so authors who deliberately publish a partial standard during a refactor
still get an agent, but with the signal they need).

## Success criteria

| # | Criterion | Verification |
| --- | --- | --- |
| 1 | The dry-run mode of `agent` prints, on stdout, each of: the discipline ID, the track ID, the reference level ID, every resolved skill ID with its source capability ID, every resolved behaviour ID, every resolved driver ID, the toolkit (list of tool IDs), and the merge targets for `claudeSettings` and `vscodeSettings`; writes no file; exits 0 when resolution is clean | A test that runs the dry-run on the starter standard for `software_engineering × platform`, asserts each named field appears in stdout, asserts no file under `cwd` was created or modified by the run, asserts exit code 0 |
| 2 | `agent` exits non-zero on every error-class drift in § Drift classes, naming the failing discipline×track and the drift class, on stderr, before any file is written | A test for each error-class drift: produce a fixture standard in which the chosen discipline×track resolves to an empty skill set after composition (for example, by narrowing the discipline's tier references at the reference level so no skill is admitted); run `agent --output=./out`; assert exit code != 0; assert stderr contains the discipline ID, the track ID, and the drift-class name; assert `./out` was not created |
| 3 | The standalone validate entry point exits non-zero when any pair surfaced by `agent --list` has an error-class drift, prints one error block per failing pair, and exits 0 when every pair is clean or has only warnings | Two tests: (a) mutate the fixture to break exactly one pair, run validate, assert exit != 0, assert the broken pair appears in stderr and clean pairs do not; (b) run validate on the unmutated starter, assert exit 0 |
| 4 | `agent --list` row-state annotation distinguishes clean, warning, and error pairwise on a single rendered run | A test that mutates the fixture to produce one error pair, one warning pair, and one clean pair, runs `agent --list`, captures the rendered rows, and asserts the three indicators are mutually distinct strings |
| 5 | The error message on each error-class drift names both halves of the failing combination and the drift-class name | A test that breaks `software_engineering × platform`, runs `agent --output=./out`, asserts stderr contains `software_engineering`, `platform`, and the drift-class name (e.g. `empty-skill-set`); asserts `./out` was not created |
| 6 | The published agent-teams guide reaches the new dry-run and validate entry points in the documented workflow, and the libcli/SKILL.md doc parity holds | (a) Grep `websites/fit/docs/products/agent-teams/index.md` for a "Validate before generating" section that references both new entry points; (b) assert `fit-pathway` libcli `documentation` array and `.claude/skills/fit-pathway/SKILL.md` `## Documentation` block carry identical entries in identical order |
| 7 | No observable behaviour change for non-dry-run, non-error invocations on a clean standard | A test that runs `agent software_engineering --track=platform` (no `--dry-run`, no `--output`) on the unmutated starter standard, captures stdout and stderr, asserts the rendered markdown profile section is byte-equal to the same section captured from the previous commit on the branch (snapshot in the test fixtures), and asserts no warning lines appear on stderr |

## Out-of-scope drift Pathway will not catch

Some drift is genuinely beyond Pathway's reach and the spec calls it out so
the success bar is honest:

- **Entity-level reference breaks** — `validateAllData` already enumerates
  these (whether or not `fit-pathway` currently surfaces the result to the
  user); this spec does not re-implement them. Surfacing the discarded
  result is a separate fix.
- **Semantic staleness in prose** — a behaviour's `description` text became
  obsolete after a process change. The YAML is structurally valid and resolves
  cleanly; no agent-generation step can detect that the words are wrong.
- **Off-standard expectations** — the standard published by `fit-map` is
  internally consistent but contradicts an external policy the team adopted
  separately. Out of scope for Pathway.
- **Drift in `data/pathway/` relative to the upstream `products/map/starter/`
  the standard was forked from.** Distribution-time concern; out of scope.

## Relation to spec 0920

[Spec 0920](https://github.com/forwardimpact/monorepo/tree/main/specs/0920-pathway-organizational-context)
(`pathway organizational context`) added an `## Organizational Context` slot
so teams can add per-team facts — closing the *configuration breadth* gap.
This spec closes the *configuration trust* gap on the same JTBD. "Edit the
prompt myself" is the Competes With force (JTBD.md "custom system prompts");
both breadth and trust must hold for an Empowered Engineer to keep choosing
Pathway over that competitor.

## What this spec does not commit to

- **Flag spelling.** Whether the dry-run flag is `--dry-run`, `--preview`, or
  inherits the existing `--validate` shape used by entity commands is a design
  decision; the spec requires the behaviour, not the spelling.
- **Standalone validate command shape.** Whether the standalone surface is a
  new subcommand, an extension of an existing pattern, or a flag on the
  top-level binary is a design decision.
- **Output format for resolved inputs.** Whether the resolution preview is
  bulleted markdown, JSON, or a table is a design decision constrained by
  Success Criterion 1 (each named input field must be present in stdout).
- **Drift indicator on `agent --list`.** Whether the indicator is a leading
  symbol, a trailing tag, or a separate column is a design decision; the spec
  requires the three states be visually distinguishable from each other on a
  single rendered run.
