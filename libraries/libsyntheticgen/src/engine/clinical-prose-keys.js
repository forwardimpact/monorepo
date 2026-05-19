/**
 * Clinical Prose Keys — yields [key, context] tuples for clinical entities.
 *
 * Each yielded context includes a pre-built `messages` array so that
 * `resolveProse()` calls `generateStructured()` instead of `generatePlain()`.
 * Templates are rendered at key-generation time; the structured cache key
 * includes a hash of the rendered prompt, auto-invalidating on entity change.
 */

/**
 * Flatten a clinical context object for Mustache rendering.
 * Mustache cannot traverse dotted paths or use {{#each}}, so nested objects
 * become `clinical_trial`, `clinical_condition`, etc. and arrays become
 * joined strings.
 */
function flattenForTemplate(context) {
  const flat = {
    topic: context.topic,
    tone: context.tone,
    length: context.length,
    orgName: context.orgName,
    domain: context.domain,
    conditions_in_scope_joined: context.conditions_in_scope?.join(", ") || "",
    trials_in_scope_joined: context.trials_in_scope?.join(", ") || "",
    sites_in_scope_joined: context.sites_in_scope?.join(", ") || "",
  };

  const c = context.clinical || {};

  if (c.condition) {
    flat.clinical_condition = {
      ...c.condition,
      icd10_joined: c.condition.icd10?.join(", ") || "",
      synonyms_joined: c.condition.synonyms?.join(", ") || "",
      related_trials_joined: c.condition.related_trials?.join(", ") || "",
    };
  }

  if (c.trial) {
    flat.clinical_trial = {
      ...c.trial,
      arms_joined: c.trial.arms?.join(", ") || "",
    };
  }

  if (c.criteria) {
    flat.clinical_criteria = {
      inclusion_summary: summarizeInclusion(c.criteria),
      exclusion_summary: summarizeExclusion(c.criteria),
    };
  }

  if (c.site) {
    flat.clinical_site = {
      ...c.site,
      specialties_joined: c.site.specialties?.join(", ") || "",
      active_trials_joined: c.site.active_trials?.join(", ") || "",
    };
  }

  return flat;
}

function summarizeInclusion(criteria) {
  const inc = criteria.inclusion || {};
  const parts = [];
  if (inc.age_min != null || inc.age_max != null) {
    parts.push(`Age ${inc.age_min || "?"}–${inc.age_max || "?"}`);
  }
  if (inc.conditions_required?.length) {
    parts.push(`Requires: ${inc.conditions_required.join(", ")}`);
  }
  if (inc.ecog_max != null) {
    parts.push(`ECOG ≤ ${inc.ecog_max}`);
  }
  if (inc.custom?.length) {
    parts.push(...inc.custom);
  }
  return parts.join("; ") || "See full criteria";
}

function summarizeExclusion(criteria) {
  const exc = criteria.exclusion || {};
  const parts = [];
  if (exc.conditions_excluded?.length) {
    parts.push(`Excludes: ${exc.conditions_excluded.join(", ")}`);
  }
  if (exc.active_autoimmune) {
    parts.push("No active autoimmune disease");
  }
  if (exc.prior_immunotherapy) {
    parts.push("No prior immunotherapy");
  }
  if (exc.custom?.length) {
    parts.push(...exc.custom);
  }
  return parts.join("; ") || "See full criteria";
}

function buildTrialContext(trial) {
  return {
    name: trial.name,
    phase: trial.phase,
    therapeutic_area: trial.therapeutic_area,
    status: trial.status,
    arms: trial.arms || [],
    sponsor: trial.sponsor,
    target_enrollment: trial.target_enrollment,
    current_enrollment: trial.current_enrollment,
  };
}

function buildCriteriaContext(criteria) {
  return {
    inclusion: criteria.inclusion || {},
    exclusion: criteria.exclusion || {},
  };
}

function buildMessages(promptLoader, templateName, context) {
  const systemPrompt = promptLoader.load("clinical-system");
  const flat = flattenForTemplate(context);
  const userPrompt = promptLoader.render(templateName, flat);
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}

/**
 * Yield [key, context] tuples for all clinical prose keys.
 *
 * @param {object} clinical - Clinical entity graph from buildClinicalEntities()
 * @param {string} domain
 * @param {string} orgName
 * @param {import('@forwardimpact/libprompt').PromptLoader} promptLoader
 * @yields {[string, object]} [proseKey, proseContext]
 */
