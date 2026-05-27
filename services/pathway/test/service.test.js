import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import pkg from "n3";

import { PathwayService } from "../index.js";
import {
  assertRejectsMessage,
  assertThrowsMessage,
  createMockConfig,
  createTurtleHelpers,
} from "@forwardimpact/libmock";

const { Parser } = pkg;
const FIT = "https://www.forwardimpact.team/schema/rdf/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const { parseQuads, findAll, findOne } = createTurtleHelpers(Parser);

// --- Hand-built minimal standard data -----------------------------------

function buildData() {
  const fde = {
    id: "fde",
    specialization: "Engineering",
    roleTitle: "Engineer",
    isProfessional: true,
    validTracks: [null, "fwd"],
    coreSkills: ["python"],
    supportingSkills: [],
    broadSkills: [],
    behaviourModifiers: {},
  };

  const fwd = {
    id: "fwd",
    name: "Forward",
    description: "Forward track",
    skillModifiers: {},
    behaviourModifiers: {},
    assessmentWeights: {},
  };

  const l1 = {
    id: "l1",
    professionalTitle: "Level I",
    typicalExperienceRange: "0-2",
    ordinalRank: 1,
    qualificationSummary: "Entry",
    baseSkillProficiencies: {
      primary: "foundational",
      secondary: "awareness",
      broad: "awareness",
    },
    baseBehaviourMaturity: "emerging",
    expectations: {},
  };

  const l2 = {
    id: "l2",
    professionalTitle: "Level II",
    typicalExperienceRange: "2-5",
    ordinalRank: 2,
    qualificationSummary: "Mid",
    baseSkillProficiencies: {
      primary: "working",
      secondary: "foundational",
      broad: "awareness",
    },
    baseBehaviourMaturity: "developing",
    expectations: {},
  };

  const pythonSkill = {
    id: "python",
    name: "Python",
    capability: "engineering",
    description: "Python programming",
    proficiencyDescriptions: {},
    // toolReferences is preserved by loadAllData (loader.js:125). The
    // ListJobSoftware RPC uses data.skills for the toolkit lookup, so this
    // entry exercises the real code path end-to-end.
    toolReferences: [
      {
        name: "Python",
        description: "Python runtime",
        url: "https://python.org",
      },
      { name: "GitHub Actions", description: "CI/CD" },
    ],
  };

  const ownership = {
    id: "ownership",
    name: "Ownership",
    description: "Owns work",
    maturityDescriptions: {},
  };

  return {
    drivers: [],
    behaviours: [ownership],
    skills: [pythonSkill],
    disciplines: [fde],
    tracks: [fwd],
    levels: [l1, l2],
    capabilities: [],
    questions: [],
    standard: { validationRules: { levels: [l1, l2] } },
  };
}

function buildService() {
  const config = createMockConfig("pathway");
  const data = buildData();
  // Bare-minimum agentData / skillsWithAgent — only needed by RPCs we don't
  // exercise from this hand-built dataset (DescribeAgentProfile is covered
  // by the integration test).
  const agentData = { disciplines: [], tracks: [], behaviours: [] };
  const skillsWithAgent = [];
  return new PathwayService(config, { data, agentData, skillsWithAgent });
}

// --- Tests ----------------------------------------------------------------

describe("PathwayService", () => {
  test("exports class with all RPC methods", () => {
    assert.strictEqual(typeof PathwayService, "function");
    for (const method of [
      "ListJobs",
      "DescribeJob",
      "ListAgentProfiles",
      "DescribeAgentProfile",
      "DescribeProgression",
      "ListJobSoftware",
    ]) {
      assert.strictEqual(
        typeof PathwayService.prototype[method],
        "function",
        `expected ${method}`,
      );
    }
  });

  test("constructor rejects missing data bundle pieces", () => {
    const config = createMockConfig("pathway");
    assertThrowsMessage(
      () => new PathwayService(config, {}),
      /data is required/,
    );
    assertThrowsMessage(
      () => new PathwayService(config, { data: {} }),
      /agentData is required/,
    );
    assertThrowsMessage(
      () => new PathwayService(config, { data: {}, agentData: {} }),
      /skillsWithAgent is required/,
    );
  });
});

