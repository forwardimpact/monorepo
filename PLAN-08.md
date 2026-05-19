# PLAN-08: Clinical HTML Templates + Rendering

> Add 7 HTML templates for clinical content and a `renderClinicalPages()`
> function in `html.js` that follows the existing two-pass pattern: Pass 1
> renders Mustache templates with `data-enrich` placeholders and Schema.org
> microdata; Pass 2 (enricher.js, unchanged) fills the prose blocks via LLM.

## Dependencies

- **PLAN-02** — `entities.clinical` must exist with resolved conditions,
  sites, trials, criteria, and researchers.
- **PLAN-03** — Clinical prose cache keys (`clinical_condition_explainer_*`,
  `clinical_trial_faq_*`, etc.) must be registered so the prose cache has
  content for `data-enrich` blocks.

## Dependency Graph

```
PLAN-02 ─┐
PLAN-03 ─┤→ PLAN-08
```

PLAN-08 is independent of PLANs 04–07 for unit testing (fixtures provide
the entity data). Integration testing against the full pipeline requires
PLAN-07 (story.dsl with clinical block). It produces HTML files that flow
through the existing `renderHTML()` → `enriched` → `write` pipeline path,
not the new `clinical-output` stage.

## Files to Modify

| File | Change |
|------|--------|
| `libraries/libsyntheticrender/src/render/html.js` | Add `renderClinicalPages()`, call from `renderHTML()` when `entities.clinical` exists |

## Files to Create

| File | Purpose |
|------|---------|
| `libraries/libsyntheticrender/templates/condition-explainer.html` | Patient-facing condition page |
| `libraries/libsyntheticrender/templates/therapy-description.html` | Treatment modality page |
| `libraries/libsyntheticrender/templates/trial-faq.html` | Per-trial FAQ page |
| `libraries/libsyntheticrender/templates/consent-summary.html` | Consent form summary |
| `libraries/libsyntheticrender/templates/site-description.html` | Site info page |
| `libraries/libsyntheticrender/templates/patient-story.html` | Anonymized patient narrative |
| `libraries/libsyntheticrender/templates/trial-card.html` | Compact trial summary for search results |
| `libraries/libsyntheticrender/test/render-clinical-html.test.js` | Tests for clinical HTML rendering |

## Design

### Two-Pass Pattern

The existing pipeline already handles both passes:

- **Pass 1** (`html.js:renderHTML`) — Mustache-renders templates into HTML
  files with `data-enrich="<key>"` attributes on prose blocks. The inner
  text is a fallback (entity field or empty string).
- **Pass 2** (`enricher.js`) — Regex-finds all `data-enrich` elements and
  replaces their inner text with LLM-generated prose from the cache. This
  pass is generic and needs no changes.

Clinical templates plug into Pass 1 only. The `data-enrich` keys use the
`clinical_` prefix from PLAN-03's prose key generator, so Pass 2 picks
them up automatically.

### Schema.org Types

| Template | Schema.org Type | Key Properties |
|----------|----------------|----------------|
| condition-explainer | `MedicalCondition` | `name`, `code` (ICD-10), `signOrSymptom`, `possibleTreatment` |
| therapy-description | `MedicalTherapy` | `name`, `description`, `medicineSystem` |
| trial-faq | `MedicalTrial` | `name`, `trialDesign`, `healthCondition`, `sponsor` |
| consent-summary | `MedicalTrial` | `name`, `trialDesign`, `eligiblePopulation` |
| site-description | `MedicalClinic` | `name`, `address`, `medicalSpecialty` |
| patient-story | `MedicalCondition` | `name`, `description` (wrapping the narrative) |
| trial-card | `MedicalTrial` | `name`, `trialDesign`, `status`, `healthCondition` |

## Steps

### 1. condition-explainer.html

