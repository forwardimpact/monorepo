/**
 * Integration test for the Pathway service.
 *
 * Loads the real starter standard data via createDataLoader, constructs the
 * service in-process, and verifies that DescribeJob and DescribeProgression
 * Turtle responses match the underlying libskill output field-by-field.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pkg from "n3";

import { PathwayService } from "../index.js";
import { createDataLoader } from "@forwardimpact/map/loader";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createMockConfig, createTurtleHelpers } from "@forwardimpact/libmock";
import { deriveJob } from "@forwardimpact/libskill/derivation";
import { analyzeProgression } from "@forwardimpact/libskill/progression";

const { Parser } = pkg;
const FIT = "https://www.forwardimpact.team/schema/rdf/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const { parseQuads, findAll, findOne } = createTurtleHelpers(Parser);

const __dirname = dirname(fileURLToPath(import.meta.url));
// services/pathway/test -> repo root -> products/map/starter
const STARTER_DIR = resolve(__dirname, "../../../products/map/starter");

describe("PathwayService integration (starter standard)", () => {
  let service;
  let data;

  before(async () => {
    const loader = createDataLoader(createDefaultRuntime());
    data = await loader.loadAllData(STARTER_DIR);
    const agentData = await loader.loadAgentData(STARTER_DIR);
    const skillsWithAgent = await loader.loadSkillsWithAgentData(STARTER_DIR);
    const config = createMockConfig("pathway");
    service = new PathwayService(config, { data, agentData, skillsWithAgent });
  });

  test("DescribeJob skill matrix matches deriveJob output for the same inputs", async () => {
    const discipline = data.disciplines.find(
      (d) => d.id === "software-engineering",
    );
    const level = data.levels.find((l) => l.id === "J060");
    assert.ok(discipline, "expected software-engineering discipline");
    assert.ok(level, "expected J060 level");

    const expected = deriveJob({
      discipline,
      level,
      track: null,
      skills: data.skills,
      behaviours: data.behaviours,
      capabilities: data.capabilities,
      validationRules: data.standard?.validationRules,
    });
    assert.ok(expected, "expected deriveJob to return a job");

    const result = await service.DescribeJob({
      discipline: "software-engineering",
      level: "J060",
    });

    const quads = parseQuads(result.content);
    const jobIri = `${FIT}job/software-engineering/J060`;
    assert.ok(
      findOne(quads, {
        subject: jobIri,
        predicate: RDF_TYPE,
        object: `${FIT}Job`,
      }),
      "expected fit:Job triple in DescribeJob output",
    );

    // Build the set of (skillId, proficiency) tuples from the Turtle and
    // compare against deriveJob().skillMatrix.
    const matrixNodes = findAll(quads, {
      subject: jobIri,
      predicate: `${FIT}skillMatrix`,
    });

    const turtleMatrix = matrixNodes
      .map((m) => {
        const skillQuad = findOne(quads, {
          subject: m.object.value,
          predicate: `${FIT}skill`,
        });
        const profQuad = findOne(quads, {
          subject: m.object.value,
          predicate: `${FIT}proficiency`,
        });
        const skillIri = skillQuad?.object.value;
        const skillId = skillIri?.replace(`${FIT}skill/`, "");
        return { skillId, proficiency: profQuad?.object.value };
      })
      .sort((a, b) => a.skillId.localeCompare(b.skillId));

    const expectedMatrix = expected.skillMatrix
      .map((e) => ({ skillId: e.skillId, proficiency: e.proficiency }))
      .sort((a, b) => a.skillId.localeCompare(b.skillId));

    assert.deepStrictEqual(turtleMatrix, expectedMatrix);
  });

  test("DescribeProgression skill changes match analyzeProgression output", async () => {
    const discipline = data.disciplines.find(
      (d) => d.id === "software-engineering",
    );
    const fromLevel = data.levels.find((l) => l.id === "J040");
    const toLevel = data.levels.find((l) => l.id === "J060");

    const currentJob = deriveJob({
      discipline,
      level: fromLevel,
      track: null,
      skills: data.skills,
      behaviours: data.behaviours,
      capabilities: data.capabilities,
      validationRules: data.standard?.validationRules,
    });
    const targetJob = deriveJob({
      discipline,
      level: toLevel,
      track: null,
      skills: data.skills,
      behaviours: data.behaviours,
      capabilities: data.capabilities,
      validationRules: data.standard?.validationRules,
    });
    const expected = analyzeProgression(currentJob, targetJob);

    const result = await service.DescribeProgression({
      discipline: "software-engineering",
      from_level: "J040",
      to_level: "J060",
    });

    const quads = parseQuads(result.content);
    const progNode = `${FIT}progression/software-engineering/J040-J060`;
    assert.ok(
      findOne(quads, {
        subject: progNode,
        predicate: RDF_TYPE,
        object: `${FIT}Progression`,
      }),
      "expected fit:Progression triple",
    );

    const changeNodes = findAll(quads, {
      subject: progNode,
      predicate: `${FIT}skillChange`,
    });

    const turtleChanges = changeNodes
      .map((c) => {
        const skillQuad = findOne(quads, {
          subject: c.object.value,
          predicate: `${FIT}skill`,
        });
        const skillId = skillQuad?.object.value.replace(`${FIT}skill/`, "");
        return skillId;
      })
      .sort();

    const expectedSkillIds = expected.skillChanges
      .map((s) => s.id ?? s.skillId)
      .sort();

    assert.deepStrictEqual(turtleChanges, expectedSkillIds);
  });
});
