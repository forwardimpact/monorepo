# PLAN-03: Clinical Prose Pipeline

> Add clinical prose generation — prompt templates, prose context extension,
> key generation, and registration. Clinical prose uses the existing
> `generateStructured()` path with pre-built message arrays and a
> patient-facing system prompt, keeping the existing `generatePlain()` path
> untouched.

## Dependencies

- **PLAN-02** — Entity generator must produce `entities.clinical` with
  resolved relationships so prose keys can reference trial→condition,
  trial→criteria, and site→active_trials links.

## Dependency Graph

```
PLAN-02 → PLAN-03 → PLAN-05 (pipeline)
                  → PLAN-08 (clinical HTML templates)
```

## Files to Modify

| File | Change |
|------|--------|
| `libraries/libsyntheticgen/src/engine/prose-keys.js` | Add `addClinicalKeys()` branch in `collectProseKeys()` (after outpost, before activity) |

## Files to Create

| File | Purpose |
|------|---------|
| `libraries/libsyntheticgen/src/engine/clinical-prose-keys.js` | `clinicalProseKeys()` generator yielding `[key, context]` tuples |
| `libraries/libsyntheticprose/src/prompts/clinical-system.prompt.md` | Patient-facing system prompt |
| `libraries/libsyntheticprose/src/prompts/condition-explainer.prompt.md` | Condition explainer user prompt |
| `libraries/libsyntheticprose/src/prompts/therapy-description.prompt.md` | Therapy description user prompt |
| `libraries/libsyntheticprose/src/prompts/trial-faq.prompt.md` | Trial FAQ user prompt |
| `libraries/libsyntheticprose/src/prompts/consent-summary.prompt.md` | Consent summary user prompt |
| `libraries/libsyntheticprose/src/prompts/site-description.prompt.md` | Site description user prompt |
| `libraries/libsyntheticprose/src/prompts/patient-story.prompt.md` | Patient story user prompt |
| `libraries/libsyntheticgen/test/clinical-prose-keys.test.js` | Tests for clinical prose key generation |

## Design

### Clinical Prose Context Shape

Clinical prose extends `ProseContext` with a `clinical` field. The base
fields (`topic`, `tone`, `length`, `domain`, `orgName`) remain the same.
The `clinical` sub-object provides factual grounding for what to write
about (as opposed to DX drivers which shape *how* to write).

```javascript
{
  topic, tone, length, domain, orgName,
  clinical: {
    trial?: { name, phase, therapeutic_area, status, arms, sponsor, enrollment_pct },
    condition?: { name, icd10, synonyms, severity, related_trials },
    site?: { name, city, state, specialties, active_trials },
    criteria?: { inclusion_summary, exclusion_summary, question_count },
    conditions_in_scope: string[],
    trials_in_scope: string[],
    sites_in_scope: string[]
  }
}
```

### Clinical vs Existing Prose: Key Differences

| Concern | Existing (guide_html, outpost) | Clinical |
|---------|-------------------------------|----------|
| Generation path | `generatePlain()` → `#callLlm()` → generic system prompt | `generateStructured()` → pre-built messages → clinical system prompt |
| System prompt | `prose-system.prompt.md` (technical writer) | `clinical-system.prompt.md` (medical communications writer) |
| Context | `topic + tone + DX drivers` | `topic + tone + clinical entity data` |
| Cache key | `entity_key` | `entity_key#hash(messages)` (auto-invalidates on entity change) |

The structured path is already used by `PathwayGenerator` and the enricher.
Clinical prose follows the same pattern — each template builder constructs a
`[{ role: "system", content }, { role: "user", content }]` message array and
calls `proseGenerator.generateStructured(key, messages)`.

## Steps

### 1. Clinical System Prompt

Create `clinical-system.prompt.md`:

```
You are a medical communications writer for a pharmaceutical company.
You write for patients and caregivers — not clinicians. Use plain language
at an 8th-grade reading level. When a medical term is unavoidable, define
it inline on first use. Be empathetic but factual. Never minimize risks or
overstate benefits. Output the text only, no explanations or markdown formatting.
```

### 2. Clinical Prompt Templates

Six Mustache templates, each consuming the flattened clinical context.

**Mustache constraint:** No dotted paths (`clinical.trial`), no `{{#each}}`.
The template data layer must flatten nested objects to `clinical_trial`,
`clinical_condition`, etc. and pre-join arrays (`arms_joined`,
`synonyms_joined`).

