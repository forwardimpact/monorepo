import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildLevelPrompt } from "../src/prompts/pathway/level.js";

describe("buildLevelPrompt", () => {
  const ctx = { domain: "test", industry: "test", standardName: "Test" };
  const schema = {};
  const levels = [
    {
      id: "J040",
      rank: 1,
      experience: "0-2 years",
      professionalTitle: "Associate",
    },
  ];
  const { user } = buildLevelPrompt(levels, ctx, schema);

  test("instructs single capitalised rank for professionalTitle", () => {
    assert.match(user, /single capitalized\n?\s*rank word/);
    assert.match(user, /Do not write a multi-word role-complete title/);
  });

  test("instructs base-form verb opener for autonomyExpectation", () => {
    assert.match(user, /start with a base-form verb/);
    assert.match(user, /Do not start with a third-person\n?\s*form/);
  });
});
