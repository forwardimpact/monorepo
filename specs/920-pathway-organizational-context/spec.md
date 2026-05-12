# Spec 920 — Pathway Organizational Context Slot for Agent Generation

## Problem

`fit-pathway agent` generates `.claude/CLAUDE.md` for an engineer's coding agent
by interpolating the chosen track's `teamInstructions` block. That block
accepts free-form prose, and the existing
[Give Agents Organizational Context guide](../../websites/fit/docs/products/agent-teams/organizational-context/index.md)
teaches users to put team-specific facts (deployment targets, conventions)
there. The mechanism works for one team. It does not work for an organization
whose engineering standard is installed once and whose tracks are shared
across multiple teams.

The track scope is the problem. `tracks/platform.yaml` defines what "platform
engineering" means at the organization — golden paths, backward compatibility,
developer-experience priority. Those statements are shared across every team
that hires a Platform engineer. The repository names a specific team works in,
the manager that team escalates to, the adjacent leads on neighboring teams,
the active project names, and the escalation paths for after-hours pages are
all per-team facts. Putting them in `tracks/platform.yaml` either contaminates
every other Platform team's agent with the wrong context, or forces the
organization to fork the track per team — abandoning the standard.

A Senior Software Engineer at a pharma org exercised the generator during
user testing on issue [#881](https://github.com/forwardimpact/monorepo/issues/881)
and reported the gap verbatim:

> Nothing in the discipline/track YAML accepts repo names, team handles, or
> escalation paths. The generated CLAUDE.md is purely the track's
> `teamInstructions` text. I'd want a `repository`-level YAML that injects
> "Repos: molecularforge, data-lake-infra, api-gateway. Manager: Athena.
> Adjacent leads: Iris (DX), Prometheus (DS/AI)" into CLAUDE.md. Today I'd
> hand-append after generation, which contradicts the tool's "don't edit
> outputs" guidance.

The persona's diagnosis ("nothing accepts") is technically inaccurate — track
`teamInstructions` accepts any prose. The persona's experience is real:
populating `tracks/platform.yaml` with their team-specific text would corrupt
the track for every other Platform team in the organization. They are left
with two options: hand-edit the rendered `.claude/CLAUDE.md` (which the next
`fit-pathway agent` run overwrites), or maintain a fork of the track per team.
Both abandon Pathway's value proposition. This is the *Equip Aligned Agent
Teams* job's **Fired When** force ("configuration overhead exceeds the quality
gain") activating exactly as the JTBD predicts, and the **Competes With**
alternatives (custom system prompts, copying another team's config) hold their
appeal for the team-specific layer Pathway cannot deliver today.

The blast radius is the Little Hire on the *Equip Aligned Agent Teams* job —
"give agents organizational context without bespoke prompts" — for any
installation where the standard is shared across more than one team. The
adjacent Big Hire ("configure agents to meet the expectations the
organization holds for humans") is delivered today by the discipline+track
output for the shared-expectations slice; this spec closes the per-team slice
the Big Hire also covers. Single-team installations and engineers who do not
work across multiple repositories are not affected.

## Personas and Job

The hire is **Empowered Engineers** against the *Equip Aligned Agent Teams*
job (see [JTBD.md](../../JTBD.md), under the `<job user="Empowered Engineers"
goal="Equip Aligned Agent Teams">` entry). The Little Hire — "give agents organizational context
without bespoke prompts" — names the specific outcome this spec delivers. The
job's **Trigger** ("an agent's work was rejected because it followed generic
practices instead of the organization's standards") is what the persona will
stop experiencing once their agent has access to the team's repos, manager,
leads, projects, and escalation paths in a form derived from versioned inputs
rather than hand-appended after generation.

The downstream observable is the rendered `.claude/CLAUDE.md` the engineer
reads and the agent loads: it must surface the per-team facts the persona
named, in a place the agent will see and the engineer can verify, while the
shared discipline+track guidance remains unchanged. The agent itself is not a
persona.

## Scope

### In scope

| Component | What changes |
|---|---|
| Standard schema | The Pathway data standard gains an installation-scoped organizational context slot, sibling to the existing `claude-settings.yaml` precedent in the starter standard. The slot represents per-team facts that do not belong on a track shared across teams. Whether the slot is a single file or a directory of files, its exact path within the starter, and the YAML key names are design choices. |
| Fields carried | Exactly six concerns are representable, each named after the persona's verbatim example: a list of **repository names** ("molecularforge, data-lake-infra, api-gateway"); one **team handle**; one **manager handle** ("Athena"); a list of **adjacent leads**, each carrying a free-form role tag ("Iris (DX), Prometheus (DS/AI)"); a list of **active project names**; and a list of **escalation paths**, each carrying a free-form trigger condition and an addressable destination (a handle, an email, or a URL). Additional concerns require a new spec. The exact YAML shape of each concern is a design choice. |
| Validation | `bunx fit-map validate` accepts the new slot, reports line-attributable errors for missing required fields, unknown fields, and type mismatches, and reports no errors when the slot is absent or when every entry is a syntactically valid string. The validator does not constrain handle content (handles are free-form strings in v1). |
| `fit-pathway agent` CLI integration | When the slot is present, the generator emits an organizational context section into the rendered `.claude/CLAUDE.md`, carrying the six concerns. The section opens with a documented marker (an anchor, heading, or fenced block — design choice) that downstream tooling can detect by string match alone, without parsing the body. The section is distinguishable from the `teamInstructions` body emitted by the same generator. The section is emitted whenever the slot is present; no flag opt-in is required. When the slot is absent, the rendered `.claude/CLAUDE.md` is identical to the file the generator produces on `main` immediately before this spec lands, for the same discipline+track inputs. The implementation captures that baseline as a fixture before the change ships, and the test compares against it. |
| Web agent-builder integration | The web agent-builder preview page (`products/pathway/src/pages/agent-builder*.js`, which already exists and shares `interpolateTeamInstructions` with the CLI) renders the organizational context section when the slot is present, carrying the same six concerns in the same textual order as the CLI's rendered `.claude/CLAUDE.md`. The preview's rendered text for the section is byte-identical to the corresponding section in the CLI's file output (web styling and surrounding chrome are excluded from the comparison). |
| "Don't edit outputs" invariant preserved | An engineer who populates the slot and then re-runs `fit-pathway agent --output=<dir>` twice produces a `.claude/CLAUDE.md` whose bytes match across both runs. The slot's YAML is the only file the engineer touches to update repos, manager, leads, projects, or escalation paths. |
| Starter content | The monorepo's starter standard (`products/map/starter/`) ships an example slot whose contents follow the shape of the persona's verbatim quote: a multi-repo list, a single manager handle, two or more adjacent leads with role tags, a project list, and at least one escalation path. Placeholder values, not real handles. Running `bunx fit-pathway agent software_engineering --track=platform --output=<dir>` against the unmodified starter renders a `.claude/CLAUDE.md` whose organizational context section carries the placeholder values verbatim. |
| Documentation | The existing [Give Agents Organizational Context guide](../../websites/fit/docs/products/agent-teams/organizational-context/index.md) is updated to introduce the new layer, distinguish it from the shared-across-teams `teamInstructions` layer (so future readers do not repeat the persona's misdiagnosis), and teach when each layer applies. The [Authoring Agent-Aligned Engineering Standards guide](../../websites/fit/docs/products/authoring-standards/index.md) carries an entry for the new slot alongside disciplines, tracks, levels, capabilities, behaviours, and drivers. The `fit-pathway agent --help` text and the `fit-pathway` skill list the guide URL per [products/CLAUDE.md § Linking rule](../../products/CLAUDE.md). |

### Out of scope, deferred

- **Per-repository overrides.** v1 carries one organizational context per
  standard installation. A team with multiple distinct repositories that
  need different manager handles or escalation paths edits the slot per
  installation. Multi-tenancy within a single standard (one slot per repo)
  is a separate spec.
- **Roster-backed handle validation.** Handles are free-form strings in v1.
  Cross-validating manager and adjacent-lead handles against a people roster
  (whatever shape that roster takes) is deferred until there is a roster the
  standard knows about.
- **Per-track or per-discipline variation.** v1's slot is a single
  installation-level document; it does not branch on which discipline+track
  pair the engineer is generating. If a team needs different escalation
  paths per discipline, they ship multiple installations of the standard.
- **Auto-discovery of repositories or handles.** v1 does not introspect git
  remotes, GitHub orgs, or directory listings to populate the slot. The
  engineer writes the YAML.
- **Migration or import from other tools.** Engineers maintaining team
  context in another system (Backstage, a wiki, a custom config) hand-port
  to the new slot in v1.
- **Structured access from skills.** The slot's contents flow into the
  rendered `CLAUDE.md`. Whether downstream skills should read the
  structured data directly (for example, to mention repos by name in their
  own output) is a separate spec; v1 ends at the rendered output.
- **Removing or rewriting `teamInstructions`.** The existing track-scoped
  `teamInstructions` field stays as-is. The new slot is additive.
- **Field-level localization or multi-language.** All values are strings in
  whatever encoding the standard already uses for prose.

## Success Criteria

| Claim | Verification |
|---|---|
| The standard schema admits the organizational context slot. | Test: a populated slot loads through whatever loader the rest of the standard already uses, without errors; an absent slot loads without errors and the generator produces today's behavior. |
| The slot represents the six concerns named in scope. | Test: a fixture slot populated with repo names, a team handle, a manager handle, adjacent leads with role tags, project names, and escalation paths with trigger conditions and destinations validates clean via `bunx fit-map validate` and renders all six concerns into the section the CLI emits. |
| `bunx fit-map validate` reports line-attributable errors on malformed slots. | Test: a slot with a missing required field, an unknown field, and a type mismatch each produces a line-attributable error message via `bunx fit-map validate`; a clean slot and an absent slot each produce no errors. |
| The user-observable outcome of the Little Hire is delivered. | Test: an engineer running `bunx fit-pathway agent <discipline> --track=<track> --output=<dir>` against a standard whose slot they populated finds, via exact substring match in the rendered `.claude/CLAUDE.md` organizational context section, every repo name, the team handle, the manager handle, every adjacent-lead handle (with its role tag), every project name, every escalation trigger, and every escalation destination they wrote in the slot — without having edited the rendered file. |
| The emitted section is detectable by downstream tooling without parsing. | Test: the section opens with a documented marker (anchor, heading, or fenced block — chosen at design); a string-match on that marker against the rendered `.claude/CLAUDE.md` returns the section, and the marker is documented in the updated `agent-teams/organizational-context/index.md` guide. |
| Absent slot produces output identical to today. | Test: a fixture `.claude/CLAUDE.md` is captured from `main` immediately before the change for the starter's `software_engineering --track=platform` pair; running the same command after the change against the same starter (with the slot absent) produces a `.claude/CLAUDE.md` byte-identical to the fixture. |
| The web agent-builder preview renders the same section. | Test: the agent-builder preview page (`products/pathway/src/pages/agent-builder*.js`), with a standard whose slot is populated, renders an organizational context section whose textual content is byte-identical to the corresponding section in the CLI's rendered file (web chrome and styling excluded). |
| Re-running the generator preserves the "don't edit outputs" invariant. | Test: a user populates the slot, runs `bunx fit-pathway agent --output=<dir>`, then runs it again; the second run's `.claude/CLAUDE.md` is byte-identical to the first run's. The user makes no manual edits to the rendered file in either step. |
| The starter ships a populated example. | Test: running `bunx fit-pathway agent software_engineering --track=platform --output=<dir>` against the unmodified starter renders a `.claude/CLAUDE.md` whose organizational context section carries the example's placeholder repos, manager, adjacent leads (with role tags), projects, and escalation paths verbatim. |
| Documentation is in place. | Test: the existing `agent-teams/organizational-context/index.md` guide is updated to name the new slot, distinguish it from `teamInstructions`, and explain when each applies; the `authoring-standards` guide carries an entry for the slot; the `fit-pathway agent --help` text and the `fit-pathway` skill carry the guide URL per the repo's linking rule. |

— Product Manager 🌱