export function* clinicalProseKeys(clinical, domain, orgName, promptLoader) {
  const base = {
    domain,
    orgName,
    conditions_in_scope: clinical.conditions.map((c) => c.name),
    trials_in_scope: clinical.trials.map((t) => t.name),
    sites_in_scope: clinical.sites.map((s) => s.name),
  };

  yield* conditionExplainerKeys(clinical, base, promptLoader);
  yield* trialFaqKeys(clinical, base, promptLoader);
  yield* consentSummaryKeys(clinical, base, promptLoader);
  yield* siteDescriptionKeys(clinical, base, promptLoader);
  yield* patientStoryKeys(clinical, base, promptLoader);
  yield* therapyDescriptionKeys(clinical, base, promptLoader);
}

function* conditionExplainerKeys(clinical, base, promptLoader) {
  for (const cond of clinical.conditions) {
    const context = {
      topic: cond.prose_topic || `${cond.name} in plain language for patients`,
      tone: cond.prose_tone || "empathetic, accessible",
      length: "400-600 words",
      ...base,
      clinical: {
        condition: {
          name: cond.name,
          icd10: cond.icd10,
          synonyms: cond.synonyms,
          severity: cond.severity,
          related_trials: cond.trials
            .map((tid) => clinical.trials.find((t) => t.id === tid)?.name)
            .filter(Boolean),
        },
      },
    };
    context.messages = buildMessages(
      promptLoader,
      "condition-explainer",
      context,
    );
    yield [`clinical_condition_explainer_${cond.id}`, context];
  }
}

function* trialFaqKeys(clinical, base, promptLoader) {
  for (const trial of clinical.trials) {
    const criteria = clinical.criteria.find((c) => c.trial_id === trial.id);
    const context = {
      topic: `FAQ for ${trial.name}`,
      tone: "concrete, reassuring",
      length: "8-12 questions",
      ...base,
      clinical: {
        trial: buildTrialContext(trial),
        criteria: criteria ? buildCriteriaContext(criteria) : undefined,
      },
    };
    context.messages = buildMessages(promptLoader, "trial-faq", context);
    yield [`clinical_trial_faq_${trial.id}`, context];
  }
}

function* consentSummaryKeys(clinical, base, promptLoader) {
  for (const trial of clinical.trials) {
    const criteria = clinical.criteria.find((c) => c.trial_id === trial.id);
    const context = {
      topic: `Consent summary for ${trial.name}`,
      tone: "formal but readable",
      length: "500-800 words",
      ...base,
      clinical: {
        trial: buildTrialContext(trial),
        criteria: criteria ? buildCriteriaContext(criteria) : undefined,
      },
    };
    context.messages = buildMessages(promptLoader, "consent-summary", context);
    yield [`clinical_consent_summary_${trial.id}`, context];
  }
}

function* siteDescriptionKeys(clinical, base, promptLoader) {
  for (const site of clinical.sites) {
    const activeTrials = clinical.trials
      .filter((t) => t.sites.includes(site.id) && t.status === "recruiting")
      .map((t) => t.name);
    const context = {
      topic: `${site.name} site information`,
      tone: "practical, welcoming",
      length: "200-300 words",
      ...base,
      clinical: {
        site: {
          name: site.name,
          city: site.city,
          state: site.state,
          specialties: site.specialties,
          active_trials: activeTrials,
        },
      },
    };
    context.messages = buildMessages(promptLoader, "site-description", context);
    yield [`clinical_site_description_${site.id}`, context];
  }
}

function* patientStoryKeys(clinical, base, promptLoader) {
  if (!clinical.content) return;
  const storyConditions = clinical.content.patient_story_conditions || [];
  const totalStories = clinical.content.patient_stories || 0;
  const perCondition = Math.ceil(
    totalStories / Math.max(storyConditions.length, 1),
  );
  for (const condId of storyConditions) {
    const cond = clinical.conditions.find((c) => c.id === condId);
    if (!cond) continue;
    for (let i = 0; i < perCondition; i++) {
      const context = {
        topic: `Patient story: living with ${cond.name}`,
        tone: "first-person, empathetic",
        length: "300-400 words",
        ...base,
        clinical: {
          condition: {
            name: cond.name,
            icd10: cond.icd10,
            synonyms: cond.synonyms,
            severity: cond.severity,
          },
        },
      };
      context.messages = buildMessages(promptLoader, "patient-story", context);
      yield [`clinical_patient_story_${condId}_${i}`, context];
    }
  }
}

function* therapyDescriptionKeys(clinical, base, promptLoader) {
  if (!clinical.content) return;
  for (const topic of clinical.content.therapy_topics || []) {
    const context = {
      topic: `${topic.replace(/_/g, " ")} treatment overview`,
      tone: "balanced, factual, accessible",
      length: "300-500 words",
      ...base,
      clinical: {},
    };
    context.messages = buildMessages(
      promptLoader,
      "therapy-description",
      context,
    );
    yield [`clinical_therapy_description_${topic}`, context];
  }
}
