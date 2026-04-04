import { test, describe } from "node:test";
import assert from "node:assert";

import {
  ORDER_SKILL_TYPE,
  compareByLevelDesc,
  compareByLevelAsc,
  compareByType,
  compareByName,
  compareBySkillPriority,
  compareByTypeAndName,
  compareByMaturityDesc,
  compareByMaturityAsc,
  compareByBehaviourName,
  compareByBehaviourPriority,
} from "../policies/orderings.js";

function skill(overrides = {}) {
  return {
    skillId: "testing",
    skillName: "Testing",
    capability: "delivery",
    type: "primary",
    proficiency: "working",
    isHumanOnly: false,
    ...overrides,
  };
}

function behaviour(overrides = {}) {
  return {
    behaviourId: "collaboration",
    behaviourName: "Collaboration",
    maturity: "practicing",
    ...overrides,
  };
}

describe("orderings", () => {
  describe("ORDER_SKILL_TYPE", () => {
    test("has correct order", () => {
      assert.deepStrictEqual(ORDER_SKILL_TYPE, [
        "primary",
        "secondary",
        "broad",
        "track",
      ]);
    });
  });

  describe("compareByLevelDesc", () => {
    test("sorts higher proficiency first", () => {
      const items = [
        skill({ proficiency: "awareness" }),
        skill({ proficiency: "expert" }),
        skill({ proficiency: "working" }),
      ];
      items.sort(compareByLevelDesc);
      assert.deepStrictEqual(
        items.map((e) => e.proficiency),
        ["expert", "working", "awareness"],
      );
    });

    test("returns 0 for equal proficiencies", () => {
      assert.strictEqual(
        compareByLevelDesc(
          skill({ proficiency: "working" }),
          skill({ proficiency: "working" }),
        ),
        0,
      );
    });
  });

  describe("compareByLevelAsc", () => {
    test("sorts lower proficiency first", () => {
      const items = [
        skill({ proficiency: "expert" }),
        skill({ proficiency: "awareness" }),
        skill({ proficiency: "working" }),
      ];
      items.sort(compareByLevelAsc);
      assert.deepStrictEqual(
        items.map((e) => e.proficiency),
        ["awareness", "working", "expert"],
      );
    });
  });

  describe("compareByType", () => {
    test("sorts by canonical type order", () => {
      const items = [
        skill({ type: "track" }),
        skill({ type: "primary" }),
        skill({ type: "broad" }),
        skill({ type: "secondary" }),
      ];
      items.sort(compareByType);
      assert.deepStrictEqual(
        items.map((e) => e.type),
        ["primary", "secondary", "broad", "track"],
      );
    });
  });

  describe("compareByName", () => {
    test("sorts alphabetically by skillName", () => {
      const items = [
        skill({ skillName: "Zephyr" }),
        skill({ skillName: "Alpha" }),
        skill({ skillName: "Middle" }),
      ];
      items.sort(compareByName);
      assert.deepStrictEqual(
        items.map((e) => e.skillName),
        ["Alpha", "Middle", "Zephyr"],
      );
    });

    test("falls back to name property", () => {
      const items = [{ name: "Beta" }, { name: "Alpha" }];
      items.sort(compareByName);
      assert.deepStrictEqual(
        items.map((e) => e.name),
        ["Alpha", "Beta"],
      );
    });
  });

  describe("compareBySkillPriority", () => {
    test("sorts by level desc, then type asc, then name asc", () => {
      const items = [
        skill({
          skillName: "B",
          type: "primary",
          proficiency: "working",
        }),
        skill({
          skillName: "A",
          type: "secondary",
          proficiency: "expert",
        }),
        skill({
          skillName: "C",
          type: "primary",
          proficiency: "expert",
        }),
        skill({
          skillName: "D",
          type: "primary",
          proficiency: "expert",
        }),
      ];
      items.sort(compareBySkillPriority);
      // Expert primary first (alphabetical: C then D), then expert secondary (A), then working primary (B)
      assert.deepStrictEqual(
        items.map((e) => e.skillName),
        ["C", "D", "A", "B"],
      );
    });

    test("equal entries return 0", () => {
      const a = skill({
        skillName: "Same",
        type: "primary",
        proficiency: "working",
      });
      const b = skill({
        skillName: "Same",
        type: "primary",
        proficiency: "working",
      });
      assert.strictEqual(compareBySkillPriority(a, b), 0);
    });
  });

  describe("compareByTypeAndName", () => {
    test("sorts by type first, then name", () => {
      const items = [
        skill({ skillName: "Z", type: "broad" }),
        skill({ skillName: "A", type: "primary" }),
        skill({ skillName: "B", type: "primary" }),
        skill({ skillName: "M", type: "secondary" }),
      ];
      items.sort(compareByTypeAndName);
      assert.deepStrictEqual(
        items.map((e) => e.skillName),
        ["A", "B", "M", "Z"],
      );
      assert.deepStrictEqual(
        items.map((e) => e.type),
        ["primary", "primary", "secondary", "broad"],
      );
    });
  });

  describe("compareByMaturityDesc", () => {
    test("sorts higher maturity first", () => {
      const items = [
        behaviour({ maturity: "emerging" }),
        behaviour({ maturity: "exemplifying" }),
        behaviour({ maturity: "practicing" }),
      ];
      items.sort(compareByMaturityDesc);
      assert.deepStrictEqual(
        items.map((e) => e.maturity),
        ["exemplifying", "practicing", "emerging"],
      );
    });
  });

  describe("compareByMaturityAsc", () => {
    test("sorts lower maturity first", () => {
      const items = [
        behaviour({ maturity: "exemplifying" }),
        behaviour({ maturity: "emerging" }),
        behaviour({ maturity: "practicing" }),
      ];
      items.sort(compareByMaturityAsc);
      assert.deepStrictEqual(
        items.map((e) => e.maturity),
        ["emerging", "practicing", "exemplifying"],
      );
    });
  });

  describe("compareByBehaviourName", () => {
    test("sorts alphabetically by behaviourName", () => {
      const items = [
        behaviour({ behaviourName: "Zeal" }),
        behaviour({ behaviourName: "Autonomy" }),
      ];
      items.sort(compareByBehaviourName);
      assert.deepStrictEqual(
        items.map((e) => e.behaviourName),
        ["Autonomy", "Zeal"],
      );
    });

    test("falls back to name property", () => {
      const items = [{ name: "Beta" }, { name: "Alpha" }];
      items.sort(compareByBehaviourName);
      assert.deepStrictEqual(
        items.map((e) => e.name),
        ["Alpha", "Beta"],
      );
    });
  });

  describe("compareByBehaviourPriority", () => {
    test("sorts by maturity desc then name asc", () => {
      const items = [
        behaviour({ behaviourName: "Beta", maturity: "practicing" }),
        behaviour({ behaviourName: "Alpha", maturity: "exemplifying" }),
        behaviour({ behaviourName: "Alpha", maturity: "practicing" }),
      ];
      items.sort(compareByBehaviourPriority);
      assert.deepStrictEqual(
        items.map((e) => e.behaviourName),
        ["Alpha", "Alpha", "Beta"],
      );
      assert.deepStrictEqual(
        items.map((e) => e.maturity),
        ["exemplifying", "practicing", "practicing"],
      );
    });
  });
});
