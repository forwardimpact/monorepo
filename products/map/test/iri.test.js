import { test, describe } from "node:test";
import assert from "node:assert";

import {
  VOCAB_BASE,
  skillIri,
  capabilityIri,
  levelIri,
  behaviourIri,
  disciplineIri,
  trackIri,
  stageIri,
  driverIri,
  toolIri,
  jobIri,
  agentProfileIri,
  progressionIri,
  DERIVED_ENTITY_TYPES,
} from "../src/iri.js";

describe("VOCAB_BASE", () => {
  test("points at the canonical fit: namespace", () => {
    assert.strictEqual(
      VOCAB_BASE,
      "https://www.forwardimpact.team/schema/rdf/",
    );
  });
});

describe("base entity IRI helpers", () => {
  const cases = [
    [skillIri, "skill", "leadership"],
    [capabilityIri, "capability", "delivery"],
    [levelIri, "level", "l3"],
    [behaviourIri, "behaviour", "ownership"],
    [disciplineIri, "discipline", "swe"],
    [trackIri, "track", "forward_deployed"],
    [stageIri, "stage", "design"],
    [driverIri, "driver", "impact"],
    [toolIri, "tool", "kubernetes"],
  ];

  for (const [fn, segment, id] of cases) {
    test(`${fn.name} produces ${segment}/${id} under VOCAB_BASE`, () => {
      assert.strictEqual(fn(id), `${VOCAB_BASE}${segment}/${id}`);
    });
  }
});

describe("jobIri", () => {
  test("includes the track segment when provided", () => {
    assert.strictEqual(
      jobIri("swe", "l3", "forward_deployed"),
      `${VOCAB_BASE}job/swe/l3/forward_deployed`,
    );
  });

  test("omits the track segment when not provided", () => {
    assert.strictEqual(jobIri("swe", "l3"), `${VOCAB_BASE}job/swe/l3`);
  });

  test("treats an empty string track the same as a missing track", () => {
    assert.strictEqual(jobIri("swe", "l3", ""), `${VOCAB_BASE}job/swe/l3`);
  });
});

describe("agentProfileIri", () => {
  test("includes the stage segment when provided", () => {
    assert.strictEqual(
      agentProfileIri("swe", "forward_deployed", "design"),
      `${VOCAB_BASE}agent-profile/swe/forward_deployed/design`,
    );
  });

  test("omits the stage segment when not provided", () => {
    assert.strictEqual(
      agentProfileIri("swe", "forward_deployed"),
      `${VOCAB_BASE}agent-profile/swe/forward_deployed`,
    );
  });
});

describe("progressionIri", () => {
  test("includes the track segment when provided", () => {
    assert.strictEqual(
      progressionIri("swe", "l2", "l3", "forward_deployed"),
      `${VOCAB_BASE}progression/swe/l2-l3/forward_deployed`,
    );
  });

  test("omits the track segment when not provided", () => {
    assert.strictEqual(
      progressionIri("swe", "l2", "l3"),
      `${VOCAB_BASE}progression/swe/l2-l3`,
    );
  });
});

describe("DERIVED_ENTITY_TYPES", () => {
  test("contains exactly the canonical derived-entity IRIs", () => {
    assert.deepStrictEqual(DERIVED_ENTITY_TYPES, [
      `${VOCAB_BASE}Job`,
      `${VOCAB_BASE}AgentProfile`,
      `${VOCAB_BASE}Progression`,
      `${VOCAB_BASE}SkillProficiency`,
      `${VOCAB_BASE}SkillChange`,
      `${VOCAB_BASE}BehaviourChange`,
    ]);
  });

  test("does not include SkillModifier (it is part of the base Track definition)", () => {
    assert.ok(!DERIVED_ENTITY_TYPES.includes(`${VOCAB_BASE}SkillModifier`));
  });

  test("every entry begins with VOCAB_BASE", () => {
    for (const iri of DERIVED_ENTITY_TYPES) {
      assert.ok(
        iri.startsWith(VOCAB_BASE),
        `${iri} should start with ${VOCAB_BASE}`,
      );
    }
  });
});
