# 660 — Skill Multiple References

The Map schema currently lets a skill attach a single reference document via
`skill.implementationReference` (a string), which renders into
`.claude/skills/{skill}/references/REFERENCE.md`. Complex skills routinely need
more than one reference file to support progressive disclosure, but the single
fixed slot forces authors to either combine unrelated topics into one file, push
content into `SKILL.md`, or drop it. Replace the single string with an array of
named reference objects so one skill can produce any number of reference files.

## Why

### The single-file shape caps progressive disclosure

A published skill is read lazily: agents load `SKILL.md`, then fetch reference
files only when a task needs detail. The pattern only works when references can
be named and scoped so the agent knows which one to open. Today the Map schema
supports exactly one reference per skill, wired to a fixed filename:

```yaml
skills:
  - id: incident_response
    name: Incident Response
    agent: { ... }
    implementationReference: |
      # Markdown body rendered verbatim into references/REFERENCE.md
```

Shipped skills under `.claude/skills/` already demonstrate the ceiling.
`fit-pathway/references/` contains `cli.md` and `workflows.md`;
`kata-spec/references/metrics.md` sits alongside other hand-authored files
across `kata-*` skills. Those files exist because contributors bypassed the
generator and wrote them by hand. That divergence is the symptom: the Map →
Pathway generator cannot express what published skills actually need.

### One slot forces authors into bad trade-offs

When a skill only gets one reference slot, authors choose between:

1. Stuffing multiple topics into one `REFERENCE.md` — defeats progressive
   disclosure; agents pay tokens for context they do not need.
2. Moving the material into `SKILL.md` — bloats the always-loaded core.
3. Dropping the material entirely — ships a less useful skill.

None of these preserve the "load what you need" property that makes reference
files valuable in the first place.

### The current pipeline is one-to-one by construction

Every layer assumes exactly one reference per skill, so lifting the cap is a
schema change that cascades through each:

| Layer             | Location                                                 | Current behaviour                                               |
| ----------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| Schema            | `products/map/src/validation/skill.js`                   | Validates `implementationReference` as an optional string       |
| Loader            | `products/map/src/loader.js`                             | Destructures the single field into the skill record             |
| Render            | `libraries/libskill/src/agent.js`                        | Carries one `implementationReference` field into the model      |
| Agent formatter   | `products/pathway/src/formatters/agent/skill.js`         | `formatReference(skill, template)` returns one string           |
| Skill view-model  | `products/pathway/src/formatters/skill/shared.js`        | `implementationReference` property on the view-model type       |
| Skill markdown    | `products/pathway/src/formatters/skill/markdown.js`      | Emits the single field into the markdown output                 |
| Skill DOM         | `products/pathway/src/formatters/skill/dom.js`           | Emits the single field into the HTML preview                    |
| Template          | `products/pathway/templates/skill-reference.template.md` | `# {title} — Reference` followed by `{implementationReference}` |
| Writer            | `products/pathway/src/commands/agent-io.js`              | Writes hard-coded `references/REFERENCE.md`                     |
| Build             | `products/pathway/src/commands/build-packs.js`           | Same hard-coded path in the pack build loop                     |
| Web view          | `products/pathway/src/pages/agent-builder-preview.js`    | Reads the single field into preview output                      |
| Web view          | `products/pathway/src/pages/agent-builder-download.js`   | Reads the single field into downloaded zip                      |
| YAML load         | `products/pathway/src/lib/yaml-loader.js`                | Mirrors Map's single-field shape                                |
| Deprecated hint   | `products/map/src/validation/skill.js`                   | Maps legacy `reference` → `implementationReference`             |
| Authoring guide   | `website/docs/guides/authoring-frameworks/index.md`      | Teaches `implementationReference` and shows YAML example        |
| Generator mapping | `website/docs/guides/agent-teams/index.md`               | Table row mapping `implementationReference` to `REFERENCE.md`   |

### The `<scaffolding_steps>` rule is obsolete

The current validator rejects `<scaffolding_steps>` tags in
`implementationReference` because an earlier migration asked authors to move
install commands into `installScript`. That migration is complete; no shipped
skill still contains the tag. The rule carries no ongoing value and is removed
rather than re-homed onto the new field.

## What

### 1. Replace `implementationReference` with `references`

The Map skill schema drops `skill.implementationReference` (string) and adds
`skill.references` (optional array). Each entry is an object with three required
fields:

