# 1140 Part 03 — Clinical Prose Pipeline

Add clinical prose generation: prompt templates, prose context extension, key
generation, and registration in `collectProseKeys()`.

## Goal

Clinical prose keys flow through the existing pipeline (`collectProseKeys()` →
`cache-lookup` → `generateStructured()`) using a patient-facing system prompt
and Mustache-rendered clinical context. The existing `generatePlain()` path
stays untouched.

## Files

| Action | Path |
|--------|------|
| Modified | `libraries/libsyntheticgen/src/engine/prose-keys.js` |
| Modified | `libraries/libterrain/src/nodes.js` |
| Created | `libraries/libsyntheticgen/src/engine/clinical-prose-keys.js` |
| Created | `libraries/libsyntheticprose/src/prompts/clinical-system.prompt.md` |
| Created | `libraries/libsyntheticprose/src/prompts/condition-explainer.prompt.md` |
| Created | `libraries/libsyntheticprose/src/prompts/therapy-description.prompt.md` |
| Created | `libraries/libsyntheticprose/src/prompts/trial-faq.prompt.md` |
| Created | `libraries/libsyntheticprose/src/prompts/consent-summary.prompt.md` |
| Created | `libraries/libsyntheticprose/src/prompts/site-description.prompt.md` |
| Created | `libraries/libsyntheticprose/src/prompts/patient-story.prompt.md` |
| Created | `libraries/libsyntheticgen/test/clinical-prose-keys.test.js` |

## Steps

### Step 1 — Clinical system prompt

Create `clinical-system.prompt.md`:

```text
You are a medical communications writer for a pharmaceutical company.
You write for patients and caregivers — not clinicians. Use plain language
at an 8th-grade reading level. When a medical term is unavoidable, define
it inline on first use. Be empathetic but factual. Never minimize risks or
overstate benefits. Output the text only, no explanations or markdown formatting.
```

**Verify:** File exists with correct content.

### Step 2 — Clinical prompt templates

Six Mustache templates consuming flattened clinical context. Mustache
constraints: no dotted paths, no `{{#each}}`. Arrays pre-joined (`arms_joined`,
`synonyms_joined`). Nested objects flattened (`clinical_trial`,
`clinical_condition`).

| Template | Audience | Tone | Length |
|----------|----------|------|--------|
| `condition-explainer.prompt.md` | Patients, caregivers | Empathetic, plain language | 400-600 words |
| `therapy-description.prompt.md` | Patients considering treatment | Balanced, factual | 300-500 words |
| `trial-faq.prompt.md` | Patients evaluating a trial | Q&A format, reassuring | 8-12 questions |
| `consent-summary.prompt.md` | Patients about to enroll | Formal but readable | 500-800 words |
| `site-description.prompt.md` | Patients choosing where to go | Practical, welcoming | 200-300 words |
| `patient-story.prompt.md` | Patients seeking peer experience | First-person, empathetic | 300-400 words |

**Verify:** Files exist in `libraries/libsyntheticprose/src/prompts/`.

### Step 3 — Clinical prose key generator

Create `clinical-prose-keys.js` exporting
`clinicalProseKeys(clinical, domain, orgName)`.

Generator walks `ClinicalBlock` entities and yields `[key, context]` tuples with
pre-built `messages` arrays (clinical system prompt + Mustache-rendered user
prompt):

- Per-condition: `clinical_condition_explainer_{id}` — condition context.
- Per-trial: `clinical_trial_faq_{id}` — trial + criteria context.
- Per-trial: `clinical_consent_summary_{id}` — trial + criteria context.
- Per-site: `clinical_site_description_{id}` — site context with active trials.
- Per-condition × count: `clinical_patient_story_{condId}_{i}` — condition
  context.
- Per-topic: `clinical_therapy_description_{topic}` — cross-cutting context.

Helper functions `buildTrialContext()` and `buildCriteriaContext()` extract
entity fields into template-ready shapes.

**Verify:** `bun test` in `libsyntheticgen`.

### Step 4 — Register in collectProseKeys()

In `prose-keys.js`, after the outpost branch (line 159), before the
`PROSE_ACTIVITIES` loop (line 164):

```javascript
if (entities.clinical) {
  for (const [k, ctx] of clinicalProseKeys(entities.clinical, domain, orgName)) {
    keys.set(k, ctx);
  }
}
```

**Verify:** `bun test` in `libsyntheticgen`.

### Step 5 — Structured prose resolution

In `resolveProse()` (`nodes.js:325-347`), branch on the `messages` field in the
prose context:

```javascript
const value = context.messages
  ? await proseGenerator.generateStructured(key, context.messages, { maxTokens: context.maxTokens || 4000 })
  : await proseGenerator.generatePlain(key, context);
```

**Verify:** `bun test` in `libterrain`.

### Step 6 — Tests

Build a minimal `entities.clinical` fixture (2 conditions, 1 site, 2 trials with
criteria, content spec with `patient_stories` and `therapy_topics`).

- Key count — generator yields expected number of keys (2 explainers + 2 FAQs +
  2 consent + 1 site + N stories + M therapies).
- Key naming — all keys start with `clinical_` prefix.
- Clinical context shape — each context has a `clinical` sub-object.
- Messages present — each context has a `messages` array with system + user
  roles.
- Per-entity cardinality — `per_condition` yields exactly one explainer per
  condition.
- No clinical block — `collectProseKeys()` with `entities.clinical = null`
  returns zero clinical keys.

## Blast Radius

Created: `clinical-prose-keys.js`, 7 prompt templates,
`clinical-prose-keys.test.js`. Modified: `prose-keys.js`, `nodes.js`.

## Verification

```sh
cd libraries/libsyntheticgen && bun test
cd libraries/libterrain && bun test
```
