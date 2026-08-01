import { services } from "@forwardimpact/librpc";
import { generateAllJobs, deriveJob } from "@forwardimpact/libskill/derivation";
import {
  getValidLevelTrackCombinations,
  analyzeProgression,
} from "@forwardimpact/libskill/progression";
import {
  deriveReferenceLevel,
  generateAgentProfile,
} from "@forwardimpact/libskill/agent";
import { deriveToolkit } from "@forwardimpact/libskill/toolkit";

import {
  jobToTurtle,
  jobListToTurtle,
  agentProfileToTurtle,
  agentProfileListToTurtle,
  progressionToTurtle,
  jobSoftwareToTurtle,
} from "./src/serialize.js";

const { PathwayBase } = services;

/**
 * Pathway derivation service. It is a thin gRPC transport over libskill.
 *
 * Each RPC delegates to libskill. It hands the result to the Turtle
 * serializer that matches. It returns `{ content: <turtle-string> }`. No new
 * derivation logic lives here.
 */
export class PathwayService extends PathwayBase {
  #data;
  #agentData;
  #skillsWithAgent;

  /**
   * @param {import("@forwardimpact/libconfig").ServiceConfig} config
   * @param {object} bundle
   * @param {object} bundle.data            - loadAllData() output
   * @param {object} bundle.agentData       - loadAgentData() output
   * @param {Array}  bundle.skillsWithAgent - loadSkillsWithAgentData() output
   */
  constructor(config, { data, agentData, skillsWithAgent } = {}) {
    super(config);
    if (!data) throw new Error("data is required");
    if (!agentData) throw new Error("agentData is required");
    if (!skillsWithAgent) throw new Error("skillsWithAgent is required");
    this.#data = data;
    this.#agentData = agentData;
    this.#skillsWithAgent = skillsWithAgent;
  }

