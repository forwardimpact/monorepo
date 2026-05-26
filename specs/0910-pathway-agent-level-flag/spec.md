# Spec 0910 — Pathway `agent` Command Needs a `--level` Flag

## Problem

`npx fit-pathway agent <discipline> --track=<track>` is the tool an empowered
engineer runs to generate agent profiles calibrated to their organization's
standard. Today the command exposes no calibration for the engineering level
expected of the agent — and the engineer cannot generate different profiles for
agents that should meet different expectations.

In a `kata-interview` user-testing session (issue
[#880](https://github.com/forwardimpact/monorepo/issues/880)) the J070 persona
needed to produce two agent profiles: one for themselves (J070, platform) and
one for their J060 teammate Selene (also platform). The two persona-distinct
configurations produced **byte-identical output**. The persona named the gap
directly:

> The one thing that doesn't survive contact with my actual job-to-be-done.

The persona's job in that session was to encode J060 and J070 expectations
into two different agent profiles. The CLI offered no surface to do so. The
mechanical cause is that the `agent` command derives a single reference level
internally and threads it through every downstream derivation; the standard
itself records different expectations per level
(`products/map/starter/levels.yaml` carries distinct `baseSkillProficiencies`,
`baseBehaviourMaturity`, and `expectations` for J060 vs. J070), so the
information exists — it is the CLI surface that elides it.

The blast radius is the persona's job-to-be-done. Empowered Engineers hire
Pathway to *give agents organizational context* the way they give it to
humans. The organization holds J060 and J070 to different expectations.
Pathway today says the agents should not reflect that difference —
contradicting both the standard and the user's job. The persona's
workaround (hand-editing the generated `CLAUDE.md`) is what the
[organizational-context guide](https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md)
explicitly tells users *not* to do.

## Personas and Job

The hire is **Empowered Engineers**, against the Big Hire "Help me configure
agents to meet the expectations the organization holds for humans"
([JTBD.md](../../JTBD.md) § Empowered Engineers: Equip Aligned Agent Teams).
The job is fired when configuration overhead exceeds the quality gain — exactly
the failure mode the persona described, where the only way to encode different
expectations was to hand-edit generated files outside the tool.

Agents configured by other means (custom system prompts, hand-edits, copies of
another team's config) are out of scope — those are the alternatives this job
competes with, not consumers of the work.

## Scope

### In scope

| Component | What changes |
|---|---|
| `agent` CLI calibration surface | The `agent` subcommand accepts a `--level=<id>` option for level calibration, symmetric in shape with the existing `--track` option on the same command. |
| Validation UX | An unknown `--level` value is rejected with the same error shape `--track` produces today: a single error line, a bulleted "Available levels:" list of valid IDs, exit code 1. |
| Default behaviour | When `--level` is absent, the command preserves today's behaviour. The same `(discipline, track)` invocation without `--level` produces output identical to today's, byte-for-byte against a pinned standard fixture. |
| Level-aware generation | The resolved level (whether CLI-supplied or default-resolved) governs the generated profile end-to-end: skill-proficiency floors reflect the level's `baseSkillProficiencies`; behaviour maturity reflects the level's `baseBehaviourMaturity`; the rendered `CLAUDE.md` / team-instructions reflect the level's `expectations`. |
| `--help` reflection | `npx fit-pathway agent --help` lists `--level=<id>` with a one-line description consistent with the existing `--track` entry. |
| `agent --list` interaction | `npx fit-pathway agent --list` continues to enumerate valid `discipline × track` combinations without prompting for a level. |
| Published-guide cascade | The two published guides — [agent-teams](https://www.forwardimpact.team/docs/products/agent-teams/index.md) and [organizational-context](https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md) — document the new flag in the sections that describe profile generation. Each guide answers the reader question "when do I set `--level` explicitly?" once. |

### Out of scope, deferred

- **Per-skill or per-capability level overrides.** This spec exposes one
  level per invocation. A persona that wants "J070 for one capability but
  J060 for another *within the same agent*" is a separate scope.
- **Calibration knobs beyond `level`.** Driver weighting, capability
  filtering, behaviour-maturity overrides, and similar refinements are
  separate specs. This spec adds the *missing* knob the persona named, not
  a speculative set of future ones.
- **Refactoring the default-resolution heuristic.** The current heuristic
  ("first level whose core skills reach `practitioner`") continues to serve
  as the default when `--level` is absent. Its design is not under review
  here.
- **Standard-schema changes.** No additions to `levels.yaml` or any other
  starter-standard file. The persona's alternative workaround "extend the
  standard schema" (issue #880) is not what this spec adopts.
- **Downstream consumers that also default-resolve a level.** The
  `build-packs` subcommand of `fit-pathway` generates agent profiles in
  bulk, and the agent-builder web page renders profiles in the browser;
  both default-resolve a level today by the same path the `agent` command
  does. Whether either should accept a level surface (a `--level` flag
  for `build-packs`, a level segment in the web route for agent-builder)
  is a separate spec each. Both are unchanged by this spec.
- **Web UI / route changes.** The agent-builder web route already encodes
  `:discipline` and `:track`. Whether the route should also encode `:level`
  is a separate spec about the web UI's calibration surface, not the CLI's.
- **Sibling-command coherence.** The sibling artefact-generating commands
  `job`, `interview`, and `progress` take `<level>` as a positional today.
  This spec adds the missing knob on `agent` without retrofitting the
  sibling commands or migrating them to a consistent surface — see the
  coherence note below.

### Coherence note

The four artefact-generating commands today expose level differently:

| Command | Today's level surface |
|---|---|
| `job` | Positional `<level>` (optional) |
| `interview` | Positional `<level>` (required) |
| `progress` | Positional `<level>` (required) |
| `agent` | None — internally derived |

This spec resolves `agent`'s missing surface via the option form `--level=<id>`
(symmetric with the command's existing `--track` option, which is also a
calibration filter). The positional form was considered and rejected (see
Alternatives) because the required-positional shape would break today's
optional invocation `npx fit-pathway agent <discipline> --track=<track>`,
and the optional-positional shape introduces a positional whose presence
flips meaning. Whether the sibling commands should also gain an option-form
`--level` to fully unify the surface is deferred to a separate spec — this
spec asserts only the missing knob on `agent`.

## Success Criteria

| # | Criterion | Verification |
|---|---|---|
| SC1 | Supplying a level changes what the agent profile encodes. For two invocations differing only in `--level`, at least one of the following differs: the set of skills emitted, a skill's derived proficiency, the set of behaviours emitted, a behaviour's derived maturity, or the `expectations` block of the rendered `CLAUDE.md`. | Run the command twice against the same fixture standard with two different `--level` values; assert that at least one of the listed fields differs in the captured output. |
| SC2 | Absent `--level`, output is identical to today's behaviour for the same `(discipline, track)` against the same standard. | The implementation captures a baseline: today's output for a pinned `(discipline, track)` against a specific version of the `products/map/starter` standard (the version on `main` at the point the baseline is captured). After the change, running the new command without `--level` against the same standard version produces output byte-identical to the captured baseline. The baseline file is committed alongside the test so the comparison is reproducible. |
| SC3 | The CLI rejects an unknown level value. | Run the command with a `--level` value not present in the fixture standard's levels. Stderr contains an error line; stderr contains a bulleted list with one bullet per level id present in the fixture; exit code is 1. |
| SC4 | `--help` for the `agent` command lists `--level`. | `npx fit-pathway agent --help` stdout contains the string `--level` and a non-empty description on the same line. |
| SC5 | The two published guides document the new flag in the profile-generation sections. | The updated guides contain at least one invocation that includes `--level`, paired with prose that answers "when do I set this explicitly?". The documented `--level` invocation, when run against the fixture standard, produces output that differs from the same command without `--level` on at least one SC1 field (so the documentation demonstrably exercises the surface rather than echoing it). |
| SC6 | The `agent` command's `--help` output presents the level surface in the same syntactic slot as `--track`. | `npx fit-pathway agent --help` stdout is parsed; both `--track` and `--level` appear under the same options heading, with the same `--name=<type>` shape and a one-line description each. |

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Leave `agent` as-is; tell users to hand-edit the generated `CLAUDE.md` to encode level differences. | This is the persona's current workaround, which the [organizational-context guide](https://www.forwardimpact.team/docs/products/agent-teams/organizational-context/index.md) explicitly tells users not to do. The job is fired exactly when the configuration overhead exceeds the quality gain. |
| Extend the standard schema so multiple "agent levels" map to one human level. | Adds standard-schema surface to solve a CLI-surface problem. The data model already records distinct levels; the missing piece is the ability to pick one at invocation time. |
| Generate one profile per level by default (output multiplied by `levels.length`). | Multiplies output size and breaks backward compatibility for every existing `--output` consumer. The persona wants to pick one level per invocation, not produce N. |
| Add `--level` as a global option on `fit-pathway` (above the subcommand). | Pollutes commands that have no level concept (`skill`, `track`, `tool`, `behaviour`, `driver`) and collides with `questions --level` (an existing filter). The flag belongs on the command that consumes it. |
| Adopt the positional form to match sibling `job` / `interview` / `progress`. | Required-positional breaks today's `agent <discipline> --track=<track>` invocation; optional-positional introduces a positional whose presence flips command meaning. Unifying the sibling surface (e.g., migrating all four to `--level`) is a separate spec; this one closes the immediate gap. |
| Hold the spec until a broader "calibration knobs" design lands. | The persona's job is fired today by the missing level knob specifically. Other knobs (driver weighting, capability filtering) are speculative; level is concrete and present in the standard. Pairing the two delays closure of a verified gap. |
