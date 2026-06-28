# Plan 0660: Skill Multiple References

See [spec.md](spec.md) and [design-a.md](design-a.md). All step references to
"§" point at the design.

## Approach

Replace the single `skill.implementationReference` string with an
`skill.references: Array<{name, title, body}>` field by walking the data flow in
dependency order: schemas → validator → loaders → render model → formatters →
templates → writer helper → callers (CLI, build, web preview, zip) → starter
YAML → docs. Each step is mechanical once the upstream shape lands. The JSON
Schema and SHACL files in `products/map/schema/` were not listed in the
spec/design but are required — Ajv runs first with
`additionalProperties: false`, so without schema updates a YAML containing
`references:` is rejected before custom validation can produce the friendly
error. They are added under "Scope addition" below.

## Scope addition (beyond design)

**Files:** `products/map/schema/json/capability.schema.json`,
`products/map/schema/rdf/capability.ttl`.

**Why included:** `fit-map validate` runs Ajv against the JSON schema before
`validateSkill`. With `additionalProperties: false`, an unrecognized
`references` field is rejected by Ajv with a generic `SCHEMA_VALIDATION` error —
the design's friendly `INVALID_FIELD` error (§ 1, criterion 2) never fires. The
SHACL `.ttl` mirrors the JSON schema for `--shacl` validation parity. Both are
hand-maintained; no generator.

**What changes:** add the `references` array property; **keep**
`implementationReference` listed but **drop its `type: string` constraint** (use
`{}` or omit `type`) so Ajv accepts any value and lets
`validateSkillDeprecatedFields` produce the friendly message regardless of input
type. The custom validator is the single source of truth for rejection. Without
the type relaxation, a non-string `implementationReference` value would trip
Ajv's type check first, masking the friendly message.

## Steps

### 1. JSON schema — add `references`, keep `implementationReference`

**File:** `products/map/schema/json/capability.schema.json` (modified).

Under the skill `properties` block add a `references` array sibling of
`implementationReference`:

```json
"references": {
  "type": "array",
  "description": "Reference documents emitted to references/{name}.md",
  "items": {
    "type": "object",
    "required": ["name", "title", "body"],
    "additionalProperties": false,
    "properties": {
      "name":  { "type": "string", "pattern": "^[a-z0-9][a-z0-9_-]*$",
                  "minLength": 1, "maxLength": 64 },
      "title": { "type": "string", "minLength": 1 },
      "body":  { "type": "string", "minLength": 1 }
    }
  }
}
```

Replace the existing `implementationReference` property body with `{}` (empty
schema, accepts any value) so Ajv passes anything through to the custom
validator. The property must remain declared because
`additionalProperties: false` would otherwise reject it before
`validateSkillDeprecatedFields` (step 3) runs.

**Verify:** `bunx fit-map validate products/map/starter` still passes against
the unmodified starter (regression baseline before later steps mutate it).

### 2. RDF/SHACL schema — add `references` shape

**File:** `products/map/schema/rdf/capability.ttl` (modified).

Add a `fit:references` property + `fit:Reference` class with three datatype
properties (`name`, `title`, `body`), modelled after `fit:ToolReference` /
`fit:ToolReferenceShape`. Add a `sh:property` block on `fit:SkillShape` pointing
at `fit:references` with `sh:node fit:ReferenceShape`. Leave
`fit:implementationReference` and its existing shape entry in place.

**Verify:** `bunx fit-map validate --shacl products/map/starter` still passes.

### 3. Validation — `validateSkillReferences` + `validateSkillDeprecatedFields`

**File:** `products/map/src/validation/skill.js` (modified).

