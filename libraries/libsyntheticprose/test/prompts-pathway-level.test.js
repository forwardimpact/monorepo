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
    assert.match(user, /single capitalised rank word/);
    assert.match(user, /NEVER emit a multi-word role-complete title/);
  });

  test("instructs base-form verb opener for autonomyExpectation", () => {
    assert.match(user, /open with a base-form verb/);
    assert.match(user, /Never start with a third-person form/);
  });
});
