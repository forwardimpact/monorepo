/**
 * Pure Turtle RDF serializers for pathway derivation results.
 *
 * Each function takes a libskill output object, or an array of them. Each
 * function returns a Turtle string in the `fit:` vocabulary. The shared
 * helpers in @forwardimpact/map/iri construct the IRIs. So the IRIs cannot
 * drift from the ones Map's HTML export pipeline emits.
 *
 * The serializers do not import any libskill code. They project the libskill
 * outputs into RDF mechanically, predicate by predicate. They hold no
 * derivation logic of their own.
 */

import pkg from "n3";
const { Writer, DataFactory } = pkg;
const { namedNode, literal, blankNode, quad } = DataFactory;

import {
  VOCAB_BASE,
  jobIri,
  agentProfileIri,
  progressionIri,
  skillIri,
  behaviourIri,
  disciplineIri,
  trackIri,
  levelIri,
  toolIri,
} from "@forwardimpact/map/iri";

const FIT = VOCAB_BASE;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";

const TYPE_JOB = `${FIT}Job`;
const TYPE_AGENT_PROFILE = `${FIT}AgentProfile`;
const TYPE_PROGRESSION = `${FIT}Progression`;
const TYPE_SKILL_PROFICIENCY = `${FIT}SkillProficiency`;
const TYPE_SKILL_CHANGE = `${FIT}SkillChange`;
const TYPE_BEHAVIOUR_CHANGE = `${FIT}BehaviourChange`;

const PREFIXES = {
  fit: FIT,
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
};

/**
 * Materialize an array of quads into a Turtle string.
 * @param {Array} quads
 * @returns {Promise<string>}
 */