| Change                                           | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add `validateSkillReferences(skill, path)`       | Implements the nine rules in spec § Validation rules. For each entry: (a) `typeof name !== "string"` → `INVALID_VALUE`; (b) name length / regex check → `INVALID_VALUE`; (c) duplicate name (case-insensitive `toLowerCase()`) → `INVALID_VALUE`; (d) `typeof title !== "string"` → `INVALID_VALUE`, missing → `MISSING_REQUIRED`, empty → `INVALID_VALUE`; (e) `typeof body !== "string"` → `INVALID_VALUE`, missing → `MISSING_REQUIRED`, then `/^\s*$/.test(body)` whitespace-only → `INVALID_VALUE`. Type checks always run first to avoid false-pass on regex coercion of non-strings. |
| Add `validateSkillDeprecatedFields(skill, path)` | Emits `INVALID_FIELD` at exactly `${path}.implementationReference` with the literal hint string `"Skill 'implementationReference' field is no longer supported. Use skill.references instead."`. Runs unconditionally; shape mirrors `validateSkillAgentDeprecatedFields`.                                                                                                                                                                                                                                                                                                                  |
| Wire both                                        | Call from `validateSkill` after `validateSkillOptionalStringFields`. Both append to `errors` (no short-circuit) per § 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Update legacy hint                               | In `validateSkillAgentDeprecatedFields` change `["reference", "Use skill.implementationReference instead."]` to `["reference", "Use skill.references instead."]`. The deprecation entry stays — only the hint string changes.                                                                                                                                                                                                                                                                                                                                                               |
| Drop scaffolding check                           | Remove the `<scaffolding_steps>` block (lines 205–216) from `validateSkillOptionalStringFields`. Also remove `"implementationReference"` from `stringFields` — the type check is no longer needed because the deprecation rule rejects the field outright before any type validation runs (consistent with the JSON schema relaxation in step 1).                                                                                                                                                                                                                                           |

**Verify:** `bun test products/map/test/` passes after corresponding test
fixtures are added (step 17).

### 4. Loader (Map) — swap field

**File:** `products/map/src/loader.js` (modified).

In `#loadSkillsFromCapabilities`, replace `implementationReference` in the
destructure list (line 110) and the spread (line 124) with `references`. Empty
arrays and `undefined` both omit the field (existing `&&` pattern handles this).

**Verify:** `bun test products/map/test/data-loader.test.js`.

### 5. Render model — `libskill/agent.js`

**File:** `libraries/libskill/src/agent.js` (modified).

In `generateSkillMarkdown` (line 143–166): drop
`implementationReference: skillData.implementationReference || ""` and add
`references: skillData.references || []`. Drop the JSDoc parameter line that
references the old field.

Note: skills reach this function via two paths — Map's
`loadSkillsFromCapabilities` (which step 4 updates) and Map's
`loadSkillsWithAgentData` (which already spreads the raw skill including any
top-level `references:`). Both deliver the same field name to
`generateSkillMarkdown`, so no second loader change is needed. The view-model
emitted here is what every Pathway consumer reads; `references` is a structured
array (not a flattened string), preserving `{name, title, body}` through to the
writers.

**Verify:** `bun test libraries/libskill/`. Then sanity-check
`bun test products/pathway/test/build-packs.test.js` to confirm the
`loadSkillsWithAgentData` path arrives at `skill.references` correctly in the
build-packs writer.

### 6. Reference template — single-entry shape

**File:** `products/pathway/templates/skill-reference.template.md` (modified).

Replace contents with:

```text
# {{{title}}}

{{{body}}}
```

Drop the `— Reference` suffix per § 5.

**Verify:** rendered string for a fixture entry equals `# Title\n\nbody-content`
(covered by formatter test in step 17).

### 7. Agent skill formatter — drop reference handling, simplify `formatReference`

**File:** `products/pathway/src/formatters/agent/skill.js` (modified).

