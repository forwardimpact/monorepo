# Spec 900 — Pathway Organizational Context Slot for Agent Generation

## Problem

`fit-pathway agent` generates `.claude/CLAUDE.md` for an engineer's coding agent
by interpolating the chosen track's `teamInstructions` block. The resulting
file is generic to the discipline+track pair: it tells the agent how the
organization defines "platform engineering" or "forward-deployed engineering,"
but it does not name the repositories the engineer actually works in, the
manager who escalates to them, the adjacent leads they coordinate with, or the
projects in flight on their team.

A Senior Software Engineer at a pharma org exercised the generator during user
testing on issue [#881](https://github.com/forwardimpact/monorepo/issues/881)
and reported the gap verbatim:

> Nothing in the discipline/track YAML accepts repo names, team handles, or
> escalation paths. The generated CLAUDE.md is purely the track's
> `teamInstructions` text. I'd want a `repository`-level YAML that injects
> "Repos: molecularforge, data-lake-infra, api-gateway. Manager: Athena.
> Adjacent leads: Iris (DX), Prometheus (DS/AI)" into CLAUDE.md. Today I'd
> hand-append after generation, which contradicts the tool's "don't edit
> outputs" guidance.

The workaround the persona is forced to take — hand-editing the rendered
`CLAUDE.md` after generation — violates an invariant the tool itself
publishes: the rendered output is derived from the standard's inputs and must
not be edited by hand, because the next `fit-pathway agent` run will overwrite
it. The persona is one re-generation away from losing the team context they
appended.

This collision pushes the persona toward the **Competes With** alternatives
named in the JTBD entry — custom system prompts and copying another team's
configuration — because the part of the agent profile that needs to reflect
their organization is exactly the part Pathway does not carry. Configuration
overhead exceeds the quality gain Pathway provides, triggering the **Fired
When** force on the job. Until the gap closes, every organization with more
than one team or repo has the same reason to abandon Pathway for the
team-specific layer.

The blast radius is the **Equip Aligned Agent Teams** JTBD itself. Without an
organizational context slot, "agents that reflect organizational standards
without bespoke prompts" — the Pull force for the job — is undeliverable for
any team that wants their agent to know what repos exist or whom to escalate
to. The same gap is visible in Pathway's web agent-builder pages, since they
share the underlying data and generator.

## Personas and Job

The hire is **Empowered Engineers** against the Little Hire on the *Equip
Aligned Agent Teams* job: "Help me give agents organizational context without
bespoke prompts" ([JTBD.md § Empowered Engineers: Equip Aligned Agent
Teams](../../JTBD.md), lines 111–139). The same job's Big Hire — "configure
agents to meet the expectations the organization holds for humans" — is
already partially served by Pathway's discipline+track output; this spec
closes the residual gap that today forces the persona into the Competes With
alternatives.

The downstream beneficiary is the agent itself: an agent profile carrying
organizational context can route questions correctly, name the right repos in
code suggestions, and escalate to the right humans. That benefit is consumed
by the engineer who hired Pathway; their teammates and manager are not the
direct hire and are not asked to change anything they do.

## Scope

### In scope

