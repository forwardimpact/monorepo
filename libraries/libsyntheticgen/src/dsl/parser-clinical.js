/**
 * DSL Parser — clinical domain block parser.
 *
 * Parses `clinical { condition {}, site {}, trial {}, content {} }`
 * into ClinicalBlock AST nodes.
 *
 * @module libterrain/dsl/parser-clinical
 */

import { createDispatchHelpers } from "./parser-helpers.js";

/**
 * Create clinical block parsers bound to shared token helpers.
 * @param {object} helpers
 * @returns {{ parseClinical: () => object }}
 */
export function createClinicalParsers(helpers) {
  const {
    peek,
    advance,
    expect,
    parseStringOrIdent,
    parseStringValue,
    parseNumberValue,
    parseDateValue,
    parseArray,
  } = helpers;

  const { consumeFields } = createDispatchHelpers(helpers);

  function parseClinicalCondition() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const cond = { id };
    consumeFields(
      {
        name: () => {
          cond.name = parseStringValue();
        },
        icd10: () => {
          cond.icd10 = parseArray();
        },
        synonyms: () => {
          cond.synonyms = parseArray();
        },
        synthea_module: () => {
          cond.synthea_module = parseStringOrIdent();
        },
        severity: () => {
          cond.severity = parseStringOrIdent();
        },
        prose_topic: () => {
          cond.prose_topic = parseStringValue();
        },
        prose_tone: () => {
          cond.prose_tone = parseStringValue();
        },
      },
      "condition",
    );
    expect("RBRACE");
    return cond;
  }

  function parseClinicalSite() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const site = { id };
    consumeFields(
      {
        name: () => {
          site.name = parseStringValue();
        },
        address: () => {
          site.address = parseStringValue();
        },
        city: () => {
          site.city = parseStringValue();
        },
        state: () => {
          site.state = parseStringValue();
        },
        country: () => {
          site.country = parseStringValue();
        },
        org: () => {
          site.org_ref = parseStringOrIdent();
        },
        capacity: () => {
          site.capacity = parseNumberValue();
        },
        specialties: () => {
          site.specialties = parseArray();
        },
      },
      "site",
    );
    expect("RBRACE");
    return site;
  }

  function parseInclusion() {
    expect("LBRACE");
    const inc = {};
    consumeFields(
      {
        age_min: () => {
          inc.age_min = parseNumberValue();
        },
        age_max: () => {
          inc.age_max = parseNumberValue();
        },
        conditions_required: () => {
          inc.conditions_required = parseArray();
        },
        prior_treatments_allowed: () => {
          inc.prior_treatments_allowed = parseArray();
        },
        ecog_max: () => {
          inc.ecog_max = parseNumberValue();
        },
        custom: () => {
          inc.custom = parseArray();
        },
      },
      "inclusion",
    );
    expect("RBRACE");
    return inc;
  }

  function parseExclusion() {
    expect("LBRACE");
    const exc = {};
    consumeFields(
      {
        conditions_excluded: () => {
          exc.conditions_excluded = parseArray();
        },
        active_autoimmune: () => {
          exc.active_autoimmune = parseStringOrIdent() === "true";
        },
        prior_immunotherapy: () => {
          exc.prior_immunotherapy = parseStringOrIdent() === "true";
        },
        custom: () => {
          exc.custom = parseArray();
        },
      },
      "exclusion",
    );
    expect("RBRACE");
    return exc;
  }

  function parseCriteria() {
    expect("LBRACE");
    const criteria = { inclusion: null, exclusion: null };
    consumeFields(
      {
        inclusion: () => {
          criteria.inclusion = parseInclusion();
        },
        exclusion: () => {
          criteria.exclusion = parseExclusion();
        },
      },
      "criteria",
    );
    expect("RBRACE");
    return criteria;
  }

  function parseClinicalTrial() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const trial = { id };
    consumeFields(
      {
        name: () => {
          trial.name = parseStringValue();
        },
        protocol_id: () => {
          trial.protocol_id = parseStringValue();
        },
        project: () => {
          trial.project_ref = parseStringOrIdent();
        },
        phase: () => {
          trial.phase = parseStringValue();
        },
        therapeutic_area: () => {
          trial.therapeutic_area = parseStringValue();
        },
        conditions: () => {
          trial.conditions = parseArray();
        },
        sites: () => {
          trial.sites = parseArray();
        },
        principal_investigator: () => {
          trial.principal_investigator = advance().value;
        },
        sponsor: () => {
          trial.sponsor = parseStringValue();
        },
        status: () => {
          trial.status = parseStringValue();
        },
        target_enrollment: () => {
          trial.target_enrollment = parseNumberValue();
        },
        current_enrollment: () => {
          trial.current_enrollment = parseNumberValue();
        },
        start_date: () => {
          trial.start_date = parseDateValue();
        },
        estimated_end_date: () => {
          trial.estimated_end_date = parseDateValue();
        },
        arms: () => {
          trial.arms = parseArray();
        },
        prose_topic: () => {
          trial.prose_topic = parseStringValue();
        },
        prose_tone: () => {
          trial.prose_tone = parseStringValue();
        },
        criteria: () => {
          trial.criteria = parseCriteria();
        },
      },
      "trial",
    );
    expect("RBRACE");
    return trial;
  }

  function parseCardinalityOrNumber() {
    const t = peek();
    if (t.type === "KEYWORD" && t.value.startsWith("per_")) {
      return advance().value;
    }
    return parseNumberValue();
  }

  function parseClinicalContent() {
    expect("LBRACE");
    const content = {};
    consumeFields(
      {
        condition_explainers: () => {
          content.condition_explainers = parseCardinalityOrNumber();
        },
        therapy_descriptions: () => {
          content.therapy_descriptions = parseNumberValue();
        },
        therapy_topics: () => {
          content.therapy_topics = parseArray();
        },
        trial_faqs: () => {
          content.trial_faqs = parseCardinalityOrNumber();
        },
        consent_summaries: () => {
          content.consent_summaries = parseCardinalityOrNumber();
        },
        site_descriptions: () => {
          content.site_descriptions = parseCardinalityOrNumber();
        },
        patient_stories: () => {
          content.patient_stories = parseNumberValue();
        },
        patient_story_conditions: () => {
          content.patient_story_conditions = parseArray();
        },
      },
      "content",
    );
    expect("RBRACE");
    return content;
  }

  function parseClinical() {
    expect("LBRACE");
    const block = {
      conditions: [],
      sites: [],
      trials: [],
      content: null,
    };
    consumeFields(
      {
        condition: () => {
          block.conditions.push(parseClinicalCondition());
        },
        site: () => {
          block.sites.push(parseClinicalSite());
        },
        trial: () => {
          block.trials.push(parseClinicalTrial());
        },
        content: () => {
          block.content = parseClinicalContent();
        },
      },
      "clinical",
    );
    expect("RBRACE");
    return block;
  }

  return { parseClinical };
}
