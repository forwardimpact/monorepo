import { describe, test } from "node:test";
import assert from "node:assert";
import { ContentValidator } from "../src/validate.js";
import {
  assertThrowsMessage,
  createSilentLogger,
} from "@forwardimpact/libmock";
import { buildEntities } from "./validate-helpers.js";

describe("ContentValidator", () => {
  test("throws when logger is not provided", () => {
    assertThrowsMessage(() => new ContentValidator(), /logger is required/);
  });

  test("validates entities using validate method", () => {
    const logger = createSilentLogger();
    const validator = new ContentValidator(logger);
    const result = validator.validate(buildEntities());
    assert.strictEqual(result.passed, true);
  });
});