```html
{{#conditions}}
<div itemscope itemtype="https://schema.org/MedicalCondition" itemid="{{{iri}}}">
  <h2 itemprop="name">{{name}}</h2>
  <meta itemprop="identifier" content="{{id}}" />
  <meta itemprop="code" content="{{icd10_joined}}" />
  <span itemprop="alternateName">{{synonyms_joined}}</span>

  {{#related_trials}}
  <link itemprop="study" href="{{{iri}}}" />
  {{/related_trials}}

  <div itemprop="description" data-enrich="clinical_condition_explainer_{{id}}">
    {{prose}}
  </div>
</div>
{{/conditions}}
```

### 2. therapy-description.html

```html
{{#therapies}}
<div itemscope itemtype="https://schema.org/MedicalTherapy" itemid="{{{iri}}}">
  <h2 itemprop="name">{{title}}</h2>

  <div itemprop="description" data-enrich="clinical_therapy_description_{{topic}}">
    {{prose}}
  </div>
</div>
{{/therapies}}
```

### 3. trial-faq.html

```html
{{#trials}}
<div itemscope itemtype="https://schema.org/MedicalTrial" itemid="{{{iri}}}">
  <h2 itemprop="name">{{name}}</h2>
  <meta itemprop="trialDesign" content="{{phase}}" />
  <meta itemprop="status" content="{{status}}" />
  <link itemprop="healthCondition" href="{{{condition_iris}}}" />
  <span itemprop="sponsor">{{sponsor}}</span>

  <div data-enrich="clinical_trial_faq_{{id}}">
    {{prose}}
  </div>
</div>
{{/trials}}
```

### 4. consent-summary.html

```html
{{#trials}}
<div itemscope itemtype="https://schema.org/MedicalTrial" itemid="{{{iri}}}">
  <h2 itemprop="name">{{name}} — Consent Summary</h2>
  <meta itemprop="trialDesign" content="{{phase}}" />
  <span itemprop="eligiblePopulation">Ages {{age_min}}–{{age_max}}, ECOG ≤ {{ecog_max}}</span>

  <div data-enrich="clinical_consent_summary_{{id}}">
    {{prose}}
  </div>
</div>
{{/trials}}
```

### 5. site-description.html

```html
{{#sites}}
<div itemscope itemtype="https://schema.org/MedicalClinic" itemid="{{{iri}}}">
  <h2 itemprop="name">{{name}}</h2>
  <div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
    <span itemprop="streetAddress">{{address}}</span>,
    <span itemprop="addressLocality">{{city}}</span>,
    <span itemprop="addressRegion">{{state}}</span>,
    <span itemprop="addressCountry">{{country}}</span>
  </div>
  <span itemprop="medicalSpecialty">{{specialties_joined}}</span>

  {{#active_trials}}
  <link itemprop="availableService" href="{{{iri}}}" />
  {{/active_trials}}

  <div itemprop="description" data-enrich="clinical_site_description_{{id}}">
    {{prose}}
  </div>
</div>
{{/sites}}
```

### 6. patient-story.html

```html
{{#stories}}
<div itemscope itemtype="https://schema.org/MedicalCondition" itemid="{{{condition_iri}}}">
  <h2>Living with <span itemprop="name">{{condition_name}}</span></h2>

  <div itemprop="description" data-enrich="clinical_patient_story_{{condition_id}}_{{index}}">
    {{prose}}
  </div>
</div>
{{/stories}}
```

### 7. trial-card.html

A compact card for search result lists — no `data-enrich` (no LLM prose
needed, all fields are entity data).

```html
{{#trials}}
<div itemscope itemtype="https://schema.org/MedicalTrial" itemid="{{{iri}}}">
  <h3 itemprop="name"><a href="trial-faq-{{id}}.html">{{name}}</a></h3>
  <meta itemprop="trialDesign" content="{{phase}}" />
  <span itemprop="status">{{status}}</span>
  <span>{{therapeutic_area}}</span>
  <span>{{arms_joined}}</span>
  <span>Enrollment: {{current_enrollment}}/{{target_enrollment}}</span>
  {{#condition_names}}
  <span itemprop="healthCondition">{{.}}</span>
  {{/condition_names}}
  {{#site_names}}
  <span>{{.}}</span>
  {{/site_names}}
</div>
{{/trials}}
```

