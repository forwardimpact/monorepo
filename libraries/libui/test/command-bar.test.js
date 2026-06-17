import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { Window } from "happy-dom";

import { createCommandBar } from "../src/command-bar.js";
import { createReactive } from "../src/reactive.js";

let win;
const savedWindow = globalThis.window;
const savedDocument = globalThis.document;
const savedNavigator = globalThis.navigator;

beforeEach(() => {
  win = new Window({ url: "http://localhost/" });
  globalThis.window = win;
  globalThis.document = win.document;
  Object.defineProperty(globalThis, "navigator", {
    value: win.navigator,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  globalThis.window = savedWindow;
  globalThis.document = savedDocument;
  Object.defineProperty(globalThis, "navigator", {
    value: savedNavigator,
    configurable: true,
    writable: true,
  });
});

function createMockRouter(initial) {
  const activeRoute = createReactive(initial ?? null);
  return { activeRoute };
}

function getBarParts(container) {
  const root = container.children[0];
  const commandEl = root.children[0];
  const copyBtn = root.children[1];
  return { root, commandEl, copyBtn };
}

describe("createCommandBar", () => {
  test("renders CLI text from activeRoute", () => {
    const ctx = Object.freeze({
      data: {},
      args: Object.freeze({ id: "testing" }),
      options: Object.freeze({}),
    });
    const descriptor = {
      pattern: "/skill/:id",
      page: () => {},
      cli: (c) => `npx fit-pathway skill ${c.args.id}`,
    };
    const router = createMockRouter({ descriptor, ctx });
    const container = win.document.createElement("div");

    const bar = createCommandBar(router, { mountInto: container });
    const { commandEl, copyBtn } = getBarParts(container);

    assert.strictEqual(commandEl.textContent, "npx fit-pathway skill testing");
    assert.strictEqual(copyBtn.disabled, false);

    bar.destroy();
  });

  test("renders empty text when descriptor has no cli slot", () => {
    const ctx = Object.freeze({
      data: {},
      args: Object.freeze({}),
      options: Object.freeze({}),
    });
    const descriptor = { pattern: "/", page: () => {} };
    const router = createMockRouter({ descriptor, ctx });
    const container = win.document.createElement("div");

    const bar = createCommandBar(router, { mountInto: container });
    const { commandEl, copyBtn } = getBarParts(container);

    assert.strictEqual(commandEl.textContent, "");
    assert.strictEqual(copyBtn.disabled, true);

    bar.destroy();
  });

  test("tracks activeRoute sequence: cli-bound → no-cli → cli-bound", () => {
    const router = createMockRouter(null);
    const container = win.document.createElement("div");
    const bar = createCommandBar(router, { mountInto: container });
    const { commandEl, copyBtn } = getBarParts(container);

    assert.strictEqual(commandEl.textContent, "");
    assert.strictEqual(copyBtn.disabled, true);

    const ctx1 = Object.freeze({
      data: {},
      args: Object.freeze({ id: "x" }),
      options: Object.freeze({}),
    });
    router.activeRoute.set({
      descriptor: { pattern: "/skill/:id", page: () => {}, cli: () => "cmd1" },
      ctx: ctx1,
    });
    assert.strictEqual(commandEl.textContent, "cmd1");
    assert.strictEqual(copyBtn.disabled, false);

    router.activeRoute.set({
      descriptor: { pattern: "/about", page: () => {} },
      ctx: ctx1,
    });
    assert.strictEqual(commandEl.textContent, "");
    assert.strictEqual(copyBtn.disabled, true);

    router.activeRoute.set({
      descriptor: { pattern: "/skill/:id", page: () => {}, cli: () => "cmd2" },
      ctx: ctx1,
    });
    assert.strictEqual(commandEl.textContent, "cmd2");
    assert.strictEqual(copyBtn.disabled, false);

    bar.destroy();
  });

  test("destroy removes the root element and unsubscribes", () => {
    const router = createMockRouter(null);
    const container = win.document.createElement("div");
    const bar = createCommandBar(router, { mountInto: container });

    assert.strictEqual(container.children.length, 1);

    bar.destroy();

    assert.strictEqual(container.children.length, 0);
  });
});
