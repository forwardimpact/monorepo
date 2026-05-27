import { test, describe } from "node:test";
import assert from "node:assert";
import pkg from "n3";

import {
  jobToTurtle,
  jobListToTurtle,
  agentProfileToTurtle,
  agentProfileListToTurtle,
  progressionToTurtle,
  jobSoftwareToTurtle,
} from "../src/serialize.js";
import { createTurtleHelpers } from "@forwardimpact/libmock";

const { Parser } = pkg;
const FIT = "https://www.forwardimpact.team/schema/rdf/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const { parseQuads, findAll, findOne } = createTurtleHelpers(Parser);

const fakeJob = {
  id: "fde-l3-forward_deployed",
  title: "FDE L3 (Forward Deployed)",
  discipline: { id: "fde" },
  level: { id: "l3" },
  track: { id: "forward_deployed" },
  skillMatrix: [
    { skillId: "python", proficiency: "practitioner" },
    { skillId: "cloud-architecture", proficiency: "foundational" },
  ],
  behaviourProfile: [{ behaviourId: "ownership", maturity: "practicing" }],
  derivedResponsibilities: ["Lead complex technical work"],
};

describe("jobToTurtle", () => {
  test("emits a fit:Job with discipline, level, track, label, skill matrix", async () => {
    const turtle = await jobToTurtle(fakeJob);
    const quads = parseQuads(turtle);
    const jobIri = `${FIT}job/fde/l3/forward_deployed`;

    assert.ok(
      findOne(quads, {
        subject: jobIri,
        predicate: RDF_TYPE,
        object: `${FIT}Job`,
      }),
      "expected fit:Job type triple",
    );
    assert.ok(
      findOne(quads, {
        subject: jobIri,
        predicate: `${FIT}discipline`,
        object: `${FIT}discipline/fde`,
      }),
    );
    assert.ok(
      findOne(quads, {
        subject: jobIri,
        predicate: `${FIT}level`,
        object: `${FIT}level/l3`,
      }),
    );
    assert.ok(
      findOne(quads, {
        subject: jobIri,
        predicate: `${FIT}track`,
        object: `${FIT}track/forward_deployed`,
      }),
    );

    const matrixQuads = findAll(quads, {
      subject: jobIri,
      predicate: `${FIT}skillMatrix`,
    });
    assert.strictEqual(matrixQuads.length, 2);

    // Each matrix node should be typed and carry skill+proficiency.
    for (const m of matrixQuads) {
      const node = m.object.value;
      assert.ok(
        findOne(quads, {
          subject: node,
          predicate: RDF_TYPE,
          object: `${FIT}SkillProficiency`,
        }),
      );
      assert.ok(findOne(quads, { subject: node, predicate: `${FIT}skill` }));
      assert.ok(
        findOne(quads, { subject: node, predicate: `${FIT}proficiency` }),
      );
    }

    const skillIris = matrixQuads
      .map(
        (m) =>
          findOne(quads, { subject: m.object.value, predicate: `${FIT}skill` })
            ?.object.value,
      )
      .sort();
    assert.deepStrictEqual(skillIris, [
      `${FIT}skill/cloud-architecture`,
      `${FIT}skill/python`,
    ]);
  });

  test("trackless job omits fit:track", async () => {
    const trackless = { ...fakeJob, track: null };
    const turtle = await jobToTurtle(trackless);
    const quads = parseQuads(turtle);
    assert.strictEqual(findOne(quads, { predicate: `${FIT}track` }), undefined);
  });
});

describe("jobListToTurtle", () => {
  test("emits one fit:Job per entry without skill matrix detail", async () => {
    const jobs = [
      {
        title: "A",
        discipline: { id: "fde" },
        level: { id: "l3" },
        track: { id: "forward_deployed" },
      },
      {
        title: "B",
        discipline: { id: "fde" },
        level: { id: "l4" },
        track: null,
      },
    ];
    const turtle = await jobListToTurtle(jobs);
    const quads = parseQuads(turtle);

    const types = findAll(quads, {
      predicate: RDF_TYPE,
      object: `${FIT}Job`,
    });
    assert.strictEqual(types.length, 2);

    // No skill matrix triples in the summary form.
    assert.strictEqual(
      findOne(quads, { predicate: `${FIT}skillMatrix` }),
      undefined,
    );
  });
});

describe("agentProfileToTurtle", () => {
  test("emits fit:AgentProfile with skills and behaviours", async () => {
    const turtle = await agentProfileToTurtle({
      discipline: { id: "fde" },
      track: { id: "forward_deployed" },
      profile: {
        frontmatter: { name: "fde-fwd", model: "opus" },
        bodyData: {
          derivedSkills: [{ skillId: "python" }, { skillId: "ci-cd" }],
          derivedBehaviours: [{ behaviourId: "ownership" }],
        },
      },
    });
    const quads = parseQuads(turtle);
    const node = `${FIT}agent-profile/fde/forward_deployed`;

    assert.ok(
      findOne(quads, {
        subject: node,
        predicate: RDF_TYPE,
        object: `${FIT}AgentProfile`,
      }),
    );
    assert.strictEqual(
      findAll(quads, { subject: node, predicate: `${FIT}agentSkill` }).length,
      2,
    );
    assert.strictEqual(
      findAll(quads, { subject: node, predicate: `${FIT}agentBehaviour` })
        .length,
      1,
    );
    assert.strictEqual(
      findOne(quads, { subject: node, predicate: `${FIT}stage` }),
      undefined,
      "should not have stage triple",
    );
    const fm = findOne(quads, {
      subject: node,
      predicate: `${FIT}frontmatter`,
    });
    assert.ok(fm);
    assert.deepStrictEqual(JSON.parse(fm.object.value), {
      name: "fde-fwd",
      model: "opus",
    });
  });
});

