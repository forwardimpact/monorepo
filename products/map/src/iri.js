/**
 * Shared IRI helpers and constants for the fit: vocabulary.
 *
 * Both the Map base-entity export pipeline and the Pathway derivation
 * service consume this module so that the IRIs they emit are byte-identical.
 * Any drift between the two would cause graph queries to silently miss
 * subjects, so this is the single source of truth.
 */

export const VOCAB_BASE = "https://www.forwardimpact.team/schema/rdf/";

// Base entity IRI helpers — used by the Map export view-builders.
export const skillIri = (id) => `${VOCAB_BASE}skill/${id}`;
export const capabilityIri = (id) => `${VOCAB_BASE}capability/${id}`;
export const levelIri = (id) => `${VOCAB_BASE}level/${id}`;
export const behaviourIri = (id) => `${VOCAB_BASE}behaviour/${id}`;
export const disciplineIri = (id) => `${VOCAB_BASE}discipline/${id}`;
export const trackIri = (id) => `${VOCAB_BASE}track/${id}`;
export const stageIri = (id) => `${VOCAB_BASE}stage/${id}`;
export const driverIri = (id) => `${VOCAB_BASE}driver/${id}`;
export const toolIri = (id) => `${VOCAB_BASE}tool/${id}`;

// Derived entity IRI helpers — used by the Pathway service's serialize.js.
//
// Map export templates must NEVER emit Job/AgentProfile/Progression types —
// they are derived-only and have no place in the indexed graph. The Pathway
// service serializer is the only emitter.
export const jobIri = (discipline, level, track) =>
  track
    ? `${VOCAB_BASE}job/${discipline}/${level}/${track}`
    : `${VOCAB_BASE}job/${discipline}/${level}`;

export const agentProfileIri = (discipline, track, stage) =>
  stage
    ? `${VOCAB_BASE}agent-profile/${discipline}/${track}/${stage}`
    : `${VOCAB_BASE}agent-profile/${discipline}/${track}`;

export const progressionIri = (discipline, from, to, track) =>
  track
    ? `${VOCAB_BASE}progression/${discipline}/${from}-${to}/${track}`
    : `${VOCAB_BASE}progression/${discipline}/${from}-${to}`;

/**
 * Canonical list of derived-entity rdf:type values that ONLY the pathway
 * service may emit. The Map export renderer test imports this list and
 * asserts that no template emits any of these as a main itemtype —
 * guaranteeing the resource processor never materializes derived entities
 * into the graph.
 *
 * Adding a new derived class? Add it here. Both the Map export negative
 * assertion and any Pathway service serializer code that wants to enumerate
 * "what we emit" will pick it up automatically. This eliminates the textual
 * coupling between the two systems.
 *
 * Note: `SkillModifier` is intentionally NOT in this list. Skill modifiers
 * are part of the base Track definition (they live in the YAML, not in any
 * derived view), so the Map export renders them as nested typed items under
 * `track.html`. SkillProficiency, SkillChange and BehaviourChange remain
 * derived: they only exist as part of Job/AgentProfile/Progression outputs.
 */
export const DERIVED_ENTITY_TYPES = [
  `${VOCAB_BASE}Job`,
  `${VOCAB_BASE}AgentProfile`,
  `${VOCAB_BASE}Progression`,
  `${VOCAB_BASE}SkillProficiency`,
  `${VOCAB_BASE}SkillChange`,
  `${VOCAB_BASE}BehaviourChange`,
];
