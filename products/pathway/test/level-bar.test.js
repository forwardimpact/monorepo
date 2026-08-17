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

describe("interviewToDOM", () => {
  // The section shape matches groupQuestionsIntoSections in
  // formatters/interview/shared.js. Capability sections target a skill
  // proficiency, so they read off the skill scale.
  const view = {
    title: "Data Engineer Level II - Platform",
    totalQuestions: 3,
    expectedDurationMinutes: 45,
    typeInfo: { name: "Mission Fit", description: "Assess technical skills." },
    sections: [
      {
        id: "sql",
        name: "SQL",
        type: "skill",
        level: "working",
        questions: [{ question: "Walk me through a slow query." }],
      },
      {
        id: "delivery",
        name: "delivery",
        type: "capability",
        level: "practitioner",
        questions: [{ question: "Break down this ambiguous request." }],
      },
      {
        id: "collaboration",
        name: "Collaboration",
        type: "behaviour",
        level: "role-modeling",
        questions: [{ question: "Describe a disagreement you resolved." }],
      },
    ],
  };

  test("renders the title, every section, and every question", async () => {
    const { interviewToDOM } = await import(
      "../src/formatters/interview/dom.js"
    );
    const el = interviewToDOM(view, view.typeInfo, { showBackLink: false });

    assert.match(el.querySelector(".page-title").textContent, /Data Engineer/);
    assert.strictEqual(el.querySelectorAll(".question-group").length, 3);
    assert.strictEqual(el.querySelectorAll(".question-text").length, 3);
    assert.match(
      el.querySelectorAll(".question-text")[0].textContent,
      /slow query/,
    );
  });

  test("fills each group's level bar on the scale for its target type", async () => {
    const { interviewToDOM } = await import(
      "../src/formatters/interview/dom.js"
    );
    const el = interviewToDOM(view, view.typeInfo, { showBackLink: false });
    const bars = [...el.querySelectorAll(".question-group .level-bar")];

    // working (skill) = 3, practitioner (skill scale) = 4,
    // role-modeling (behaviour) = 4
    assert.deepStrictEqual(bars.map(filledCount), [3, 4, 4]);
  });
});

describe("progressToDOM", () => {
  const view = {
    fromTitle: "Level I Engineer",
    toTitle: "Level II Engineer",
    skillChanges: [
      {
        id: "s1",
        name: "SQL",
        type: "core",
        fromLevel: "awareness",
        toLevel: "foundational",
        proficiencyChange: 1,
      },
      {
        id: "s2",
        name: "New skill",
        type: "broad",
        fromLevel: null,
        toLevel: "awareness",
        proficiencyChange: 1,
      },
      {
        id: "s3",
        name: "Unchanged",
        type: "supporting",
        fromLevel: "working",
        toLevel: "working",
        proficiencyChange: 0,
      },
    ],
    behaviourChanges: [
      {
        id: "b1",
        name: "Collaboration",
        fromMaturity: "emerging",
        toMaturity: "developing",
        maturityChange: 1,
      },
    ],
    summary: {},
  };

  test("lists only the changed skills and behaviours", async () => {
    const { progressToDOM } = await import("../src/formatters/progress/dom.js");
    const el = progressToDOM(view, { showBackLink: false });

    assert.match(
      el.querySelector(".page-description").textContent,
      /Level I Engineer → Level II Engineer/,
    );
    // Two changed skills plus one changed behaviour. 'Unchanged' drops out.
    assert.strictEqual(el.querySelectorAll("tbody tr").length, 3);
  });

  test("fills the from and to bars, and leaves gained skills without a from bar", async () => {
    const { progressToDOM } = await import("../src/formatters/progress/dom.js");
    const el = progressToDOM(view, { showBackLink: false });
    const rows = [...el.querySelectorAll("tbody tr")];

    const bars = (row) => [...row.querySelectorAll(".level-bar")];
    assert.deepStrictEqual(bars(rows[0]).map(filledCount), [1, 2]);
    // The gained skill has no current level, so it draws one bar only.
    assert.deepStrictEqual(bars(rows[1]).map(filledCount), [1]);
    assert.deepStrictEqual(bars(rows[2]).map(filledCount), [1, 2]);
  });
});
