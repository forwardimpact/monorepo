import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { Window } from "happy-dom";

const MODULE_PATH = "../src/lib/first-visit-dismissal.js";
const STORAGE_KEY = "pathway:first-visit-banner:dismissed";

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

/**
 * Re-import the module with a cache bust so each test gets a fresh module
 * graph. The module reads `window.localStorage` lazily inside its functions.
 * A single import would still see the per-test window. The cache-bust guards
 * against any future move of state into the module top level.
 */
async function loadModule() {
  return import(`${MODULE_PATH}?cache-bust=${Math.random()}`);
}

/**
 * Replace `window.localStorage` with an in-memory fake whose `name` method
 * throws. A stub on the real Storage instance is unreliable. The DOM exposes
 * Storage as a proxy. That proxy treats `storage.setItem = …` as a write to a
 * *key* named "setItem". It does not shadow the method. The module reads
 * `window.localStorage` lazily per call. So this helper swaps the whole object
 * on the window. That swap reliably injects a method that throws.
 */
function stubStorageMethod(win, name, impl) {
  const store = new Map();
  const fake = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  fake[name] = impl;
  Object.defineProperty(win, "localStorage", {
    value: fake,
    configurable: true,
  });
}

describe("first-visit-dismissal", () => {
  test("fresh storage — isDismissed returns false", async () => {
    const { isDismissed } = await loadModule();
    assert.strictEqual(isDismissed(), false);
  });

  test("after markDismissed — isDismissed returns true and stores the canonical key", async () => {
    const { isDismissed, markDismissed } = await loadModule();
    markDismissed();
    assert.strictEqual(isDismissed(), true);
    assert.strictEqual(win.localStorage.getItem(STORAGE_KEY), "1");
  });

  test("getItem throws — isDismissed returns false and does not throw", async () => {
    const { isDismissed } = await loadModule();
    stubStorageMethod(win, "getItem", () => {
      throw new Error("storage disabled");
    });
    assert.strictEqual(isDismissed(), false);
  });

  test("setItem throws — markDismissed returns and does not throw", async () => {
    const { isDismissed, markDismissed } = await loadModule();
    stubStorageMethod(win, "setItem", () => {
      throw new Error("quota");
    });
    assert.doesNotThrow(() => markDismissed());
    assert.strictEqual(isDismissed(), false);
  });

  test("window undefined — isDismissed is false and markDismissed is a no-op", async () => {
    const { isDismissed, markDismissed } = await loadModule();
    globalThis.window = undefined;
    try {
      assert.strictEqual(isDismissed(), false);
      assert.doesNotThrow(() => markDismissed());
    } finally {
      globalThis.window = win;
    }
  });
});
