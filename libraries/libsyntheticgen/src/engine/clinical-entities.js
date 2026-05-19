import { MANAGER_NAMES, toEmail } from "./names.js";

/**
 * Build clinical entities from the ClinicalBlock AST node.
 * @param {object} clinicalAst - Parsed clinical block
 * @param {object[]} people - Generated people entities
 * @param {object[]} orgs - Generated org entities
 * @param {object[]} projects - Generated project entities
 * @param {string} domain - Domain for IRI generation
 * @param {import('./rng.js').SeededRNG} rng - Seeded RNG
 * @returns {{ conditions: object[], sites: object[], trials: object[], criteria: object[], researchers: object[] }}
 */
export function buildClinicalEntities(
  clinicalAst,
  people,
  orgs,
  projects,
  domain,
  rng,
) {
  const orgMap = new Map(orgs.map((o) => [o.id, o]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const personByManagerAlias = buildManagerLookup(people);

  const conditionMap = new Map();
  const conditions = clinicalAst.conditions.map((c) => {
    const entity = {
      id: c.id,
      name: c.name,
      icd10: c.icd10,
      synonyms: c.synonyms,
      synthea_module: c.synthea_module,
      severity: c.severity,
      prose_topic: c.prose_topic || null,
      prose_tone: c.prose_tone || null,
      trials: [],
      iri: `https://${domain}/id/clinical/condition/${c.id}`,
    };
    conditionMap.set(c.id, entity);
    return entity;
  });

  const siteMap = new Map();
  const sites = clinicalAst.sites.map((s) => {
    const org = orgMap.get(s.org_ref) || null;
    const entity = {
      id: s.id,
      name: s.name,
      address: s.address,
      city: s.city,
      state: s.state,
      country: s.country,
      org_ref: s.org_ref,
      org: org ? { id: org.id, name: org.name, iri: org.iri } : null,
      capacity: s.capacity,
      specialties: s.specialties,
      trials: [],
      iri: `https://${domain}/id/clinical/site/${s.id}`,
    };
    siteMap.set(s.id, entity);
    return entity;
  });

  const researcherMap = new Map();
  const criteria = [];

  const trials = clinicalAst.trials.map((t) => {
    const piRef = t.principal_investigator;
    const piPerson = resolvePerson(piRef, personByManagerAlias, t.id);

    if (!researcherMap.has(piPerson.id)) {
      researcherMap.set(piPerson.id, {
        id: piPerson.id,
        person_ref: piRef,
        name: piPerson.name,
        email: piPerson.email,
        role: "principal_investigator",
        trial_ids: [],
        specialty: piPerson.discipline || null,
        iri: `https://${domain}/id/clinical/researcher/${piPerson.id}`,
      });
    }
    researcherMap.get(piPerson.id).trial_ids.push(t.id);

    const project = t.project_ref ? projectMap.get(t.project_ref) || null : null;

    if (t.criteria) {
      criteria.push({
        trial_id: t.id,
        inclusion: t.criteria.inclusion || null,
        exclusion: t.criteria.exclusion || null,
        iri: `https://${domain}/id/clinical/criterion/${t.id}`,
      });
    }

    return {
      id: t.id,
      name: t.name,
      protocol_id: t.protocol_id,
      phase: t.phase,
      therapeutic_area: t.therapeutic_area,
      conditions: t.conditions || [],
      sites: t.sites || [],
      principal_investigator: {
        ref: piRef,
        person: piPerson,
      },
      project_ref: t.project_ref || null,
      project: project ? { id: project.id, name: project.name, iri: project.iri } : null,
      sponsor: t.sponsor,
      status: t.status,
      target_enrollment: t.target_enrollment,
      current_enrollment: t.current_enrollment,
      start_date: t.start_date,
      estimated_end_date: t.estimated_end_date,
      arms: t.arms || [],
      prose_topic: t.prose_topic || null,
      prose_tone: t.prose_tone || null,
      criteria: t.criteria || null,
      iri: `https://${domain}/id/clinical/trial/${t.id}`,
    };
  });

  for (const trial of trials) {
    for (const condId of trial.conditions) {
      const cond = conditionMap.get(condId);
      if (!cond) {
        throw new Error(
          `Trial '${trial.id}' references unknown condition '${condId}'`,
        );
      }
      cond.trials.push(trial.id);
    }
    for (const siteId of trial.sites) {
      const site = siteMap.get(siteId);
      if (!site) {
        throw new Error(
          `Trial '${trial.id}' references unknown site '${siteId}'`,
        );
      }
      site.trials.push(trial.id);
    }
  }

  const researchers = Array.from(researcherMap.values());

  return { conditions, sites, trials, criteria, researchers };
}

function buildManagerLookup(people) {
  const lookup = new Map();
  for (const [alias, name] of Object.entries(MANAGER_NAMES)) {
    const person = people.find(
      (p) => p.name === name || p.name.toLowerCase() === alias,
    );
    if (person) lookup.set(alias, person);
  }
  for (const person of people) {
    const alias = person.name.toLowerCase();
    if (!lookup.has(alias)) lookup.set(alias, person);
  }
  return lookup;
}

function resolvePerson(ref, personByManagerAlias, trialId) {
  const alias = ref.startsWith("@") ? ref.slice(1) : ref;
  const person = personByManagerAlias.get(alias.toLowerCase());
  if (!person) {
    throw new Error(
      `Trial '${trialId}' references unknown principal investigator '@${alias}'`,
    );
  }
  return person;
}
