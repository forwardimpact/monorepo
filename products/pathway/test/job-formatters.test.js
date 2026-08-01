import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { Window } from "happy-dom";

import { jobToMarkdown } from "../src/formatters/job/markdown.js";
import { createJobHeader } from "../src/formatters/job/dom.js";

/**
 * Build a minimal job detail view in the shape that prepareJobDetail produces
 * @param {Object} overrides - Fields to override on the base view
 * @returns {Object}
 */
function makeView(overrides = {}) {
  return {
    title: "Software Engineer Level II",
    disciplineId: "software-engineering",
    disciplineName: "Software Engineering",
    levelId: "J060",
    levelName: "Level II",
    trackId: null,
    trackName: null,
    expectations: {},
    skillMatrix: [],
    behaviourProfile: [],
    derivedResponsibilities: [],
    toolkit: [],
    driverCoverage: [],
    ...overrides,
  };
}

describe("jobToMarkdown heading", () => {
  test("omits the track segment when the view has no track", () => {
    const output = jobToMarkdown(makeView());
    assert.ok(output.includes("Software Engineering × J060\n"));
    assert.ok(!output.includes("null"));
  });

  test("includes the track segment when the view has a track", () => {
    const output = jobToMarkdown(
      makeView({ trackId: "platform", trackName: "Platform" }),
    );
    assert.ok(output.includes("Software Engineering × J060 × Platform"));
  });
});

describe("createJobHeader breadcrumb", () => {
  let win;
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  const savedHTMLElement = globalThis.HTMLElement;

  beforeEach(() => {
    win = new Window({ url: "http://localhost/" });
    globalThis.window = win;
    globalThis.document = win.document;
    // libui's render helpers branch on `instanceof HTMLElement`. Expose it so
    // they recognise element children that `div(...)`/`a(...)` create.
    globalThis.HTMLElement = win.HTMLElement;
  });

  afterEach(() => {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
    globalThis.HTMLElement = savedHTMLElement;
  });

  /**
   * Find the first descendant that matches a predicate (depth-first).
   * happy-dom's querySelector is unreliable under bun, so walk manually.
   * @param {HTMLElement} el - Root element
   * @param {Function} predicate - Match test for each element
   * @returns {HTMLElement|null}
   */
  function findEl(el, predicate) {
    if (predicate(el)) return el;
    for (const child of el.children || []) {
      const found = findEl(child, predicate);
      if (found) return found;
    }
    return null;
  }

  /**
   * Collect hrefs of all anchors inside the page description
   * @param {HTMLElement} header - Rendered job header
   * @returns {{description: HTMLElement, hrefs: string[]}}
   */
  function descriptionLinks(header) {
    const description = findEl(header, (el) =>
      (el.className || "").includes("page-description"),
    );
    const hrefs = [];
    findEl(description, (el) => {
      if (el.tagName === "A") hrefs.push(el.getAttribute("href"));
      return false;
    });
    return { description, hrefs };
  }

  test("omits the track link when the view has no track", () => {
    const header = createJobHeader(makeView(), false);
    const { description, hrefs } = descriptionLinks(header);
    assert.ok(!description.textContent.includes("null"));
    assert.ok(!hrefs.includes("#/track/null"));
    assert.ok(description.textContent.includes("Software Engineering × J060"));
    assert.ok(!description.textContent.includes("J060 ×"));
  });

  test("links the track when the view has a track", () => {
    const header = createJobHeader(
      makeView({ trackId: "platform", trackName: "Platform" }),
      false,
    );
    const { description, hrefs } = descriptionLinks(header);
    assert.ok(hrefs.includes("#/track/platform"));
    assert.ok(description.textContent.includes("× Platform"));
  });
});
