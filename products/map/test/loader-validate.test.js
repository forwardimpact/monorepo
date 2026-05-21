import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DataLoader } from "../src/loader.js";
import { ContractViolationError } from "../src/contract.js";

function makeMocks(levels) {
  const entities = {
    "drivers.yaml": [{ id: "delivery", name: "Delivery" }],
    "behaviours/ownership.yaml": { name: "Ownership", human: {} },
    "disciplines/software_engineering.yaml": {
      roleTitle: "Software Engineer",
      coreSkills: ["coding"],
      supportingSkills: [],
      broadSkills: [],
      isProfessional: true,
      isManagement: false,
      human: {},
    },
    "capabilities/delivery.yaml": {
      name: "Delivery",
      skills: [
        {
          id: "coding",
          name: "Coding",
          human: { description: "", proficiencyDescriptions: {} },
        },
      ],
    },
    "levels.yaml": levels,
    "standard.yaml": { name: "Test" },
  };
  return {
    fs: {
      stat: async () => ({}),
      readdir: async (path) => {
        if (path.endsWith("disciplines")) return ["software_engineering.yaml"];
        if (path.endsWith("behaviours")) return ["ownership.yaml"];
        if (path.endsWith("tracks")) return [];
        if (path.endsWith("capabilities")) return ["delivery.yaml"];
        return [];
      },
      readFile: async (path) => {
        for (const [key, data] of Object.entries(entities)) {
          if (path.endsWith(key)) return JSON.stringify(data);
        }
        return "{}";
      },
    },
    parser: { parseYaml: (s) => JSON.parse(s) },
  };
}

const compliantLevels = [
  {
    id: "J060",
    professionalTitle: "Level II",
    managementTitle: "Manager",
    ordinalRank: 2,
    baseSkillProficiencies: {
      core: "working",
      supporting: "foundational",
      broad: "awareness",
    },
    baseBehaviourMaturity: "developing",
    expectations: { autonomyExpectation: "Work independently" },
  },
];

describe("DataLoader.loadAndValidate", () => {
  test("compliant data resolves with the loaded object", async () => {
    const { fs, parser } = makeMocks(compliantLevels);
    const loader = new DataLoader(fs, parser);
    const data = await loader.loadAndValidate("/data");
    assert.equal(data.levels[0].id, "J060");
  });

  test("non-compliant professionalTitle rejects with ContractViolationError", async () => {
    const { fs, parser } = makeMocks([
      { ...compliantLevels[0], professionalTitle: "Engineer" },
    ]);
    const loader = new DataLoader(fs, parser);
    let caught = null;
    try {
      await loader.loadAndValidate("/data");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof ContractViolationError);
    assert.equal(caught.field, "levels[0].professionalTitle");
  });
});
