/**
 * Clinical HTML rendering — patient-facing pages with Schema.org microdata.
 *
 * Each `build*Data` helper looks up the prose key for the entity (e.g.
 * `clinical_condition_explainer_${id}`) in the prose cache and slots the
 * resolved prose into the template at Pass-1 render time via Mustache. The
 * `data-enrich="clinical_..."` attribute is left on the output element as
 * a marker only — the LLM enricher (`enricher.js`) iterates `data-enrich`
 * blocks but matches handlers by prefix (`project_`, `drug_`, ...), so
 * `clinical_` keys are never re-enriched and the cached prose survives
 * intact to disk.
 *
 * Prose is interpolated with triple-brace Mustache (`{{{prose}}}`) so the
 * patient-facing prompt's inline Schema.org spans land as live microdata
 * rather than HTML-escaped text.
 */

function titleCase(str) {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildConditionData(conditions, trials, prose, fhirCrossRef = null) {
  return conditions.map((cond) => {
    const base = {
      id: cond.id,
      name: cond.name,
      iri: cond.iri,
      severity: cond.severity || "",
      icd10List: (cond.icd10 || []).map((code) => ({ code })),
      synonymList: (cond.synonyms || []).map((synonym) => ({ synonym })),
      trialLinks: (cond.trials || [])
        .map((tid) => trials.find((t) => t.id === tid))
        .filter(Boolean)
        .map((t) => ({ iri: t.iri })),
      prose:
        prose.get(`clinical_condition_explainer_${cond.id}`) ||
        `${cond.name} — patient-facing overview.`,
    };
    if (!fhirCrossRef) return base;
    const matched = fhirCrossRef.conditionIdToPatientIris.get(cond.id);
    if (!matched || matched.size === 0) return base;
    return {
      ...base,
      affectedPatientLinks: [...matched].map((iri) => ({ iri })),
    };
  });
}

function buildTherapyData(content, prose, domain) {
  if (!content?.therapy_topics) return [];
  return content.therapy_topics.map((topic) => ({
    topic,
    title: titleCase(topic),
    iri: `https://${domain}/id/clinical/therapy/${topic}`,
    prose:
      prose.get(`clinical_therapy_description_${topic}`) ||
      `${titleCase(topic)} treatment overview.`,
  }));
}

function buildTrialFaqData(trials, conditions, prose) {
  return trials.map((trial) => ({
    id: trial.id,
    name: trial.name,
    iri: trial.iri,
    protocol_id: trial.protocol_id || "",
    phase: trial.phase || "",
    status: trial.status || "",
    sponsor: trial.sponsor || "",
    conditionLinks: (trial.conditions || [])
      .map((cid) => conditions.find((c) => c.id === cid))
      .filter(Boolean)
      .map((c) => ({ iri: c.iri })),
    prose:
      prose.get(`clinical_trial_faq_${trial.id}`) || `FAQ for ${trial.name}.`,
  }));
}

function buildConsentData(trials, criteria, prose) {
  return trials.map((trial) => {
    const crit = criteria.find((c) => c.trial_id === trial.id);
    const inc = crit?.inclusion || null;
    const eligibility =
      inc?.age_min != null || inc?.age_max != null
        ? [
            {
              eligibleMinAge: inc.age_min ?? "",
              eligibleMaxAge: inc.age_max ?? "",
            },
          ]
        : [];
    return {
      id: trial.id,
      name: trial.name,
      iri: trial.iri,
      protocol_id: trial.protocol_id || "",
      phase: trial.phase || "",
      eligibilitySummary: eligibility,
      prose:
        prose.get(`clinical_consent_summary_${trial.id}`) ||
        `Consent summary for ${trial.name}.`,
    };
  });
}

function buildSiteData(sites, trials, prose, fhirCrossRef = null) {
  return sites.map((site) => {
    const base = {
      id: site.id,
      name: site.name,
      iri: site.iri,
      address: site.address || "",
      city: site.city || "",
      state: site.state || "",
      country: site.country || "",
      specialtyList: (site.specialties || []).map((specialty) => ({
        specialty,
      })),
      activeTrialLinks: (site.trials || [])
        .map((tid) => trials.find((t) => t.id === tid))
        .filter((t) => t && t.status === "recruiting")
        .map((t) => ({ iri: t.iri })),
      prose:
        prose.get(`clinical_site_description_${site.id}`) ||
        `${site.name} — site information.`,
    };
    if (!fhirCrossRef) return base;
    const matched = fhirCrossRef.siteIdToPatientIris.get(site.id);
    if (!matched || matched.size === 0) return base;
    return {
      ...base,
      servedPatientLinks: [...matched].map((iri) => ({ iri })),
    };
  });
}

function buildPatientStoryData(conditions, content, prose, domain) {
  if (!content?.patient_story_conditions?.length) return [];
  const total = content.patient_stories || 0;
  const condIds = content.patient_story_conditions;
  // Mirror the prose-key generator's cardinality math (clinical-prose-keys.js).
  // Generate exactly `perCondition` stories per condition so the data-enrich
  // keys here line up 1:1 with the keys collected upstream.
  const perCondition = Math.ceil(total / Math.max(condIds.length, 1));
  const stories = [];
  for (const condId of condIds) {
    const cond = conditions.find((c) => c.id === condId);
    if (!cond) continue;
    for (let i = 0; i < perCondition; i++) {
      stories.push({
        conditionId: condId,
        conditionIri:
          cond.iri || `https://${domain}/id/clinical/condition/${condId}`,
        conditionName: cond.name,
        index: i,
        title: `Living with ${cond.name} — story ${i + 1}`,
        prose:
          prose.get(`clinical_patient_story_${condId}_${i}`) ||
          `Patient story about ${cond.name}.`,
      });
    }
  }
  return stories;
}

function buildTrialCardData(trials, conditions, sites, fhirCrossRef = null) {
  return trials.map((trial) => {
    const base = {
      id: trial.id,
      name: trial.name,
      iri: trial.iri,
      protocol_id: trial.protocol_id || "",
      phase: trial.phase || "",
      status: trial.status || "",
      therapeutic_area: trial.therapeutic_area || "",
      sponsor: trial.sponsor || "",
      conditionLinks: (trial.conditions || [])
        .map((cid) => conditions.find((c) => c.id === cid))
        .filter(Boolean)
        .map((c) => ({ iri: c.iri })),
      siteLinks: (trial.sites || [])
        .map((sid) => sites.find((s) => s.id === sid))
        .filter(Boolean)
        .map((s) => ({ iri: s.iri })),
    };
    if (!fhirCrossRef) return base;
    const matched = fhirCrossRef.trialIriToPatientIris.get(trial.iri);
    if (!matched || matched.size === 0) return base;
    return {
      ...base,
      enrolledPatientLinks: [...matched].map((iri) => ({ iri })),
    };
  });
}

/**
 * Render 7 clinical HTML files into `files`. The `page` wrapper is supplied
 * by the caller so clinical pages share the org-wide page chrome.
 *
 * @param {Map<string,string>} files
 * @param {object} entities - Must include `entities.clinical`
 * @param {Map<string,string>} prose
 * @param {import('@forwardimpact/libtemplate/loader').TemplateLoader} templates
 * @param {string} domain
 * @param {(title: string, body: string) => string} pageWrap
 */
export function renderClinicalPages(
  files,
  entities,
  prose,
  templates,
  domain,
  pageWrap,
  fhirCrossRef = null,
) {
  const clinical = entities.clinical;
  if (!clinical) return;
  const { conditions, sites, trials, criteria, content } = clinical;

  files.set(
    "condition-explainers.html",
    pageWrap(
      "Condition Explainers",
      templates.render("condition-explainer.html", {
        conditions: buildConditionData(conditions, trials, prose, fhirCrossRef),
      }),
    ),
  );

  files.set(
    "therapy-descriptions.html",
    pageWrap(
      "Therapy Descriptions",
      templates.render("therapy-description.html", {
        therapies: buildTherapyData(content, prose, domain),
      }),
    ),
  );

  files.set(
    "trial-faqs.html",
    pageWrap(
      "Trial FAQs",
      templates.render("trial-faq.html", {
        trials: buildTrialFaqData(trials, conditions, prose),
      }),
    ),
  );

  files.set(
    "consent-summaries.html",
    pageWrap(
      "Consent Summaries",
      templates.render("consent-summary.html", {
        trials: buildConsentData(trials, criteria || [], prose),
      }),
    ),
  );

  files.set(
    "site-descriptions.html",
    pageWrap(
      "Site Descriptions",
      templates.render("site-description.html", {
        sites: buildSiteData(sites, trials, prose, fhirCrossRef),
      }),
    ),
  );

  files.set(
    "patient-stories.html",
    pageWrap(
      "Patient Stories",
      templates.render("patient-story.html", {
        stories: buildPatientStoryData(conditions, content, prose, domain),
      }),
    ),
  );

  files.set(
    "trial-cards.html",
    pageWrap(
      "Trials",
      templates.render("trial-card.html", {
        trials: buildTrialCardData(trials, conditions, sites, fhirCrossRef),
      }),
    ),
  );
}