| Change                  | Detail                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prepareAgentSkillData` | Remove `implementationReference` parameter, `trimmedReference`, `implementationReference` and `hasReference` outputs. Update JSDoc accordingly.        |
| `formatAgentSkill`      | Remove `implementationReference` parameter from destructuring + JSDoc.                                                                                 |
| `formatReference`       | New signature: `formatReference(entry, template) → string`. Body: `Mustache.render(template, { title: entry.title, body: entry.body })`. Update JSDoc. |

**Verify:** `bun test products/pathway/test/markdown.test.js` after fixtures
update; lint clean.

### 8. SKILL.md template — drop `hasReference` block

**File:** `products/pathway/templates/skill.template.md` (modified).

Delete lines 15–17:

```text
{{#hasReference}}
See [implementation reference](references/REFERENCE.md) for code examples.
{{/hasReference}}
```

Authors point at references through `instructions` per § 4.

**Verify:** template snapshot test or build-packs test passes.

### 9. Writer helper — `writeSkillReferences`

**File:** `products/pathway/src/commands/agent-io.js` (modified).

Replace the `if (skill.implementationReference) { … REFERENCE.md … }` branch in
`writeSkills` (lines 148–155) with a call to a new exported
`writeSkillReferences(skillDir, references, template)`. Also update the
`writeSkills` JSDoc on line 122 — drop `references/REFERENCE.md` from the listed
outputs and replace with `references/{name}.md`.

```js
export async function writeSkillReferences(skillDir, references, template) {
  const refDir = join(skillDir, "references");
  await rm(refDir, { recursive: true, force: true });
  if (!references || references.length === 0) return 0;
  await mkdir(refDir, { recursive: true });
  for (const entry of references) {
    const refPath = join(refDir, `${entry.name}.md`);
    await writeFile(refPath, formatReference(entry, template), "utf-8");
    logger.info(formatSuccess(`Created: ${refPath}`));
  }
  return references.length;
}
```

Wipe-then-write runs every call (§ 6 ownership contract). Add `rm` to the
existing `fs/promises` import. The `export` keyword on the helper is required so
build-packs (step 10) can `import { writeSkillReferences }`.

In `writeSkills`, after the install-script block, replace the old reference
branch with
`fileCount += await writeSkillReferences(skillDir, skill.references, templates.reference);`.

**Verify:** `bun test products/pathway/test/`.

### 10. Build-packs writer — per-entry loop

**File:** `products/pathway/src/commands/build-packs.js` (modified).

Inside `writePackFiles`, replace the `if (skill.implementationReference)` branch
(lines 140–148) with a call to `writeSkillReferences` imported from
`./agent-io.js`. Staging directories start empty so the wipe is a no-op but
keeps the helper's contract intact.

**Verify:** `bun test products/pathway/test/build-packs.test.js`.

### 11. Skill view-model — replace `implementationReference` with `references`

**File:** `products/pathway/src/formatters/skill/shared.js` (modified).

In `prepareSkillDetail` (line 142), replace
`implementationReference: skill.implementationReference || null` with
`references: skill.references || []`. Update the `SkillDetailView` typedef
(lines 64–79): drop `implementationReference`, add
`references: Array<{name: string, title: string, body: string}>`.

**Verify:** consumers below pass type-shape checks.

### 12. Markdown formatter — loop per entry

**File:** `products/pathway/src/formatters/skill/markdown.js` (modified).

Replace lines 119–123:

```js
if (view.references.length > 0) {
  for (const ref of view.references) {
    lines.push(`## ${ref.title}`, "", ref.body, "");
  }
}
```

The single `## Implementation Patterns` heading is replaced by per-entry
`## {title}` headings (§ 7).

**Verify:** `bun test products/pathway/test/markdown.test.js`.

### 13. DOM formatter — `references/{name}.md` per entry

**File:** `products/pathway/src/formatters/skill/dom.js` (modified).

| Change                                                           | Detail                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skillToDOM` gate condition (line 238)                           | Replace `view.implementationReference` with `view.references.length > 0`. The disjunction `agentSkillContent \|\| ... \|\| view.installScript` stays intact; only the middle term changes.                                                                                                                                                                                                                              |
| `skillToDOM` context shape                                       | Add an optional `referenceContents: Map<string, string>` (keyed by `ref.name`) in the destructured options. Callers pre-render with `formatReference` so the on-disk and on-screen byte streams match.                                                                                                                                                                                                                  |
| `buildSkillFiles` (lines 277–284)                                | Replace the single push with `for (const ref of view.references)` pushing `{ filename: \`references/${ref.name}.md\`, content: referenceContents?.get(ref.name) ?? \`# ${ref.title}\n\n${ref.body}\n\`, language: "markdown" }`. The fallback string includes the trailing newline so its bytes match the Mustache template's output even when `referenceContents` is absent (e.g. tests that don't thread a template). |
| Callers (`pages/skill.js`, `handout-main.js`, `slides/skill.js`) | Where `agentSkillContent` is already pre-loaded via `getSkillTemplate()` + `formatAgentSkill`, add an analogous `getReferenceTemplate()` load and a `Map` built by iterating `skill.references` with `formatReference(ref, refTemplate)`. Pass the map as `referenceContents` to `skillToDOM`.                                                                                                                          |

**Verify:** lint clean; DOM render snapshot/regression test if one exists,
otherwise smoke-load `bunx fit-pathway skill --html` against a fixture.

### 14. Pathway YAML loader (browser) — swap field

**File:** `products/pathway/src/lib/yaml-loader.js` (modified).

In `loadSkillsFromCapabilities` (lines 38–63), replace `implementationReference`
in the destructure list and spread with `references`. Same pattern as the Map
loader.

**Verify:** Pathway browser preview loads without console errors.

### 15. Web preview — swap reference card

**File:** `products/pathway/src/pages/agent-builder-preview.js` (modified).

Replace lines 53–59 with a per-entry loop pushing one file per reference into
the `files` array used by `createFileCard`:

```js
for (const ref of skill.references || []) {
  files.push({
    filename: `${skill.dirname}/references/${ref.name}.md`,
    content: formatReference(ref, templates.reference),
    language: "markdown",
  });
}
```

**Verify:** load `/agent-builder` page in dev server; reference files appear
per-entry in the file card.

### 16. Web download (zip) — per-entry loop

**File:** `products/pathway/src/pages/agent-builder-download.js` (modified).

Replace `addSkillsToZip` lines 41–47 with a per-entry loop:

```js
for (const ref of skill.references || []) {
  zip.file(
    `.claude/skills/${skill.dirname}/references/${ref.name}.md`,
    formatReference(ref, templates.reference),
  );
}
```

The zip is built fresh (§ 6) so no wipe is needed.

**Verify:** download a generated zip in dev mode; inspect that
`references/{name}.md` matches per-entry YAML.

### 17. Tests — fixtures + assertions

**Files (modified or created — exact split is implementer's call):**

- `products/map/test/fixtures.js` — add a skill fixture with two `references`
  entries; add an `implementationReference` fixture used as rejected input.
- `products/map/test/data-loader.test.js` — assert loader passes `references`
  through unchanged.
- `products/map/test/pipeline.test.js` (or equivalent validation test) — assert
  each rule from spec § Validation rules fires with the right code + path;
  assert `implementationReference` is rejected with a message naming
  `references`.
- `products/pathway/test/markdown.test.js` — assert per-entry `## {title}`
  emission; assert empty `references` produces no section.
- `products/pathway/test/build-packs.test.js` — assert per-pack
  `references/{name}.md` files match YAML; assert wipe-then-write semantics
  (pre-existing stale file is removed).
- `products/pathway/test/agent-io.test.js` (or new file in same dir) — separate
  stale-file test for the CLI `writeSkills` path: pre-create
  `<skillDir>/references/old.md`, run `writeSkills` over a fixture skill with
  one fresh entry, assert `old.md` is gone and the new entry's file exists.
  Criterion 6 covers both paths and both must be exercised independently.
- `products/pathway/test/shared.test.js` — assert `SkillDetailView.references`
  shape.

Tests must cover criterion 6 (regenerating over a stale `references/` directory
removes extras). Use a `tmpdir` fixture that pre-creates a stray
`references/old.md` and asserts its absence post-run.

**Verify:** `bun test` from repo root.

### 18. Starter framework — exercise the multi-file path

**File:** `products/map/starter/capabilities/reliability.yaml` (modified).

Under `skills[0]` (`incident_response`), append a top-level `references:` array
with two entries (per § 8 commitment):

```yaml
    references:
      - name: runbooks
        title: Incident Runbooks
        body: |
          Step-by-step procedures for the top five incident classes.
          (Author content — short paragraph for the starter sample.)
      - name: postmortem-template
        title: Postmortem Template
        body: |
          Fields expected in every postmortem:
          - Summary, timeline, root cause, contributing factors,
            corrective actions, owner, due date.
```

Body content is illustrative; implementer may refine prose so long as it is
substantive (>= 1 paragraph each) and matches the runbook/template themes.

**Verify:** `bunx fit-map validate products/map/starter` passes; running
`bunx fit-pathway agent --data products/map/starter --output /tmp/skill-660`
produces `incident-response/references/runbooks.md` and `postmortem-template.md`
whose contents start with `# {title}`.

### 19. Authoring guide — replace `implementationReference` example

**File:** `website/docs/guides/authoring-frameworks/index.md` (modified).

| Line    | Change                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 591     | `Move code examples to \`implementationReference\``→`Move code examples to a \`references:\` entry's \`body\``                                    |
| 668     | Replace `install scripts, and implementation references:` with `install scripts, and reference documents:` (prose lead-in for the example below). |
| 715–718 | Replace the `implementationReference: \|` block in the example with:                                                                              |

```yaml
    references:
      - name: tracing
        title: Langfuse Tracing
        body: |
          See the Langfuse Python SDK docs for tracing patterns.
```

**Verify:** `git grep -n implementationReference website/docs/guides/` returns
no hits.

### 20. Agent-teams guide — table row

**File:** `website/docs/guides/agent-teams/index.md` (modified).

Replace line 136:

```text
| `capabilities/*.yaml` | `skills[].references[]` (each entry → one file) | `skills/*/references/{name}.md` | Skill |
```

**Verify:**
`git grep -n 'implementationReference\|references/REFERENCE\.md' website/docs/guides/`
returns no hits.

### 21. Source-comment cleanup

**Files:**

- `products/pathway/src/components/skill-file-viewer.js` (line 5 JSDoc) —
  replace `references/REFERENCE.md` with `references/{name}.md`.
- `products/pathway/src/css/components/skill-file-viewer.css` (line 5 comment) —
  replace `REFERENCE.md` with `references files`.

These are doc strings only; they have no behavioural effect, but spec criterion
7 includes `products/pathway/src/`, so the grep gate (step 22) will fail without
them.

**Verify:** included in step 22 grep.

### 22. Cleanup pass — repo grep

**Verify (no file change):** Run from repo root:

```bash
git grep -n "implementationReference\|<scaffolding_steps>" \
  products/map/src products/pathway/src products/pathway/templates \
  libraries/libskill/src website/docs/guides
```

Allowed hits per spec criterion 7:

- One in `products/map/src/validation/skill.js` (the deprecation rejection rule
  from step 3).
- Test fixture occurrences in `products/map/test/` (criterion 7 explicitly
  whitelists test fixtures used as rejected-input).

Anything else fails the gate — return to the originating step.

The grep deliberately omits `products/map/schema/` (criterion 7's path list does
not include it) — the schema files retain `implementationReference` by design
(step 1) so the friendly validator path can fire.

## Libraries used

Libraries used: existing only (`mustache`, `ajv`, `ajv-formats`, `yaml`,
`@forwardimpact/libcli`, `@forwardimpact/libtelemetry`, `@forwardimpact/libui`).
No new dependencies.

## Risks

- **Schema-validator deprecation message disappears.** Two ways the friendly
  message can silently regress: (a) a future cleanup removes
  `implementationReference` from `capability.schema.json` while
  `additionalProperties: false` remains — Ajv rejects the field with a generic
  `SCHEMA_VALIDATION` error before the custom validator runs; (b) someone
  re-adds `"type": "string"` to the kept property — Ajv catches a non-string
  value before the friendly path fires. Mitigation: step 1 keeps the property
  declared with empty schema (`{}`), step 3 enforces the friendly text, and the
  test in step 17 asserts both the path and the message string. Reviewers of any
  later schema change must run the test.
- **Hand-authored references silently deleted.** Wipe-then-write (§ 6) is the
  spec's stated contract, but contributors with hand-authored `references/*.md`
  files in shipped skills (e.g. `fit-pathway/references/`) will lose them on the
  first regenerate. Mitigation is migration-time, not plan-time: before merging,
  audit shipped skill `references/` directories and migrate any hand-authored
  content into the YAML `references:` array of the corresponding starter source.
  Out of plan scope, but flagged here so the implementer surfaces it in the PR
  description.
- **`fit:references` RDF range typing.** The SHACL `fit:Reference` shape
  (step 2) has no precedent — `fit:ToolReference` is the closest analog. Slight
  divergence in property naming (`name` vs `toolName`) is acceptable; the
  reviewer should confirm the chosen prefix scheme keeps `--shacl` validation
  green on starter data. If the SHACL shape is mis-modelled, validation will
  loudly fail in step 2's verify; the failure is surfaced before downstream
  steps depend on it.
- **Builder zip and CLI writer divergence.** The CLI writer uses the
  `writeSkillReferences` helper (with wipe); the zip writer cannot share it
  (different I/O target) and re-implements the per-entry loop inline (§ 6). Risk
  is the two paths drift over time. Mitigation: shared rendering goes through
  `formatReference(entry, template)`; only the loop wrapper differs. Test in
  step 17 asserts the per-entry shape on both paths.

## Execution

Single sequential implementation, all steps on one branch
(`feat/spec-0660-skill-multiple-references`). Routes to `staff-engineer` for
steps 1–18 + 21–22 (code) and `technical-writer` for steps 19–20 (docs). The
docs steps are self-contained and may run in parallel with steps 9–18 once steps
1–8 land — they only depend on the field name being settled, which is fixed at
step 3.

Recommended execution order if parallelizing: staff-engineer drives steps 1 → 8
sequentially (each is a thin shape change), then steps 9 → 17 in one sitting
(writer + callers + tests), then steps 18 (starter) and 21–22 (comment cleanup +
grep). Technical-writer can fire steps 19 and 20 any time after step 3 lands —
they have no code dependency.