describe("PathwayService RPCs", () => {
  let service;
  beforeEach(() => {
    service = buildService();
  });

  test("ListJobs returns Turtle with one fit:Job per valid combination", async () => {
    const result = await service.ListJobs({});
    assert.ok(typeof result.content === "string");
    const quads = parseQuads(result.content);
    const jobs = findAll(quads, {
      predicate: RDF_TYPE,
      object: `${FIT}Job`,
    });
    // Two levels x (trackless + 1 track) = up to 4 combos (depending on
    // validation). At minimum we expect more than one job.
    assert.ok(jobs.length >= 2, `expected >=2 jobs, got ${jobs.length}`);
    // Every job IRI must be under fit:job/
    for (const j of jobs) {
      assert.match(
        j.subject.value,
        /^https:\/\/www\.forwardimpact\.team\/schema\/rdf\/job\//,
      );
    }
  });

  test("ListJobs filters by discipline", async () => {
    const result = await service.ListJobs({ discipline: "fde" });
    const quads = parseQuads(result.content);
    const jobs = findAll(quads, {
      predicate: RDF_TYPE,
      object: `${FIT}Job`,
    });
    assert.ok(jobs.length >= 1);
    // Filter for non-existent discipline -> empty.
    const empty = await service.ListJobs({ discipline: "no-such" });
    const emptyQuads = parseQuads(empty.content);
    assert.strictEqual(
      findAll(emptyQuads, { predicate: RDF_TYPE, object: `${FIT}Job` }).length,
      0,
    );
  });

  test("DescribeJob returns Turtle for a single (discipline, level) job", async () => {
    const result = await service.DescribeJob({
      discipline: "fde",
      level: "l2",
    });
    const quads = parseQuads(result.content);
    const jobIri = `${FIT}job/fde/l2`;
    assert.ok(
      findOne(quads, {
        subject: jobIri,
        predicate: RDF_TYPE,
        object: `${FIT}Job`,
      }),
    );
    // skillMatrix should reference the python skill IRI.
    const matrixNodes = findAll(quads, {
      subject: jobIri,
      predicate: `${FIT}skillMatrix`,
    });
    assert.ok(matrixNodes.length >= 1);
    const skillIris = matrixNodes
      .map(
        (m) =>
          findOne(quads, { subject: m.object.value, predicate: `${FIT}skill` })
            ?.object.value,
      )
      .filter(Boolean);
    assert.ok(skillIris.includes(`${FIT}skill/python`));
  });

  test("DescribeJob with track produces a job IRI containing the track", async () => {
    const result = await service.DescribeJob({
      discipline: "fde",
      level: "l2",
      track: "fwd",
    });
    const quads = parseQuads(result.content);
    assert.ok(
      findOne(quads, {
        subject: `${FIT}job/fde/l2/fwd`,
        predicate: RDF_TYPE,
        object: `${FIT}Job`,
      }),
    );
  });

  test("DescribeJob throws for unknown discipline", async () => {
    await assertRejectsMessage(
      () => service.DescribeJob({ discipline: "no-such", level: "l2" }),
      /Unknown discipline/,
    );
  });

  test("DescribeProgression returns fit:Progression with skill changes", async () => {
    const result = await service.DescribeProgression({
      discipline: "fde",
      from_level: "l1",
      to_level: "l2",
    });
    const quads = parseQuads(result.content);
    const progNode = `${FIT}progression/fde/l1-l2`;
    assert.ok(
      findOne(quads, {
        subject: progNode,
        predicate: RDF_TYPE,
        object: `${FIT}Progression`,
      }),
    );
    assert.ok(
      findOne(quads, { subject: progNode, predicate: `${FIT}fromJob` }),
    );
    assert.ok(findOne(quads, { subject: progNode, predicate: `${FIT}toJob` }));
  });

  test("ListJobSoftware emits fit:software triples from skill toolReferences", async () => {
    const result = await service.ListJobSoftware({
      discipline: "fde",
      level: "l2",
    });
    const quads = parseQuads(result.content);
    const jobIri = `${FIT}job/fde/l2`;

    assert.ok(
      findOne(quads, {
        subject: jobIri,
        predicate: RDF_TYPE,
        object: `${FIT}Job`,
      }),
    );

    // The python skill fixture has two toolReferences — assert both are
    // emitted as fit:software predicates with fit:Tool IRIs. This guards
    // against a regression where data.skills stops carrying toolReferences.
    const softwareIris = findAll(quads, {
      subject: jobIri,
      predicate: `${FIT}software`,
    })
      .map((q) => q.object.value)
      .sort();
    assert.deepStrictEqual(softwareIris, [
      `${FIT}tool/github-actions`,
      `${FIT}tool/python`,
    ]);
  });

  test("ListAgentProfiles returns one fit:AgentProfile per (discipline, track)", async () => {
    const result = await service.ListAgentProfiles({});
    const quads = parseQuads(result.content);
    const profiles = findAll(quads, {
      predicate: RDF_TYPE,
      object: `${FIT}AgentProfile`,
    });
    // The fixture defines 1 discipline x 1 track => 1 profile.
    assert.strictEqual(profiles.length, 1);
    assert.strictEqual(
      profiles[0].subject.value,
      `${FIT}agent-profile/fde/fwd`,
    );
  });

  test("Round-trip: parse -> serialize -> parse produces a stable quad set", async () => {
    const result = await service.DescribeJob({
      discipline: "fde",
      level: "l2",
    });
    const first = parseQuads(result.content);
    assert.ok(first.length > 0);

    // Re-serialize parsed quads with N3 Writer, then re-parse. The set of
    // (subject, predicate, object) triples — ignoring blank-node identity —
    // must match between rounds.
    const { Writer } = pkg;
    const reserialize = (quads) =>
      new Promise((resolve, reject) => {
        const writer = new Writer({ format: "Turtle" });
        writer.addQuads(quads);
        writer.end((err, turtle) => (err ? reject(err) : resolve(turtle)));
      });

    const second = parseQuads(await reserialize(first));
    assert.strictEqual(second.length, first.length);

    // Compare structural shape: named-node subjects/predicates/objects must
    // match exactly; blank nodes may be relabelled but the count per
    // predicate must match.
    const namedKey = (q) =>
      `${q.subject.termType === "BlankNode" ? "_" : q.subject.value}|${q.predicate.value}|${q.object.termType === "BlankNode" ? "_" : q.object.value}`;
    const firstKeys = first.map(namedKey).sort();
    const secondKeys = second.map(namedKey).sort();
    assert.deepStrictEqual(secondKeys, firstKeys);
  });
});