  #validationRules() {
    return this.#data.standard?.validationRules;
  }

  #findDiscipline(id) {
    const d = this.#data.disciplines.find((x) => x.id === id);
    if (!d) throw new Error(`Unknown discipline: ${id}`);
    return d;
  }

  #findLevel(id) {
    const l = this.#data.levels.find((x) => x.id === id);
    if (!l) throw new Error(`Unknown level: ${id}`);
    return l;
  }

  #findTrack(id) {
    if (!id) return null;
    const t = this.#data.tracks.find((x) => x.id === id);
    if (!t) throw new Error(`Unknown track: ${id}`);
    return t;
  }

  #resolveAgentEntities(disciplineId, trackId) {
    const humanDiscipline = this.#findDiscipline(disciplineId);
    const humanTrack = this.#findTrack(trackId);
    const agentDiscipline = this.#agentData.disciplines.find(
      (d) => d.id === disciplineId,
    );
    if (!agentDiscipline) {
      throw new Error(`No agent definition for discipline: ${disciplineId}`);
    }
    let agentTrack = null;
    if (trackId) {
      agentTrack = this.#agentData.tracks.find((t) => t.id === trackId);
      if (!agentTrack) {
        throw new Error(`No agent definition for track: ${trackId}`);
      }
    }
    return { humanDiscipline, humanTrack, agentDiscipline, agentTrack };
  }

  /**
   * @param {import("@forwardimpact/libtype").pathway.ListJobsRequest} req
   * @returns {Promise<import("@forwardimpact/libtype").tool.ToolCallResult>}
   */
  async ListJobs(req) {
    const data = this.#data;
    const allJobs = generateAllJobs({
      disciplines: data.disciplines,
      levels: data.levels,
      tracks: data.tracks,
      skills: data.skills,
      behaviours: data.behaviours,
      validationRules: this.#validationRules(),
    });

    const filtered = req?.discipline
      ? allJobs.filter((j) => j.discipline?.id === req.discipline)
      : allJobs;

    const content = await jobListToTurtle(filtered);
    return { content };
  }

  /**
   * @param {import("@forwardimpact/libtype").pathway.DescribeJobRequest} req
   */
  async DescribeJob(req) {
    const data = this.#data;
    const discipline = this.#findDiscipline(req.discipline);
    const level = this.#findLevel(req.level);
    const track = this.#findTrack(req.track);

    const job = deriveJob({
      discipline,
      level,
      track,
      skills: data.skills,
      behaviours: data.behaviours,
      capabilities: data.capabilities,
      validationRules: this.#validationRules(),
    });

    if (!job) {
      throw new Error(
        `Invalid job combination: discipline=${req.discipline} level=${req.level}` +
          (req.track ? ` track=${req.track}` : ""),
      );
    }

    const content = await jobToTurtle(job);
    return { content };
  }

  /**
   * @param {import("@forwardimpact/libtype").pathway.ListAgentProfilesRequest} req
   */
  async ListAgentProfiles(req) {
    const data = this.#data;
    const targetDisciplines = req?.discipline
      ? [this.#findDiscipline(req.discipline)]
      : data.disciplines;

    // Build the unique (discipline, track) set across all valid combinations.
    const seen = new Set();
    const entries = [];
    for (const discipline of targetDisciplines) {
      const combos = getValidLevelTrackCombinations({
        discipline,
        levels: data.levels,
        tracks: data.tracks,
      });
      for (const { track } of combos) {
        if (!track) continue;
        const key = `${discipline.id}|${track.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ discipline, track, profile: null });
      }
    }

    const content = await agentProfileListToTurtle(entries);
    return { content };
  }

  /**
   * @param {import("@forwardimpact/libtype").pathway.DescribeAgentProfileRequest} req
   */
  async DescribeAgentProfile(req) {
    const data = this.#data;
    const { humanDiscipline, humanTrack, agentDiscipline, agentTrack } =
      this.#resolveAgentEntities(req.discipline, req.track);

    if (!humanTrack) {
      throw new Error("track is required for DescribeAgentProfile");
    }

    const level = deriveReferenceLevel(data.levels);
    const profile = generateAgentProfile({
      discipline: humanDiscipline,
      track: humanTrack,
      level,
      skills: this.#skillsWithAgent,
      capabilities: data.capabilities,
      behaviours: data.behaviours,
      agentBehaviours: this.#agentData.behaviours,
      agentDiscipline,
      agentTrack,
    });
    const content = await agentProfileToTurtle({
      discipline: humanDiscipline,
      track: humanTrack,
      profile,
    });
    return { content };
  }

  /**
   * @param {import("@forwardimpact/libtype").pathway.DescribeProgressionRequest} req
   */
  async DescribeProgression(req) {
    const data = this.#data;
    const discipline = this.#findDiscipline(req.discipline);
    const fromLevel = this.#findLevel(req.from_level ?? req.fromLevel);
    const toLevel = this.#findLevel(req.to_level ?? req.toLevel);
    const track = this.#findTrack(req.track);

    const deriveArgs = {
      discipline,
      track,
      skills: data.skills,
      behaviours: data.behaviours,
      capabilities: data.capabilities,
      validationRules: this.#validationRules(),
    };
    const currentJob = deriveJob({ ...deriveArgs, level: fromLevel });
    const targetJob = deriveJob({ ...deriveArgs, level: toLevel });

    if (!currentJob || !targetJob) {
      throw new Error(
        `Invalid progression: ${discipline.id} ${fromLevel.id} -> ${toLevel.id}` +
          (track ? ` track=${track.id}` : ""),
      );
    }

    const analysis = analyzeProgression(currentJob, targetJob);
    const content = await progressionToTurtle(analysis);
    return { content };
  }

  /**
   * @param {import("@forwardimpact/libtype").pathway.ListJobSoftwareRequest} req
   */
  async ListJobSoftware(req) {
    const data = this.#data;
    const discipline = this.#findDiscipline(req.discipline);
    const level = this.#findLevel(req.level);
    const track = this.#findTrack(req.track);

    const job = deriveJob({
      discipline,
      level,
      track,
      skills: data.skills,
      behaviours: data.behaviours,
      capabilities: data.capabilities,
      validationRules: this.#validationRules(),
    });

    if (!job) {
      throw new Error(
        `Invalid job combination: discipline=${req.discipline} level=${req.level}` +
          (req.track ? ` track=${req.track}` : ""),
      );
    }

    const toolkit = deriveToolkit({
      skillMatrix: job.skillMatrix,
      skills: data.skills,
    });

    const content = await jobSoftwareToTurtle(job, toolkit);
    return { content };
  }

  /** @param {import("@forwardimpact/libtype").pathway.GetMarkersForProfileRequest} req */
  async GetMarkersForProfile(req) {
    const data = this.#data;
    const discipline = this.#findDiscipline(req.discipline);
    const level = this.#findLevel(req.level);
    const track = this.#findTrack(req.track);

    const job = deriveJob({
      discipline,
      level,
      track,
      skills: data.skills,
      behaviours: data.behaviours,
      capabilities: data.capabilities,
      validationRules: this.#validationRules(),
    });

    if (!job) {
      throw new Error(
        `Invalid profile: discipline=${req.discipline} level=${req.level}` +
          (req.track ? ` track=${req.track}` : ""),
      );
    }

    const markers = [];
    for (const entry of job.skillMatrix) {
      const skill = data.skills.find((s) => s.id === entry.skillId);
      if (!skill?.markers) continue;
      const levelMarkers = skill.markers[entry.proficiency];
      if (!levelMarkers) continue;
      const allTexts = [
        ...(levelMarkers.human || []),
        ...(levelMarkers.agent || []),
      ];
      for (const text of allTexts) {
        markers.push({
          skill_id: skill.id,
          level_id: entry.proficiency,
          marker_text: text,
        });
      }
    }

    const content = markers
      .map((m) => `${m.skill_id}\t${m.level_id}\t${m.marker_text}`)
      .join("\n");
    return { content };
  }
}