| Field   | Type   | Purpose                                                                                                |
| ------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `name`  | string | Filename stem — becomes `references/{name}.md` on disk                                                 |
| `title` | string | Document title — rendered as `# {title}` at the top of file                                            |
| `body`  | string | Reference content (markdown body, rendered verbatim below the title with no trimming or normalization) |

Example YAML:

```yaml
skills:
  - id: incident_response
    name: Incident Response
    agent: { ... }
    references:
      - name: runbooks
        title: Incident Runbooks
        body: |
          Step-by-step procedures for the top five incident classes...
      - name: postmortem-template
        title: Postmortem Template
        body: |
          Fields expected in every postmortem...
```

A skill with no `references` (field absent, `null`, or empty array) emits no
`references/` directory. A skill with N entries emits N files in `references/`.
The filename `REFERENCE.md` is no longer produced by the generator.

The `references/` directory is owned by the generator. When regenerating a
skill, any pre-existing `references/*.md` files — including hand-authored ones —
are overwritten or removed so the directory contents exactly match the current
YAML. Skill authors who need ongoing hand-authored content must express it as a
`references:` entry.

### 2. Validation rules

| Rule                                                        | Applies to         | Failure mode                                                                                                                                                                                               |
| ----------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `references` is optional                                    | `skill`            | Absent, `null`, or empty array are all valid and produce no files                                                                                                                                          |
| If present, must be an array                                | `skill.references` | `INVALID_VALUE` at `{path}.references`                                                                                                                                                                     |
| `name` present and a string                                 | each entry         | `MISSING_REQUIRED` / `INVALID_VALUE` at `{path}.references[i].name`                                                                                                                                        |
| `name` matches `^[a-z0-9][a-z0-9_-]*$` with length 1–64     | each entry         | `INVALID_VALUE` at `{path}.references[i].name` — covers `/`, `..`, `.`, null byte, uppercase, spaces, unicode, emoji, and length overflow in a single rule                                                 |
| `name` unique within the skill, compared case-insensitively | `skill.references` | `INVALID_VALUE` at `{path}.references[i].name` on duplicate or case-only collision (e.g. `foo` and `Foo`) — prevents filesystem collisions on case-insensitive filesystems                                 |
| `title` present and a non-empty string                      | each entry         | `MISSING_REQUIRED` / `INVALID_VALUE` at `{path}.references[i].title`                                                                                                                                       |
| `body` present and a non-empty string                       | each entry         | `MISSING_REQUIRED` / `INVALID_VALUE` at `{path}.references[i].body` (whitespace-only is treated as empty)                                                                                                  |
| `implementationReference` is rejected                       | `skill`            | `INVALID_FIELD` at `{path}.implementationReference` with a message pointing to `references`. This rule is required — the friendly error message must fire for any skill that still uses the removed field. |

Two adjacent changes to the existing deprecated-field machinery in
`products/map/src/validation/skill.js`, independent of the rule above:

- The `<scaffolding_steps>` check on `implementationReference` is deleted, not
  re-homed onto `body`.
- The existing deprecated-field entry for legacy `reference` currently reads
  "Use `skill.implementationReference` instead." Its hint text is updated to
  point at `skill.references`. The entry itself stays — removing it would drop
  the helpful error for any framework still using the older legacy name.

### 3. Output shape

For each entry in `skill.references`, the generator writes
`<skillDir>/references/{name}.md` with contents:

```
# {title}

{body}
```

`body` is written verbatim after the `# {title}` line and one blank line — no
trimming, no collapsing of trailing newlines. Authors control the exact tail of
each file.

No index file is synthesized. Reference discovery is author-driven: agents find
references by following pointers the author writes in `SKILL.md` (via
`skill.instructions` or `agent.focus`). Automatic index generation is out of
scope (see § Excluded).

## Scope

### Affected entities

- `skill.implementationReference` — deleted from the Map schema
- `skill.references` — new array field on every skill entity
- Validation rules in `products/map/src/validation/skill.js`, including the
  deprecated-field hint that currently maps legacy `reference` →
  `implementationReference`
