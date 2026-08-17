import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { Window } from "happy-dom";

import {
  SKILL_PROFICIENCY_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
} from "@forwardimpact/libskill/levels";

let win;
const savedWindow = globalThis.window;
const savedDocument = globalThis.document;
const savedHTMLElement = globalThis.HTMLElement;

let createLevelBar;
let createLevelCell;
let createLevelDots;
let rankLevel;

beforeEach(async () => {
  win = new Window({ url: "http://localhost/" });
  globalThis.window = win;
  globalThis.document = win.document;
  // libui's render helpers branch on `instanceof HTMLElement`.
  globalThis.HTMLElement = win.HTMLElement;
  ({ createLevelBar, createLevelCell, createLevelDots, rankLevel } =
    await import("../src/components/detail.js"));
});

afterEach(() => {
  globalThis.window = savedWindow;
  globalThis.document = savedDocument;
  globalThis.HTMLElement = savedHTMLElement;
});

/** Count the dots a level bar fills */
function filledCount(bar) {
  return [...bar.children].filter((dot) =>
    dot.getAttribute("class").includes("filled"),
  ).length;
}

describe("rankLevel", () => {
  test("ranks the lowest level 1, not 0", () => {
    assert.strictEqual(rankLevel("awareness", SKILL_PROFICIENCY_ORDER), 1);
    assert.strictEqual(rankLevel("emerging", BEHAVIOUR_MATURITY_ORDER), 1);
  });

  test("ranks the highest level at the scale length", () => {
    assert.strictEqual(rankLevel("expert", SKILL_PROFICIENCY_ORDER), 5);
    assert.strictEqual(rankLevel("exemplifying", BEHAVIOUR_MATURITY_ORDER), 5);
  });

  test("ranks an unknown level 0", () => {
    assert.strictEqual(rankLevel("nonsense", SKILL_PROFICIENCY_ORDER), 0);
    assert.strictEqual(rankLevel(undefined, SKILL_PROFICIENCY_ORDER), 0);
  });
});

describe("createLevelBar", () => {
  test("fills one dot per level up to and including the named level", () => {
    for (const [index, level] of SKILL_PROFICIENCY_ORDER.entries()) {
      const bar = createLevelBar(level, SKILL_PROFICIENCY_ORDER);
      assert.strictEqual(bar.children.length, SKILL_PROFICIENCY_ORDER.length);
      assert.strictEqual(filledCount(bar), index + 1, `for ${level}`);
    }
  });

  test("fills three of five dots for practicing behaviour maturity", () => {
    const bar = createLevelBar("practicing", BEHAVIOUR_MATURITY_ORDER);
    assert.strictEqual(bar.children.length, 5);
    assert.strictEqual(filledCount(bar), 3);
  });

  test("fills no dots for a level off the scale", () => {
    const bar = createLevelBar("nonsense", BEHAVIOUR_MATURITY_ORDER);
    assert.strictEqual(bar.children.length, 5);
    assert.strictEqual(filledCount(bar), 0);
  });
});

describe("createLevelDots", () => {
  test("draws the requested total and fills the requested count", () => {
    const bar = createLevelDots(2, 4);
    assert.strictEqual(bar.children.length, 4);
    assert.strictEqual(filledCount(bar), 2);
  });

  test("fills no dots for a negative or missing count", () => {
    assert.strictEqual(filledCount(createLevelDots(-1, 5)), 0);
    assert.strictEqual(filledCount(createLevelDots(undefined, 5)), 0);
  });
});

describe("createLevelCell", () => {
  test("labels the level and fills the matching dots", () => {
    const cell = createLevelCell("role-modeling", BEHAVIOUR_MATURITY_ORDER);
    const [bar, label] = cell.children;
    assert.strictEqual(filledCount(bar), 4);
    assert.strictEqual(label.textContent, "Role Modeling");
  });
});
