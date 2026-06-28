# 1140 — Clinical Domain Support in Terrain Pipeline: Plan

## Approach

Implement clinical domain support bottom-up through the pipeline: parser first
(Part 01), then entity generation (Part 02), prose pipeline (Part 03), output
renderers (Part 04), pipeline wiring (Part 05), dataset evolution (Part 06),
HTML templates (Part 07), and Synthea operationalization (Part 08). Parts 01-04
can partially parallelize (02 depends on 01; 03 depends on 02; 04 depends on 01
only). Part 05 integrates 02-04. Part 06 depends on 01 and 02. Parts 07 and 08
are independent of 04-05. The story.dsl rewrite (spec 1150) exercises the full
stack and should land after all parts.

## Part Index

| Part | Title | Deps | Agent |
|------|-------|------|-------|
| [plan-a-01](plan-a-01.md) | DSL Grammar + Clinical Block Parser | none | staff-engineer |
| [plan-a-02](plan-a-02.md) | Clinical Entity Generator | 01 | staff-engineer |
| [plan-a-03](plan-a-03.md) | Clinical Prose Pipeline | 02 | staff-engineer |
| [plan-a-04](plan-a-04.md) | Output Format Extensions + Renderers | 01 | staff-engineer |
| [plan-a-05](plan-a-05.md) | Pipeline Integration | 02, 03, 04 | staff-engineer |
| [plan-a-06](plan-a-06.md) | Dataset Evolution | 01, 02 | staff-engineer |
| [plan-a-07](plan-a-07.md) | Clinical HTML Templates + Rendering | 02, 03 | staff-engineer |
| [plan-a-08](plan-a-08.md) | Synthea Operationalization | 06 | staff-engineer |

## Dependencies

```text
01 ──→ 02 ──→ 03 ──→ 05
│      │             ↑
│      └──→ 06 ──→ 08
│             ↑
└──→ 04 ──────┘
│
02 + 03 ──→ 07
```

Parts 01 and 04 can run in parallel after 01 completes its
tokenizer/parser-helpers work (04 needs `DOTTED_IDENT` and
`parseMappedArrays()`). Parts 07 and 08 are leaf nodes that can run in parallel
with 05.

## Libraries Used

`libsyntheticgen` (tokenizer, parser, parser-helpers, parser-clinical,
clinical-entities, clinical-prose-keys, synthea tool), `libsyntheticprose`
(prompt templates), `libsyntheticrender` (render-sql, render-embeddings, html,
templates), `libterrain` (nodes, cli-helpers).

## Execution

Route all parts to `staff-engineer`. Parts 01 → 02 → 03 are sequential. Part 04
can start after 01 lands. Part 05 waits for 02, 03, 04. Parts 06, 07, 08 can run
as soon as their deps land. Maximum parallelism: 01 first, then 02 + 04, then 03

- 06, then 05 + 07 + 08.

## Blast Radius

**Created:**

- `libraries/libsyntheticgen/src/dsl/parser-clinical.js`
- `libraries/libsyntheticgen/src/engine/clinical-entities.js`
- `libraries/libsyntheticgen/src/engine/clinical-prose-keys.js`
- `libraries/libsyntheticgen/test/parser-clinical.test.js`
- `libraries/libsyntheticgen/test/clinical-entities.test.js`
- `libraries/libsyntheticgen/test/clinical-prose-keys.test.js`
- `libraries/libsyntheticprose/src/prompts/clinical-system.prompt.md`
- `libraries/libsyntheticprose/src/prompts/condition-explainer.prompt.md`
- `libraries/libsyntheticprose/src/prompts/therapy-description.prompt.md`
- `libraries/libsyntheticprose/src/prompts/trial-faq.prompt.md`
- `libraries/libsyntheticprose/src/prompts/consent-summary.prompt.md`
- `libraries/libsyntheticprose/src/prompts/site-description.prompt.md`
- `libraries/libsyntheticprose/src/prompts/patient-story.prompt.md`
- `libraries/libsyntheticrender/src/render/render-sql.js`
- `libraries/libsyntheticrender/src/render/render-embeddings.js`
- `libraries/libsyntheticrender/templates/condition-explainer.html`
- `libraries/libsyntheticrender/templates/therapy-description.html`
- `libraries/libsyntheticrender/templates/trial-faq.html`
- `libraries/libsyntheticrender/templates/consent-summary.html`
- `libraries/libsyntheticrender/templates/site-description.html`
- `libraries/libsyntheticrender/templates/patient-story.html`
- `libraries/libsyntheticrender/templates/trial-card.html`
- `libraries/libsyntheticrender/test/render-sql.test.js`
- `libraries/libsyntheticrender/test/render-embeddings.test.js`
- `libraries/libsyntheticrender/test/render-clinical-html.test.js`

**Modified:**

- `libraries/libsyntheticgen/src/dsl/tokenizer.js`
- `libraries/libsyntheticgen/src/dsl/parser.js`
- `libraries/libsyntheticgen/src/dsl/parser-helpers.js`
- `libraries/libsyntheticgen/src/dsl/parser-standard.js`
- `libraries/libsyntheticgen/src/engine/tier0.js`
- `libraries/libsyntheticgen/src/engine/prose-keys.js`
- `libraries/libsyntheticgen/src/tools/synthea.js`
- `libraries/libsyntheticgen/test/tokenizer.test.js`
- `libraries/libsyntheticgen/test/parser-dataset.test.js`
- `libraries/libsyntheticrender/src/index.js`
- `libraries/libsyntheticrender/src/render/html.js`
- `libraries/libterrain/src/nodes.js`
- `libraries/libterrain/src/cli-helpers.js`
- `justfile`
- `.gitignore`

## Risks

- **Synthea JAR size (~40MB) in CI.** Mitigated by GitHub Actions cache keyed on
  `synthea_version`; pipeline already gracefully skips unavailable tools.
- **DOTTED_IDENT tokenizer change affects existing parsing.** Mitigated by the
  lexer trying `DOTTED_IDENT` only when a dot is followed by a letter, and all
  downstream parsers accepting both `IDENT` and `DOTTED_IDENT`.
- **Clinical prose generation cost.** Mitigated by `--mode no-prose` for
  development and CI; prose cache prevents re-generation.
