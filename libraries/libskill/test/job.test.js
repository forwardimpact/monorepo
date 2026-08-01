import { test, describe } from "node:test";
import assert from "node:assert";

import { prepareJobDetail } from "../src/job.js";
import {
  makeDiscipline,
  makeLevel,
  makeSkills,
  makeBehaviours,
  makeCapabilities,
  makeDrivers,
} from "./derivation-fixtures.js";

// =============================================================================
// prepareJobDetail — capabilityOrder
// =============================================================================

describe("prepareJobDetail", () => {
  test("capabilityOrder reflects derivedResponsibilities order", () => {
    const view = prepareJobDetail({
      discipline: makeDiscipline(),
      level: makeLevel(),
      track: null,
      skills: makeSkills(),
      behaviours: makeBehaviours(),
      drivers: makeDrivers(),
      capabilities: makeCapabilities(),
    });

    // derivedResponsibilities comes back sorted by proficiency desc, then
    // skill count, then ordinalRank
    const expectedOrder = view.derivedResponsibilities.map((r) => r.capability);
    assert.deepStrictEqual(view.capabilityOrder, expectedOrder);
    assert.ok(view.capabilityOrder.length > 0);
  });

  test("capabilityOrder is empty when the call omits capabilities", () => {
    const view = prepareJobDetail({
      discipline: makeDiscipline(),
      level: makeLevel(),
      track: null,
      skills: makeSkills(),
      behaviours: makeBehaviours(),
      drivers: makeDrivers(),
    });

    assert.deepStrictEqual(view.capabilityOrder, []);
    assert.deepStrictEqual(view.derivedResponsibilities, []);
  });
});