function writeTurtle(quads) {
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: "Turtle", prefixes: PREFIXES });
    writer.addQuads(quads);
    writer.end((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function fit(local) {
  return namedNode(`${FIT}${local}`);
}

function typeQuad(subject, typeIri) {
  return quad(subject, namedNode(RDF_TYPE), namedNode(typeIri));
}

function labelQuad(subject, label) {
  return quad(subject, namedNode(RDFS_LABEL), literal(String(label)));
}

/**
 * Push the common (discipline, level, track) triples for a job onto a quads array.
 */
function pushJobCoreTriples(quads, jobNode, discipline, level, track) {
  quads.push(typeQuad(jobNode, TYPE_JOB));
  quads.push(
    quad(jobNode, fit("discipline"), namedNode(disciplineIri(discipline.id))),
  );
  quads.push(quad(jobNode, fit("level"), namedNode(levelIri(level.id))));
  if (track) {
    quads.push(quad(jobNode, fit("track"), namedNode(trackIri(track.id))));
  }
}

/**
 * Serialize a single job (full detail with skill matrix and behaviour profile).
 * @param {object} job - libskill JobDefinition
 * @returns {Promise<string>}
 */
export async function jobToTurtle(job) {
  return writeTurtle(jobQuads(job));
}

function pushSkillMatrixEntry(quads, jobNode, entry) {
  const sp = blankNode();
  quads.push(quad(jobNode, fit("skillMatrix"), sp));
  quads.push(typeQuad(sp, TYPE_SKILL_PROFICIENCY));
  quads.push(quad(sp, fit("skill"), namedNode(skillIri(entry.skillId))));
  if (entry.proficiency != null) {
    quads.push(
      quad(sp, fit("proficiency"), literal(String(entry.proficiency))),
    );
  }
}

function pushBehaviourProfileEntry(quads, jobNode, entry) {
  const bp = blankNode();
  quads.push(quad(jobNode, fit("behaviourProfile"), bp));
  quads.push(
    quad(bp, fit("behaviour"), namedNode(behaviourIri(entry.behaviourId))),
  );
  if (entry.maturity != null) {
    quads.push(quad(bp, fit("maturity"), literal(String(entry.maturity))));
  }
}

function responsibilityText(responsibility) {
  if (typeof responsibility === "string") return responsibility;
  return responsibility?.text ?? responsibility?.description ?? null;
}

function jobQuads(job) {
  const { discipline, level, track } = job;
  const jobNode = namedNode(jobIri(discipline.id, level.id, track?.id));
  const quads = [];
  pushJobCoreTriples(quads, jobNode, discipline, level, track);
  if (job.title) quads.push(labelQuad(jobNode, job.title));

  for (const entry of job.skillMatrix || []) {
    pushSkillMatrixEntry(quads, jobNode, entry);
  }
  for (const entry of job.behaviourProfile || []) {
    pushBehaviourProfileEntry(quads, jobNode, entry);
  }
  for (const responsibility of job.derivedResponsibilities || []) {
    const text = responsibilityText(responsibility);
    if (text) {
      quads.push(quad(jobNode, fit("responsibilities"), literal(String(text))));
    }
  }

  return quads;
}

/**
 * Serialize a list of jobs (summary form, no skill matrix detail).
 * @param {Array} jobs
 * @returns {Promise<string>}
 */
export async function jobListToTurtle(jobs) {
  const quads = [];
  for (const job of jobs) {
    const { discipline, level, track } = job;
    const jobNode = namedNode(jobIri(discipline.id, level.id, track?.id));
    pushJobCoreTriples(quads, jobNode, discipline, level, track);
    if (job.title) quads.push(labelQuad(jobNode, job.title));
  }
  return writeTurtle(quads);
}

/**
 * Serialize a single agent profile produced by generateAgentProfile.
 * @param {object} params
 * @param {object} params.discipline
 * @param {object} params.track
 * @param {object} params.profile - { frontmatter, bodyData, filename }
 * @returns {Promise<string>}
 */
export async function agentProfileToTurtle({ discipline, track, profile }) {
  return writeTurtle(agentProfileQuads({ discipline, track, profile }));
}

function pushAgentSkills(quads, node, derivedSkills) {
  for (const skill of derivedSkills || []) {
    const skillId = skill?.skillId || skill?.id;
    if (skillId) {
      quads.push(quad(node, fit("agentSkill"), namedNode(skillIri(skillId))));
    }
  }
}

function pushAgentBehaviours(quads, node, derivedBehaviours) {
  for (const b of derivedBehaviours || []) {
    const behaviourId = b?.behaviourId || b?.id;
    if (behaviourId) {
      quads.push(
        quad(node, fit("agentBehaviour"), namedNode(behaviourIri(behaviourId))),
      );
    }
  }
}

function agentProfileQuads({ discipline, track, profile }) {
  const node = namedNode(agentProfileIri(discipline.id, track.id));
  const quads = [];
  quads.push(typeQuad(node, TYPE_AGENT_PROFILE));
  quads.push(
    quad(node, fit("discipline"), namedNode(disciplineIri(discipline.id))),
  );
  quads.push(quad(node, fit("track"), namedNode(trackIri(track.id))));

  const bodyData = profile?.bodyData || {};
  pushAgentSkills(quads, node, bodyData.derivedSkills);
  pushAgentBehaviours(quads, node, bodyData.derivedBehaviours);

  if (profile?.frontmatter) {
    quads.push(
      quad(
        node,
        fit("frontmatter"),
        literal(JSON.stringify(profile.frontmatter)),
      ),
    );
  }

  return quads;
}

/**
 * Serialize a list of agent profiles.
 *
 * @param {Array<{discipline, track, profile}>} entries
 * @returns {Promise<string>}
 */
export async function agentProfileListToTurtle(entries) {
  const quads = [];
  for (const entry of entries) {
    quads.push(...agentProfileQuads(entry));
  }
  return writeTurtle(quads);
}

/**
 * Map a libskill skillChange entry to a `changeKind` literal.
 */
function skillChangeKind(entry) {
  if (entry.isGained) return "gained";
  if (entry.isLost) return "lost";
  if (entry.change > 0) return "increased";
  if (entry.change < 0) return "decreased";
  return "unchanged";
}

function behaviourChangeKind(entry) {
  if (entry.change > 0) return "increased";
  if (entry.change < 0) return "decreased";
  return "unchanged";
}

function pushChangeMagnitude(quads, node, change) {
  if (typeof change === "number") {
    quads.push(
      quad(
        node,
        fit("change"),
        literal(String(change), namedNode(XSD_INTEGER)),
      ),
    );
  }
}

function pushSkillChangeEntry(quads, progNode, entry) {
  // libskill's calculateSkillChanges emits { id, currentLevel, targetLevel,
  // change, isGained, isLost }. See libraries/libskill/progression.js.
  const sc = blankNode();
  quads.push(quad(progNode, fit("skillChange"), sc));
  quads.push(typeQuad(sc, TYPE_SKILL_CHANGE));
  quads.push(quad(sc, fit("skill"), namedNode(skillIri(entry.id))));
  if (entry.currentLevel != null) {
    quads.push(
      quad(sc, fit("fromProficiency"), literal(String(entry.currentLevel))),
    );
  }
  if (entry.targetLevel != null) {
    quads.push(
      quad(sc, fit("toProficiency"), literal(String(entry.targetLevel))),
    );
  }
  pushChangeMagnitude(quads, sc, entry.change);
  quads.push(quad(sc, fit("changeKind"), literal(skillChangeKind(entry))));
}

function pushBehaviourChangeEntry(quads, progNode, entry) {
  // libskill's calculateBehaviourChanges emits { id, currentLevel, targetLevel,
  // change }. See libraries/libskill/progression.js.
  const bc = blankNode();
  quads.push(quad(progNode, fit("behaviourChange"), bc));
  quads.push(typeQuad(bc, TYPE_BEHAVIOUR_CHANGE));
  quads.push(quad(bc, fit("behaviour"), namedNode(behaviourIri(entry.id))));
  if (entry.currentLevel != null) {
    quads.push(
      quad(bc, fit("fromMaturity"), literal(String(entry.currentLevel))),
    );
  }
  if (entry.targetLevel != null) {
    quads.push(quad(bc, fit("toMaturity"), literal(String(entry.targetLevel))));
  }
  pushChangeMagnitude(quads, bc, entry.change);
  quads.push(quad(bc, fit("changeKind"), literal(behaviourChangeKind(entry))));
}

/**
 * Serialize a progression analysis from analyzeProgression.
 * @param {object} progression
 * @returns {Promise<string>}
 */
export async function progressionToTurtle(progression) {
  const {
    current,
    target,
    skillChanges = [],
    behaviourChanges = [],
  } = progression;

  const fromDisc = current.discipline;
  const fromLevel = current.level;
  const fromTrack = current.track;
  const toDisc = target.discipline;
  const toLevel = target.level;
  const toTrack = target.track;

  // Use the source discipline/track for the progression IRI when the sides
  // match. If they do not match, fall back to the source side. This matches
  // the canonical "what does my progression look like for this role" intent.
  const progNode = namedNode(
    progressionIri(
      fromDisc.id,
      fromLevel.id,
      toLevel.id,
      fromTrack?.id || toTrack?.id || undefined,
    ),
  );

  const fromJobNode = namedNode(
    jobIri(fromDisc.id, fromLevel.id, fromTrack?.id),
  );
  const toJobNode = namedNode(jobIri(toDisc.id, toLevel.id, toTrack?.id));

  const quads = [];
  quads.push(typeQuad(progNode, TYPE_PROGRESSION));
  quads.push(quad(progNode, fit("fromJob"), fromJobNode));
  quads.push(quad(progNode, fit("toJob"), toJobNode));

  for (const entry of skillChanges) {
    pushSkillChangeEntry(quads, progNode, entry);
  }
  for (const entry of behaviourChanges) {
    pushBehaviourChangeEntry(quads, progNode, entry);
  }

  return writeTurtle(quads);
}

/**
 * Serialize the software toolkit derived for a specific job.
 * @param {object} job - libskill JobDefinition
 * @param {Array<{name: string, description?: string}>} toolkit - deriveToolkit output
 * @returns {Promise<string>}
 */
export async function jobSoftwareToTurtle(job, toolkit) {
  const { discipline, level, track } = job;
  const jobNode = namedNode(jobIri(discipline.id, level.id, track?.id));
  const quads = [];
  pushJobCoreTriples(quads, jobNode, discipline, level, track);
  if (job.title) quads.push(labelQuad(jobNode, job.title));

  for (const entry of toolkit || []) {
    if (!entry?.name) continue;
    // Tool IRIs use a kebab-cased identifier of the tool name to remain
    // stable across runs and predictable for the LLM.
    const toolId = String(entry.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const toolNode = namedNode(toolIri(toolId));
    quads.push(quad(jobNode, fit("software"), toolNode));
    quads.push(labelQuad(toolNode, entry.name));
  }

  return writeTurtle(quads);
}