### 8. renderClinicalPages() in html.js

Add after `renderContentPages()` (line 406 in the current file). The
function follows the same pattern as `renderReviewsPage()` and
`renderCommentsPage()` — it builds template data from entities and prose,
renders via the template loader, and wraps in `page()`.

```javascript
function renderClinicalPages(files, entities, prose, templates, domain) {
  const clinical = entities.clinical;

  // Condition explainer pages
  files.set(
    "condition-explainers.html",
    page(
      templates,
      "Condition Information",
      templates.render("condition-explainer.html", {
        conditions: clinical.conditions.map((c) => ({
          ...c,
          icd10_joined: c.icd10.join(", "),
          synonyms_joined: c.synonyms.join(", "),
          related_trials: clinical.trials
            .filter((t) => t.conditions.includes(c.id))
            .map((t) => ({ iri: t.iri })),
          prose:
            prose.get(`clinical_condition_explainer_${c.id}`) ||
            `Information about ${c.name}.`,
        })),
      }),
      domain,
    ),
  );

  // Therapy description pages
  const content = clinical.content;
  if (content?.therapy_topics) {
    files.set(
      "therapy-descriptions.html",
      page(
        templates,
        "Treatment Information",
        templates.render("therapy-description.html", {
          therapies: content.therapy_topics.map((topic) => ({
            topic,
            title: topic.replace(/_/g, " "),
            iri: `https://${domain}/id/clinical/therapy/${topic}`,
            prose:
              prose.get(`clinical_therapy_description_${topic}`) ||
              `Information about ${topic.replace(/_/g, " ")}.`,
          })),
        }),
        domain,
      ),
    );
  }

  // Trial FAQ pages
  files.set(
    "trial-faqs.html",
    page(
      templates,
      "Trial FAQs",
      templates.render("trial-faq.html", {
        trials: clinical.trials.map((t) => ({
          ...t,
          condition_iris: clinical.conditions
            .filter((c) => t.conditions.includes(c.id))
            .map((c) => c.iri)
            .join(" "),
          prose:
            prose.get(`clinical_trial_faq_${t.id}`) ||
            `Frequently asked questions about ${t.name}.`,
        })),
      }),
      domain,
    ),
  );

  // Consent summary pages
  files.set(
    "consent-summaries.html",
    page(
      templates,
      "Consent Summaries",
      templates.render("consent-summary.html", {
        trials: clinical.trials.map((t) => {
          const crit = clinical.criteria.find((c) => c.trial_id === t.id);
          return {
            ...t,
            age_min: crit?.inclusion?.age_min || "",
            age_max: crit?.inclusion?.age_max || "",
            ecog_max: crit?.inclusion?.ecog_max || "",
            prose:
              prose.get(`clinical_consent_summary_${t.id}`) ||
              `Consent information for ${t.name}.`,
          };
        }),
      }),
      domain,
    ),
  );

  // Site description pages
  files.set(
    "site-descriptions.html",
    page(
      templates,
      "Research Sites",
      templates.render("site-description.html", {
        sites: clinical.sites.map((s) => ({
          ...s,
          specialties_joined: s.specialties.join(", "),
          active_trials: clinical.trials
            .filter(
              (t) => t.sites.includes(s.id) && t.status === "recruiting",
            )
            .map((t) => ({ iri: t.iri })),
          prose:
            prose.get(`clinical_site_description_${s.id}`) ||
            `Information about ${s.name}.`,
        })),
      }),
      domain,
    ),
  );

  // Patient story pages
  if (content?.patient_story_conditions) {
    const totalStories = content.patient_stories || 0;
    const perCondition = Math.ceil(
      totalStories / Math.max(content.patient_story_conditions.length, 1),
    );
    const stories = [];
    for (const condId of content.patient_story_conditions) {
      const cond = clinical.conditions.find((c) => c.id === condId);
      if (!cond) continue;
      for (let i = 0; i < perCondition; i++) {
        stories.push({
          condition_id: condId,
          condition_name: cond.name,
          condition_iri: cond.iri,
          index: i,
          prose:
            prose.get(`clinical_patient_story_${condId}_${i}`) ||
            `A patient's experience with ${cond.name}.`,
        });
      }
    }
    files.set(
      "patient-stories.html",
      page(
        templates,
        "Patient Stories",
        templates.render("patient-story.html", { stories }),
        domain,
      ),
    );
  }

  // Trial cards (search results page — no data-enrich, all entity data)
  files.set(
    "trial-cards.html",
    page(
      templates,
      "Clinical Trials",
      templates.render("trial-card.html", {
        trials: clinical.trials.map((t) => ({
          ...t,
          arms_joined: t.arms.join(", "),
          condition_names: t.conditions.map(
            (cid) =>
              clinical.conditions.find((c) => c.id === cid)?.name || cid,
          ),
          site_names: t.sites.map(
            (sid) => clinical.sites.find((s) => s.id === sid)?.name || sid,
          ),
        })),
      }),
      domain,
    ),
  );
}
```

### 9. Wire into renderHTML()

In `renderHTML()` (html.js:385-409), add a clinical branch after the
content pages block:

```javascript
export function renderHTML(entities, prose, templates) {
  if (!templates) throw new Error("templates is required");
  const files = new Map();
  const domain = entities.domain;

  const { linked, gc } = buildLinkedEntities(entities, domain);
  const enrichedPlatforms = enrichPlatformsWithLinks(linked);
  const enrichedDrugs = enrichDrugsWithLinks(linked);

  renderStructuralPages(files, entities, templates, domain);
  renderLinkedPages(
    files, linked, enrichedPlatforms, enrichedDrugs, templates, domain,
  );

  if (gc) {
    renderContentPages(files, gc, linked, entities, prose, templates, domain);
  }

  // Clinical content pages (if clinical block present)
  if (entities.clinical) {
    renderClinicalPages(files, entities, prose, templates, domain);
  }

  return { files, linked };
}
```

## Verification

### Unit Tests (render-clinical-html.test.js)

Build a minimal `entities` fixture with `entities.clinical` containing
2 conditions, 1 site, 1 trial with criteria, and a content spec. Provide
a mock prose cache and a template loader.

1. **File count** — `renderClinicalPages()` produces 7 HTML files
   (condition-explainers, therapy-descriptions, trial-faqs,
   consent-summaries, site-descriptions, patient-stories, trial-cards).

2. **Schema.org microdata** — each file contains the expected
   `itemtype` URL (`MedicalCondition`, `MedicalTrial`, `MedicalClinic`,
   `MedicalTherapy`).

3. **data-enrich keys** — condition explainer file contains
   `data-enrich="clinical_condition_explainer_<id>"`. Trial FAQ file
   contains `data-enrich="clinical_trial_faq_<id>"`.

4. **Prose fallback** — when prose cache is empty, the inner text of
   `data-enrich` elements contains the fallback string (entity name).

5. **Prose populated** — when prose cache has entries, the inner text
   matches the cached prose.

6. **trial-card has no data-enrich** — the trial cards file contains
   no `data-enrich` attributes (all content is entity data).

7. **No clinical block** — `renderHTML()` with `entities.clinical`
   absent produces zero clinical HTML files. Existing files unaffected.

8. **IRI references** — condition `<link itemprop="study">` elements
   point to the correct trial IRIs. Site `<link itemprop="availableService">`
   elements point to recruiting trial IRIs only.

### Smoke Test

```sh
cd libraries/libsyntheticrender && bun test
```

All existing tests pass. New tests cover clinical HTML rendering.

### Integration Test (after PLAN-07 lands)

Run the full pipeline with prose:

```sh
bun run fit-terrain generate
ls output/data/knowledge/
```

Verify clinical HTML files appear in the output alongside existing
files (articles, blogs, courses, etc.) and contain rendered prose
in `data-enrich` blocks.