describe("agentProfileListToTurtle", () => {
  test("emits one fit:AgentProfile per entry", async () => {
    const turtle = await agentProfileListToTurtle([
      {
        discipline: { id: "fde" },
        track: { id: "forward_deployed" },
        stage: null,
        profile: null,
      },
      {
        discipline: { id: "fde" },
        track: { id: "platform" },
        stage: null,
        profile: null,
      },
    ]);
    const quads = parseQuads(turtle);
    assert.strictEqual(
      findAll(quads, { predicate: RDF_TYPE, object: `${FIT}AgentProfile` })
        .length,
      2,
    );
  });
});

describe("progressionToTurtle", () => {
  test("emits fit:Progression with skill change blank nodes and changeKind", async () => {
    const progression = {
      current: {
        discipline: { id: "fde" },
        level: { id: "l2" },
        track: { id: "forward_deployed" },
      },
      target: {
        discipline: { id: "fde" },
        level: { id: "l3" },
        track: { id: "forward_deployed" },
      },
      // Fixture uses the canonical libskill shape from progression.js:
      // { id, currentLevel, targetLevel, change, isGained, isLost }.
      skillChanges: [
        {
          id: "python",
          currentLevel: "working",
          targetLevel: "practitioner",
          change: 1,
          isGained: false,
          isLost: false,
        },
        {
          id: "cloud-architecture",
          currentLevel: null,
          targetLevel: "foundational",
          change: 1,
          isGained: true,
          isLost: false,
        },
      ],
      behaviourChanges: [
        {
          id: "ownership",
          currentLevel: "developing",
          targetLevel: "practicing",
          change: 1,
        },
      ],
    };

    const turtle = await progressionToTurtle(progression);
    const quads = parseQuads(turtle);
    const progNode = `${FIT}progression/fde/l2-l3/forward_deployed`;

    assert.ok(
      findOne(quads, {
        subject: progNode,
        predicate: RDF_TYPE,
        object: `${FIT}Progression`,
      }),
    );
    assert.ok(
      findOne(quads, {
        subject: progNode,
        predicate: `${FIT}fromJob`,
        object: `${FIT}job/fde/l2/forward_deployed`,
      }),
    );
    assert.ok(
      findOne(quads, {
        subject: progNode,
        predicate: `${FIT}toJob`,
        object: `${FIT}job/fde/l3/forward_deployed`,
      }),
    );

    const changeNodes = findAll(quads, {
      subject: progNode,
      predicate: `${FIT}skillChange`,
    });
    assert.strictEqual(changeNodes.length, 2);

    // Verify changeKind values.
    const kinds = changeNodes
      .map(
        (c) =>
          findOne(quads, {
            subject: c.object.value,
            predicate: `${FIT}changeKind`,
          })?.object.value,
      )
      .sort();
    assert.deepStrictEqual(kinds, ["gained", "increased"]);

    // Verify from/to proficiency literals map from libskill's currentLevel
    // and targetLevel fields.
    const pythonChange = changeNodes.find(
      (c) =>
        findOne(quads, {
          subject: c.object.value,
          predicate: `${FIT}skill`,
        })?.object.value === `${FIT}skill/python`,
    );
    assert.ok(pythonChange);
    assert.strictEqual(
      findOne(quads, {
        subject: pythonChange.object.value,
        predicate: `${FIT}fromProficiency`,
      })?.object.value,
      "working",
    );
    assert.strictEqual(
      findOne(quads, {
        subject: pythonChange.object.value,
        predicate: `${FIT}toProficiency`,
      })?.object.value,
      "practitioner",
    );

    // Behaviour change should emit fit:behaviourChange with matching maturity.
    const bcNodes = findAll(quads, {
      subject: progNode,
      predicate: `${FIT}behaviourChange`,
    });
    assert.strictEqual(bcNodes.length, 1);
    assert.strictEqual(
      findOne(quads, {
        subject: bcNodes[0].object.value,
        predicate: `${FIT}behaviour`,
      })?.object.value,
      `${FIT}behaviour/ownership`,
    );
    assert.strictEqual(
      findOne(quads, {
        subject: bcNodes[0].object.value,
        predicate: `${FIT}toMaturity`,
      })?.object.value,
      "practicing",
    );
  });
});

describe("jobSoftwareToTurtle", () => {
  test("emits fit:software predicates pointing to fit:Tool IRIs with labels", async () => {
    const job = {
      title: "FDE L3",
      discipline: { id: "fde" },
      level: { id: "l3" },
      track: { id: "forward_deployed" },
    };
    const toolkit = [
      { name: "Python", description: "..." },
      { name: "GitHub Actions", description: "..." },
    ];
    const turtle = await jobSoftwareToTurtle(job, toolkit);
    const quads = parseQuads(turtle);
    const jobIri = `${FIT}job/fde/l3/forward_deployed`;

    const softwareQuads = findAll(quads, {
      subject: jobIri,
      predicate: `${FIT}software`,
    });
    assert.strictEqual(softwareQuads.length, 2);
    const tools = softwareQuads.map((q) => q.object.value).sort();
    assert.deepStrictEqual(tools, [
      `${FIT}tool/github-actions`,
      `${FIT}tool/python`,
    ]);
  });
});
