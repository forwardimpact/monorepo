import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { computeGrowth, __setSummitForTests } from "../src/lib/summit.js";

afterEach(() => {
  __setSummitForTests(null);
});

describe("summit wrapper", () => {
  it("returns available: false when Summit is absent", async () => {
    __setSummitForTests({ fn: null });
    const result = await computeGrowth({});
    assert.equal(result.available, false);
    assert.equal(result.recommendations.length, 0);
  });

  it("returns recommendations when Summit is present", async () => {
    __setSummitForTests({
      fn: () => [{ skill: "planning", impact: "critical", candidates: [] }],
    });
    const result = await computeGrowth({});
    assert.equal(result.available, true);
    assert.equal(result.recommendations.length, 1);
    assert.equal(result.recommendations[0].skill, "planning");
  });

  it("catches unknown errors as warnings", async () => {
    __setSummitForTests({
      fn: () => {
        throw new Error("boom");
      },
    });
    const result = await computeGrowth({});
    assert.equal(result.available, true);
    assert.equal(result.recommendations.length, 0);
    assert.ok(result.warnings[0].includes("boom"));
  });

  it("catches GrowthContractError as warnings", async () => {
    class GrowthContractError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }
    __setSummitForTests({
      fn: () => {
        throw new GrowthContractError("UNKNOWN_DISCIPLINE", "bad discipline");
      },
      GrowthContractError,
    });
    const result = await computeGrowth({});
    assert.equal(result.available, true);
    assert.ok(result.warnings[0].includes("bad discipline"));
  });
});
