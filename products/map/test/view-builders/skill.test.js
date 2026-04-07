import { test, describe } from "node:test";
import assert from "node:assert";

import { buildSkillView } from "../../src/view-builders/skill.js";
import { skillIri, capabilityIri, trackIri } from "../../src/iri.js";

const SKILL = {
  id: "python",
  name: "Python",
  capability: "foundations",
  description: "Writing Python.",
  proficiencyDescriptions: {
    awareness: "You know it exists.",
    working: "You can ship features in it.",
  },
};

const CTX = {
  capabilities: [{ id: "foundations", name: "Foundations" }],
  disciplines: [
    {
      id: "software_engineering",
      specialization: "Software Engineering",
      coreSkills: ["python"],
    },
  ],
  tracks: [
    {
      id: "platform",
      name: "Platform",
      skillModifiers: { python: 1 },
    },
  ],
  drivers: [{ id: "quality", name: "Quality", contributingSkills: ["python"] }],
};

describe("buildSkillView", () => {
  test("returns IRIs from the shared iri module", () => {
    const view = buildSkillView(SKILL, CTX);
    assert.strictEqual(view.iri, skillIri("python"));
    assert.strictEqual(view.capabilityIri, capabilityIri("foundations"));
  });

  test("flattens proficiency descriptions in declared order", () => {
    const view = buildSkillView(SKILL, CTX);
    assert.deepStrictEqual(view.proficiencies, [
      { level: "awareness", description: "You know it exists." },
      { level: "working", description: "You can ship features in it." },
    ]);
  });

  test("collects related disciplines from coreSkills/supportingSkills/broadSkills", () => {
    const view = buildSkillView(SKILL, CTX);
    assert.strictEqual(view.relatedDisciplines.length, 1);
    assert.strictEqual(view.relatedDisciplines[0].id, "software_engineering");
  });

  test("collects related tracks with their modifier value", () => {
    const view = buildSkillView(SKILL, CTX);
    assert.deepStrictEqual(view.relatedTracks, [
      {
        iri: trackIri("platform"),
        id: "platform",
        name: "Platform",
        modifier: 1,
      },
    ]);
  });

  test("collects related drivers", () => {
    const view = buildSkillView(SKILL, CTX);
    assert.strictEqual(view.relatedDrivers[0].id, "quality");
  });

  test("isHumanOnly defaults false", () => {
    const view = buildSkillView(SKILL, CTX);
    assert.strictEqual(view.isHumanOnly, false);
  });
});
