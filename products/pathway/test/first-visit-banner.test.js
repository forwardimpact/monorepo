import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { Window } from "happy-dom";

import { createFirstVisitBanner } from "../src/components/first-visit-banner.js";

let win;
const savedWindow = globalThis.window;
const savedDocument = globalThis.document;
const savedNavigator = globalThis.navigator;
const savedHTMLElement = globalThis.HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.navigator = win.navigator;
  // libui's render helpers branch on `instanceof HTMLElement`; expose it so
  // element children created via `section(...)`/`p(...)` are recognised.
  globalThis.HTMLElement = win.HTMLElement;
});

afterEach(() => {
  globalThis.window = savedWindow;
  globalThis.document = savedDocument;
  globalThis.navigator = savedNavigator;
  globalThis.HTMLElement = savedHTMLElement;
});

function findById(el, id) {
  if (el.getAttribute && el.getAttribute("id") === id) return el;
  for (const child of el.children) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return null;
}

function findAllByTag(el, tagName) {
  const matches = [];
  const upper = tagName.toUpperCase();
  function walk(node) {
    if (node.tagName === upper) matches.push(node);
    for (const child of node.children) walk(child);
  }
  for (const child of el.children) walk(child);
  return matches;
}

describe("createFirstVisitBanner", () => {
  test("returns a <section> with the spec-required ARIA wiring", () => {
    const el = createFirstVisitBanner({ onDismiss: () => {} });
    assert.strictEqual(el.tagName, "SECTION");
    assert.strictEqual(el.getAttribute("role"), "region");
    assert.strictEqual(
      el.getAttribute("aria-labelledby"),
      "first-visit-heading",
    );
    assert.strictEqual(el.getAttribute("aria-live"), "polite");
    const heading = findById(el, "first-visit-heading");
    assert.ok(heading, "expected an element with id=first-visit-heading");
    assert.strictEqual(heading.tagName, "H2");
  });

  test("exposes exactly one dismiss button labelled 'Got it' and no checkbox", () => {
    const el = createFirstVisitBanner({ onDismiss: () => {} });
    const buttons = findAllByTag(el, "button");
    assert.strictEqual(buttons.length, 1);
    assert.strictEqual(buttons[0].textContent, "Got it");
    const inputs = findAllByTag(el, "input");
    for (const input of inputs) {
      assert.notStrictEqual(
        input.getAttribute("type"),
        "checkbox",
        "banner must not contain a checkbox input",
      );
    }
  });

  test("clicking the dismiss button invokes onDismiss exactly once", () => {
    let calls = 0;
    const el = createFirstVisitBanner({
      onDismiss: () => {
        calls += 1;
      },
    });
    const btn = findAllByTag(el, "button")[0];
    btn.click();
    assert.strictEqual(calls, 1);
  });

  test("dismiss element is a native button with no tabindex override", () => {
    const el = createFirstVisitBanner({ onDismiss: () => {} });
    const btn = findAllByTag(el, "button")[0];
    // Native buttons are Tab-reachable and Enter/Space-activatable by default;
    // any tabindex attribute would override that behaviour.
    assert.strictEqual(btn.tagName, "BUTTON");
    assert.strictEqual(btn.hasAttribute("tabindex"), false);
    assert.strictEqual(btn.getAttribute("type"), "button");
  });
});