| Component | What changes |
|---|---|
| Standard schema | The Pathway data standard gains a repository-scoped organizational context slot that carries the fields named in the In-scope rows below. The slot is loadable through the standard map data loader the rest of Pathway already uses, so the new data is a first-class part of the engineering standard rather than an ad-hoc side file. The exact file path, file name, and whether the slot is a single document or a set is a design choice. |
| Fields carried | The slot represents, at minimum: a list of repository names; a team handle; a manager handle; a list of adjacent lead handles where each carries a free-form role tag (e.g., "DX," "DS/AI"); a list of active project names; and a list of escalation paths, where each escalation path names a trigger condition in free-form prose and an addressable destination (a handle or a URL). Field names and exact value shapes are a design choice; the spec asserts only that each of these six concerns is representable. |
| Validation | `bunx fit-map validate` accepts the new slot and reports clear, line-attributable errors for malformed entries (missing required field, unknown field, type mismatch, malformed handle). The validator does not fail when the slot is absent — the slot is optional. |
| Cross-reference policy | Handles in the slot (manager, adjacent leads, escalation destinations) are free-form strings in v1. The spec does not require cross-validation against a people roster; whether to add roster-backed validation later is out of scope. |
| `fit-pathway agent` CLI integration | When the organizational context slot is present, the generator emits its contents into the rendered `.claude/CLAUDE.md` in a stable, machine-recognizable section that is clearly distinguishable from the discipline+track `teamInstructions` text. The section is emitted by default — no new flag is required to opt in. When the slot is absent, the rendered output is byte-identical to today's output for the same discipline+track inputs. The section's anchor name, ordering relative to `teamInstructions`, and visual formatting are a design choice. |
| Web agent-builder integration | The web agent-builder pages render the same organizational context section when the slot is present, using the same data path as the CLI so the two surfaces stay in sync. The web preview shows the section in the same form a user would see in their downloaded `.claude/CLAUDE.md`. |
| "Don't edit outputs" invariant preserved | Re-running `fit-pathway agent` against the same standard inputs produces a `.claude/CLAUDE.md` that carries the organizational context — the user never edits the rendered file to inject team-specific text. The slot is the only place a user touches to update repos, manager, leads, projects, or escalation paths. |
| Starter content | The monorepo's starter standard (`products/map/starter/`) ships an example of the slot wired into the starter's existing discipline+track pair, so an external user running `bunx fit-pathway agent` against the starter can see the section in their rendered `CLAUDE.md` without any additional setup. The example content uses placeholder values (not real handles) and is short enough to read at a glance. |
| Documentation | The Pathway agent-teams guide (`websites/fit/docs/products/agent-teams/index.md`) explains the slot's purpose, the fields it carries, how to populate it, and the "don't edit outputs" rationale for why team-specific context belongs in the slot rather than in the rendered file. The `fit-pathway agent --help` text and the `fit-pathway` skill list the new guide entry per [products/CLAUDE.md § Linking rule](../../products/CLAUDE.md). The authoring-standards guide adds an entry for the slot alongside disciplines, tracks, levels, capabilities, behaviours, and drivers. |

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
  organization-level document; it does not branch on which discipline+track
  pair the engineer is generating. If a team needs different escalation
  paths per discipline, they ship multiple installations of the standard.
- **Auto-discovery of repositories or handles.** v1 does not introspect git
  remotes, GitHub orgs, or directory listings to populate the slot. The
  engineer writes the YAML.
- **Migration or import from other tools.** Engineers maintaining team
  context in another system (Backstage, a wiki, a custom config) hand-port
  to the new slot in v1.
- **Skills referencing the slot directly.** The slot's contents flow into
  the rendered `CLAUDE.md`. Whether downstream skills should read the
  structured data directly (for example, to mention repos by name in their
  own output) is a separate spec; v1 ends at the rendered output.
- **Field-level localization or multi-language.** All values are strings in
  whatever encoding the standard already uses for prose.

## Success Criteria

| Claim | Verification |
|---|---|
| The standard schema admits the organizational context slot. | Test: a populated slot loads through the standard map data loader without errors; an absent slot loads without errors and produces today's behavior. |
| All six concerns are representable in the slot. | Test: a fixture slot populated with repository names, a team handle, a manager handle, adjacent lead handles with role tags, project names, and escalation paths with triggers and destinations validates clean. |
| `bunx fit-map validate` reports clear errors on malformed slots. | Test: a slot with a missing required field, an unknown field, a type mismatch, and a malformed handle produces line-attributable error messages; a clean slot produces no errors; an absent slot produces no errors. |
| `fit-pathway agent` emits an organizational context section when the slot is present. | Test: running `bunx fit-pathway agent <discipline> --track=<track> --output=<dir>` against a standard with a populated slot writes a `.claude/CLAUDE.md` whose body contains a stable, machine-recognizable section carrying the slot's contents, distinguishable from the `teamInstructions` body. |
| Absent slot produces byte-identical output to today. | Test: running the same command against a standard without the slot produces a `.claude/CLAUDE.md` byte-identical to the file produced before this spec lands, for the same discipline+track inputs. |
| The web agent-builder renders the same section. | Test: loading the agent-builder preview page for a standard with a populated slot renders the organizational context section in the same form the CLI writes to `.claude/CLAUDE.md`. |
| Re-running the generator preserves the "don't edit outputs" invariant. | Test: a user populates the slot, runs `fit-pathway agent --output=<dir>`, then runs it again; the second run's `.claude/CLAUDE.md` matches the first run's byte-for-byte. The user makes no manual edits to the rendered file in either step. |
| The starter ships a populated example. | Test: running `bunx fit-pathway agent` against the unmodified starter renders a `.claude/CLAUDE.md` carrying the example slot's organizational context section. |
| Documentation is in place. | Test: the Pathway agent-teams guide carries a section describing the slot and its rationale; the `fit-pathway agent --help` text and the `fit-pathway` skill list the guide URL per the repo's linking rule; the authoring-standards guide carries the new entry. |

— Product Manager 🌱