#### condition-explainer.prompt.md

```mustache
Write {{length}} of {{tone}} content explaining: {{topic}}.

{{#clinical_condition}}
Condition: {{name}} ({{severity}}).
ICD-10: {{icd10_joined}}.
Patients may describe this as: {{synonyms_joined}}.
{{#related_trials_joined}}Related trials: {{related_trials_joined}}.{{/related_trials_joined}}
{{/clinical_condition}}

Explain this condition for patients and caregivers in plain language.
Cover: what the condition is, common symptoms, how it's diagnosed,
and what treatment options exist. Do not give medical advice.

{{#orgName}}Company: {{orgName}}.{{/orgName}}
```

The remaining five templates follow the same structure — factual grounding
from the clinical context, followed by audience-specific instructions.
See SCRATCHPAD-DEMO-DATA.md §2 for the full template table (audience,
tone, length targets).

### 3. Clinical Prose Key Generator

Create `clinical-prose-keys.js` exporting `clinicalProseKeys(clinical, domain, orgName)`.

This generator walks the `ClinicalBlock` entities and yields `[key, context]`
tuples:

```javascript
export function* clinicalProseKeys(clinical, domain, orgName) {
  const condNames = clinical.conditions.map(c => c.name);
  const trialNames = clinical.trials.map(t => t.name);
  const siteNames = clinical.sites.map(s => s.name);
  const base = { domain, orgName, conditions_in_scope: condNames, trials_in_scope: trialNames, sites_in_scope: siteNames };

  // Per-condition: explainers
  for (const cond of clinical.conditions) {
    yield [`clinical_condition_explainer_${cond.id}`, {
      topic: cond.prose_topic || `${cond.name} in plain language for patients`,
      tone: cond.prose_tone || "empathetic, accessible",
      length: "400-600 words",
      ...base,
      clinical: {
        condition: {
          name: cond.name, icd10: cond.icd10, synonyms: cond.synonyms,
          severity: cond.severity, related_trials: cond.trials.map(tid =>
            clinical.trials.find(t => t.id === tid)?.name).filter(Boolean),
        },
        ...base,
      },
    }];
  }

  // Per-trial: FAQs
  for (const trial of clinical.trials) {
    const criteria = clinical.criteria.find(c => c.trial_id === trial.id);
    yield [`clinical_trial_faq_${trial.id}`, {
      topic: `FAQ for ${trial.name}`,
      tone: "concrete, reassuring",
      length: "8-12 questions",
      ...base,
      clinical: {
        trial: buildTrialContext(trial),
        criteria: criteria ? buildCriteriaContext(criteria) : undefined,
        ...base,
      },
    }];
  }

  // Per-trial: consent summaries
  for (const trial of clinical.trials) {
    const criteria = clinical.criteria.find(c => c.trial_id === trial.id);
    yield [`clinical_consent_summary_${trial.id}`, {
      topic: `Consent summary for ${trial.name}`,
      tone: "formal but readable",
      length: "500-800 words",
      ...base,
      clinical: {
        trial: buildTrialContext(trial),
        criteria: criteria ? buildCriteriaContext(criteria) : undefined,
        ...base,
      },
    }];
  }

  // Per-site: descriptions
  for (const site of clinical.sites) {
    const activeTrials = clinical.trials
      .filter(t => t.sites.includes(site.id) && t.status === "recruiting")
      .map(t => t.name);
    yield [`clinical_site_description_${site.id}`, {
      topic: `${site.name} site information`,
      tone: "practical, welcoming",
      length: "200-300 words",
      ...base,
      clinical: {
        site: {
          name: site.name, city: site.city, state: site.state,
          specialties: site.specialties, active_trials: activeTrials,
        },
        ...base,
      },
    }];
  }

  // Patient stories (by condition, count from content spec)
  if (clinical.content) {
    const storyConditions = clinical.content.patient_story_conditions || [];
    const totalStories = clinical.content.patient_stories || 0;
    const perCondition = Math.ceil(totalStories / Math.max(storyConditions.length, 1));
    for (const condId of storyConditions) {
      const cond = clinical.conditions.find(c => c.id === condId);
      if (!cond) continue;
      for (let i = 0; i < perCondition; i++) {
        yield [`clinical_patient_story_${condId}_${i}`, {
          topic: `Patient story: living with ${cond.name}`,
          tone: "first-person, empathetic",
          length: "300-400 words",
          ...base,
          clinical: {
            condition: { name: cond.name, icd10: cond.icd10, synonyms: cond.synonyms, severity: cond.severity },
            ...base,
          },
        }];
      }
    }
  }

  // Therapy descriptions (standalone, from content spec)
  if (clinical.content) {
    for (const topic of clinical.content.therapy_topics || []) {
      yield [`clinical_therapy_description_${topic}`, {
        topic: `${topic.replace(/_/g, " ")} treatment overview`,
        tone: "balanced, factual, accessible",
        length: "300-500 words",
        ...base,
        clinical: { ...base },
      }];
    }
  }
}
```

