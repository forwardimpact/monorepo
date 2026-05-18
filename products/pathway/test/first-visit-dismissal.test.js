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
  win = new Window({ url: "http://localhost" });
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.navigator = win.navigator;
});

afterEach(() => {
  globalThis.window = savedWindow;
  globalThis.document = savedDocument;
  globalThis.navigator = savedNavigator;
});

/**
 * Re-import the module with cache busting so each test gets a fresh module
 * graph. The module reads `window.localStorage` lazily inside its functions,
 * so a single import would still see the per-test window — the cache-bust
 * guards against any future hoisting of state into module top level.
 */
async function loadModule() {
  return import(`${MODULE_PATH}?cache-bust=${Math.random()}`);
}

/**
 * Override a Storage method using defineProperty. Reassigning directly on the
 * instance is a no-op in happy-dom because the methods live on the Storage
 * prototype; defineProperty installs an own property that shadows the
 * prototype method.
 */
function stubStorageMethod(storage, name, impl) {
  Object.defineProperty(storage, name, {
    value: impl,
    writable: true,
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
    stubStorageMethod(win.localStorage, "getItem", () => {
      throw new Error("storage disabled");
    });
    assert.strictEqual(isDismissed(), false);
  });

  test("setItem throws — markDismissed returns without throwing", async () => {
    const { isDismissed, markDismissed } = await loadModule();
    stubStorageMethod(win.localStorage, "setItem", () => {
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
