import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ContractViolationError, throwIfErrors } from "../src/contract.js";

describe("throwIfErrors", () => {
  test("no-op when result has no errors", () => {
    throwIfErrors(
      { errors: [] },
      { ruleCodes: ["INVALID_VALUE"], paths: [/\.professionalTitle$/] },
    );
  });

  test("no-op when no error matches the filter", () => {
    throwIfErrors(
      { errors: [{ type: "MISSING_REQUIRED", path: "levels[0].id" }] },
      { ruleCodes: ["INVALID_VALUE"], paths: [/\.professionalTitle$/] },
    );
  });

  test("throws ContractViolationError for the first matching error", () => {
    let caught = null;
    try {
      throwIfErrors(
        {
          errors: [
            {
              type: "INVALID_VALUE",
              path: "levels[0].professionalTitle",
              value: "Engineer",
              message: 'professionalTitle "Engineer" shares token "engineer"…',
            },
          ],
        },
        {
          ruleCodes: ["INVALID_VALUE"],
          paths: [/\.professionalTitle$/, /\.autonomyExpectation$/],
        },
      );
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof ContractViolationError);
    assert.equal(caught.field, "levels[0].professionalTitle");
    assert.equal(caught.value, "Engineer");
    assert.equal(
      caught.contractUrl,
      "https://www.forwardimpact.team/docs/products/authoring-standards/index.md#level-field-conventions",
    );
  });
});
