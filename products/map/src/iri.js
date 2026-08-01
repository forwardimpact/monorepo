/**
 * Shared IRI helpers and constants for the fit: vocabulary.
 *
 * Both the Map pipeline for base-entity export and the Pathway derivation
 * service consume this module. The IRIs they emit are then byte-identical.
 * Any drift between the two would make graph queries miss subjects
 * silently. So this module is the single source of truth.
 */

export const VOCAB_BASE = "https://www.forwardimpact.team/schema/rdf/";

// IRI helpers for base entities. The Map export view-builders use them.
export const skillIri = (id) => `${VOCAB_BASE}skill/${id}`;
export const capabilityIri = (id) => `${VOCAB_BASE}capability/${id}`;
export const levelIri = (id) => `${VOCAB_BASE}level/${id}`;
export const behaviourIri = (id) => `${VOCAB_BASE}behaviour/${id}`;
export const disciplineIri = (id) => `${VOCAB_BASE}discipline/${id}`;
export const trackIri = (id) => `${VOCAB_BASE}track/${id}`;
export const driverIri = (id) => `${VOCAB_BASE}driver/${id}`;
export const toolIri = (id) => `${VOCAB_BASE}tool/${id}`;

// IRI helpers for derived entities. The Pathway service's serialize.js
// uses them.
//
// Map export templates must NEVER emit Job/AgentProfile/Progression types.
// They are derived-only and have no place in the indexed graph. The
// Pathway service serializer is the only emitter.
export const jobIri = (discipline, level, track) =>
  track
    ? `${VOCAB_BASE}job/${discipline}/${level}/${track}`
    : `${VOCAB_BASE}job/${discipline}/${level}`;

export const agentProfileIri = (discipline, track) =>
  `${VOCAB_BASE}agent-profile/${discipline}/${track}`;

export const progressionIri = (discipline, from, to, track) =>
  track
    ? `${VOCAB_BASE}progression/${discipline}/${from}-${to}/${track}`
    : `${VOCAB_BASE}progression/${discipline}/${from}-${to}`;

/**
 * Canonical list of derived-entity rdf:type values that ONLY the pathway
 * service may emit. The test for the Map export renderer imports this
 * list. It asserts that no template emits any of these as a main
 * itemtype. That guarantees the resource processor never materializes
 * derived entities into the graph.
 *
 * Add any new derived class here. The negative assertion in the Map
 * export picks it up automatically. So does any Pathway service
 * serializer code that enumerates "what we emit". This eliminates the
 * textual coupling between the two systems.
 *
 * Note: `SkillModifier` is intentionally NOT in this list. Skill
 * modifiers are part of the base Track definition. They live in the YAML.
 * They do not live in any derived view. So the Map export renders them as
 * nested typed items under `track.html`. SkillProficiency, SkillChange
 * and BehaviourChange remain derived. They only exist as part of
 * Job/AgentProfile/Progression outputs.
 */
export const DERIVED_ENTITY_TYPES = [
  `${VOCAB_BASE}Job`,
  `${VOCAB_BASE}AgentProfile`,
  `${VOCAB_BASE}Progression`,
  `${VOCAB_BASE}SkillProficiency`,
  `${VOCAB_BASE}SkillChange`,
  `${VOCAB_BASE}BehaviourChange`,
];