- Loader in `products/map/src/loader.js`
- Render model in `libraries/libskill/src/agent.js`
- Pathway agent formatter `products/pathway/src/formatters/agent/skill.js`
- Pathway skill view-model and non-agent formatters:
  `products/pathway/src/formatters/skill/shared.js` (owns the view-model
  property), `products/pathway/src/formatters/skill/markdown.js`, and
  `products/pathway/src/formatters/skill/dom.js`
- Pathway template `products/pathway/templates/skill-reference.template.md`
- File-writing loops in `products/pathway/src/commands/agent-io.js` and
  `products/pathway/src/commands/build-packs.js`
- Web preview/download in `products/pathway/src/pages/agent-builder-preview.js`
  and `products/pathway/src/pages/agent-builder-download.js`
- Pathway YAML loader `products/pathway/src/lib/yaml-loader.js`
- Authoring documentation: `website/docs/guides/authoring-frameworks/index.md`
  (teaches the field and shows a YAML example) and
  `website/docs/guides/agent-teams/index.md` (the generator-mapping table that
  names `implementationReference` and `REFERENCE.md`)
- Starter framework YAML under `products/map/starter/` — at least one starter
  skill gains a `references:` array so the feature is exercised in-tree
- Generated `<skillDir>/references/*.md` outputs

### Excluded

- `skill.toolReferences` — unrelated field; not renamed or restructured
- `skill.instructions`, `skill.installScript`, and `skill.agent.*` — untouched
- `SKILL.md` template and front matter shape — unchanged. The generator does not
  auto-inject a "References" section into `SKILL.md`; authors point agents at
  references through the existing `skill.instructions` and `agent.focus` content
  they already write
- Per-reference metadata beyond `{ name, title, body }` (e.g. `useWhen`, tags) —
  can be added later if demand is demonstrated
- Auto-generated discovery index (e.g. `references/INDEX.md`) — authors may add
  one as a regular entry; the generator does not synthesize one
- Runtime reference discovery/loading by agents — this spec concerns authoring
  and generation, not consumption
- Preserving hand-authored files under a generated skill's `references/`
  directory — the generator owns the directory and overwrites it
- Backward-compatibility shim for `implementationReference` — deliberately not
  provided; this is a clean break

## Success criteria

1. A Map YAML file with a `references:` array of N entries validates, and
   `bunx fit-pathway` generation produces a `<skillDir>/references/` directory
   whose contents are exactly `{names}.md` for each entry's `name` in YAML
   order, with no extra files. Each file begins with `# {title}` followed by a
   blank line and the entry's `body` written verbatim.

2. A Map YAML file containing `implementationReference` fails
   `bunx fit-map validate` with an `INVALID_FIELD` error at
   `…implementationReference` whose message names `references`. No
   `REFERENCE.md` is generated for such inputs.

3. Each of the following fails validation with the specified error code and
   path:
   - invalid `name` (`/`, `..`, `.`, empty string, null byte, uppercase,
     whitespace, unicode, emoji, or length > 64) → `INVALID_VALUE` at
     `…references[i].name`;
   - duplicate `name` values within one skill, including case-only collisions
     (`foo` vs `Foo`) → `INVALID_VALUE` at `…references[i].name`;
   - missing or non-string `title` → `MISSING_REQUIRED` / `INVALID_VALUE` at
     `…references[i].title`;
   - missing, non-string, or whitespace-only `body` → `MISSING_REQUIRED` /
     `INVALID_VALUE` at `…references[i].body`.

4. A skill with no `references` field, a `null` value, or an empty array
   produces no `<skillDir>/references/` directory.

5. At least one starter skill under `products/map/starter/` declares a
   `references:` array with two or more entries, and `bunx fit-map validate` on
   `products/map/starter/` passes. Running the generator over the starter data
   produces the corresponding multi-file `references/` directory in the
   generated skill, demonstrating the feature end-to-end.

6. Regenerating an existing skill whose `<skillDir>/references/` directory
   contains stale or hand-authored files produces a `references/` directory
   whose contents match the YAML exactly (stale files are removed or
   overwritten).

7. The identifier `implementationReference` and the string `<scaffolding_steps>`
   do not appear under `products/map/src/`, `products/pathway/src/`,
   `products/pathway/templates/`, `libraries/libskill/src/`, or
   `website/docs/guides/` after the change, except for:
   - the single validation rule in `products/map/src/validation/skill.js` that
     rejects the removed field (criterion 2), and
   - test fixtures that include `implementationReference` as rejected input for
     criterion 2.