Helper functions `buildTrialContext()` and `buildCriteriaContext()` extract
the relevant fields from entity objects into the shape expected by templates.

### 4. Register in collectProseKeys()

In `prose-keys.js`, add after the outpost branch (line 159) and before the
`PROSE_ACTIVITIES` loop (line 164):

```javascript
import { clinicalProseKeys } from "./clinical-prose-keys.js";

// In collectProseKeys():
if (entities.clinical) {
  for (const [k, ctx] of clinicalProseKeys(entities.clinical, domain, orgName)) {
    keys.set(k, ctx);
  }
}
```

This follows the same inline pattern as `addGuideContentKeys()` and
`addOutpostKeys()` — clinical prose is entity-scoped, not activity-scoped,
so it does not go through `PROSE_ACTIVITIES`.

### 5. Prose Resolution Path

Clinical prose keys flow through `collectProseKeys()` into the
`cache-lookup` stage, which calls `proseGenerator.generatePlain(key, context)`
for each key. However, clinical prose needs the structured path
(`generateStructured`) for its custom system prompt.

Two options:
1. Add a `structured: true` flag to the prose context, and have
   `resolveProse()` in `nodes.js` branch on it.
2. Have `clinicalProseKeys()` yield pre-built message arrays alongside
   the context, and teach `resolveProse()` to call `generateStructured()`
   when messages are present.

**Option 2 is cleaner.** Extend the prose key entries to include an optional
`messages` field:

```javascript
yield [`clinical_condition_explainer_${cond.id}`, {
  // ... context fields for fallback / logging ...
  messages: [
    { role: "system", content: clinicalSystemPrompt },
    { role: "user", content: renderTemplate("condition-explainer", flatContext) },
  ],
}];
```

In `resolveProse()` (nodes.js:325-347), branch:

```javascript
for (const [key, context] of proseKeys) {
  i++;
  const value = context.messages
    ? await proseGenerator.generateStructured(key, context.messages, { maxTokens: context.maxTokens || 4000 })
    : await proseGenerator.generatePlain(key, context);
  if (value) prose.set(key, value);
  // ... logging ...
}
```

The `promptLoader` is available in the prose-keys context (passed via
`pkCtx` in `collectProseKeys`). The clinical key generator loads and
renders templates once, then embeds the rendered content in the messages
array. Template rendering happens at key-generation time, not at LLM-call
time — this matches the structured cache key pattern where the hash
includes the rendered prompt.

## Verification

### Unit Tests (clinical-prose-keys.test.js)

Build a minimal `entities.clinical` fixture (2 conditions, 1 site, 2 trials
with criteria, content spec with patient_stories and therapy_topics).

1. **Key count** — generator yields the expected number of keys:
   - 2 condition explainers
   - 2 trial FAQs
   - 2 consent summaries
   - 1 site description
   - N patient stories (per content spec)
   - M therapy descriptions (per content spec)

2. **Key naming** — all keys start with `clinical_` prefix.

3. **Clinical context shape** — each yielded context has a `clinical`
   sub-object with the correct entity data.

4. **Messages present** — each yielded context has a `messages` array
   with system + user roles.

5. **Per-entity cardinality** — when content spec says `per_condition`,
   the generator yields exactly one explainer per condition.

6. **No clinical block** — `collectProseKeys()` with `entities.clinical = null`
   returns zero clinical keys (existing keys unaffected).

### Integration Smoke Test

With a patched `story.dsl` containing a minimal clinical block, run the
full pipeline in `no-prose` mode to verify key collection doesn't error:

```sh
cd libraries/libterrain && bun run fit-terrain generate --mode no-prose
```
