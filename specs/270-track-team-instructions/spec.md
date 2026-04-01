# Track-level `teamInstructions` for Agent Teams

## Problem

Agent teams exported by `fit-pathway agent` consist of per-stage agent profiles
(`.claude/agents/*.md`), per-skill files (`.claude/skills/*/SKILL.md`), and a
settings file (`.claude/settings.json`). There is no shared document that every
agent in the team reads.

Cross-cutting facts — deployment platform, environment variables, project
conventions, task-runner choice — end up duplicated across multiple skill files.
When skills cover overlapping topics, there is no authoritative place to resolve
conflicts or state shared facts once. The consequences observed in downstream
installations:

- **Duplication.** Platform facts repeated in 3–4 skills drift out of sync.
- **Contradiction.** Different skills give conflicting guidance on the same
  topic (e.g. one says "never run migrations at startup," another says "add a
  startup migration").
- **Ambiguity.** When multiple skills cover overlapping tools or services,
  agents have no way to know which skill's guidance takes precedence.

A shared team-level instructions file is the natural resolution — it is the one
document every agent in the team reads before any skill.

## Proposed Change

Add a single optional string property — `teamInstructions` — to the
`trackAgentSection` in the track schema. When an agent team is exported, the
pathway formatter renders this string into a team-level instructions file
(`.claude/CLAUDE.md`) that sits alongside the per-stage agent profiles and
per-skill files.

The property is a plain markdown string written using YAML block scalar syntax.
Authors write whatever sections their team needs — environment, conventions,
skill coordination — without being forced into a fixed structure.

### What changes

| Area | Change |
|------|--------|
| Track JSON schema (`products/map/schema/json/track.schema.json`) | Add `teamInstructions` string property to `trackAgentSection` |
| Track RDF/SHACL schema (`products/map/schema/rdf/track.ttl`) | Add `fit:teamInstructions` property and SHACL constraint to `TrackAgentSectionShape` |
| Agent derivation (`libraries/libskill/agent.js`) | Pass `teamInstructions` through derivation, apply `substituteTemplateVars` |
| Agent CLI export (`products/pathway/src/commands/agent.js`) | Write `.claude/CLAUDE.md` when `teamInstructions` is present |
| Agent DOM formatter (`products/pathway/src/formatters/agent/dom.js`) | Include `CLAUDE.md` in ZIP download |

### What does not change

- Existing track YAML files — `teamInstructions` is optional, absent means no
  file generated. Fully backward compatible.
- Agent profile template and rendering — profiles remain unchanged.
- Skill file format — skills remain unchanged.
- Validation logic — no new validation rules; it is a plain string.

## Scope

### In scope

- Schema addition (JSON Schema + RDF/SHACL) for `teamInstructions`
- Derivation pass-through and variable interpolation (`{roleTitle}`,
  `{specialization}`)
- CLI file output (`.claude/CLAUDE.md`) when `--output` is used
- ZIP download inclusion from the web app
- Console output when no `--output` is specified
- Tests for schema validation, derivation, CLI output, and ZIP inclusion

### Out of scope

- Authoring `teamInstructions` content in the monorepo's own track files —
  that is a downstream concern, not a framework change.
- Support for alternative output filenames (e.g. `copilot-instructions.md`) —
  future formatter concern, not needed for the initial implementation.
- Structured/queryable format for the field — it is intentionally a plain
  string. Agents parse markdown natively.

## Design Decisions

### Why `teamInstructions` and not `claudeMd`

The data model should not name a vendor's file convention. The field describes
intent — shared instructions for the team. The formatter decides the output
filename, just as it already decides `.claude/agents/` vs other paths.

### Why a plain string and not a structured object

A structured object with arrays of `{heading, content}` or `{topic,
canonicalSkill}` was considered and rejected:

1. **Overhead** — forces all adopters to learn a sub-model for what is
   fundamentally a markdown document.
2. **Rigidity** — different organizations need different sections.
3. **Validation** — referential integrity checks for `canonicalSkill` add
   complexity with little benefit. The document is read by agents, not by
   framework code.

### Interpolation reuse

The same `substituteTemplateVars` function already used for `identity` and
`priority` applies to `teamInstructions`. No new interpolation mechanism needed.

## Success Criteria

1. `bunx fit-map validate` passes with tracks that include `teamInstructions`
   and with tracks that omit it.
2. `bunx fit-pathway agent <discipline> --track=<track> --output=<dir>` writes
   `.claude/CLAUDE.md` containing the interpolated `teamInstructions` content
   when the field is present, and writes no file when it is absent.
3. The web app ZIP download includes `CLAUDE.md` when `teamInstructions` is
   present.
4. `{roleTitle}` and `{specialization}` placeholders in `teamInstructions` are
   replaced with the discipline's values.
5. Console output (no `--output`) prints the `teamInstructions` content with a
   clear heading separator.
