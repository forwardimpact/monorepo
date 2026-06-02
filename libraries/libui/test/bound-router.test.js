import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";

import { createBoundRouter } from "../src/bound-router.js";
import { defineRoute } from "../src/route-descriptor.js";

let win;
const savedWindow = globalThis.window;
const savedHistory = globalThis.history;
const savedDocument = globalThis.document;

beforeEach(() => {
  win = new JSDOM("", { url: "http://localhost/" }).window;
  // jsdom emits a "Not implemented" notice for scrollTo; the router calls it on
  // every route match, so stub it to a no-op (happy-dom implemented it silently).
  win.scrollTo = () => {};
  globalThis.window = win;
  globalThis.history = win.history;
  globalThis.document = win.document;
});

afterEach(() => {
  globalThis.window = savedWindow;
  globalThis.history = savedHistory;
  globalThis.document = savedDocument;
});

describe("createBoundRouter", () => {
  test("matches a route with :id param and query options", () => {
    const pages = [];
    const router = createBoundRouter({
      data: { skills: [] },
    });
    router.register(
      defineRoute({
        pattern: "/skill/:id",
        page: (ctx) => pages.push(ctx),
      }),
    );

    win.location.hash = "#/skill/testing?json=1&tag=a&tag=b";
    router.start();

    assert.strictEqual(pages.length, 1);
    const ctx = pages[0];
    assert.strictEqual(ctx.args.id, "testing");
    assert.strictEqual(ctx.options.json, "1");
    assert.deepStrictEqual(ctx.options.tag, ["a", "b"]);

    router.stop();
  });

  test("triggers onNotFound for unmatched paths", () => {
    const notFound = [];
    const router = createBoundRouter({
      onNotFound: (path) => notFound.push(path),
    });
    router.register(defineRoute({ pattern: "/skill/:id", page: () => {} }));

    win.location.hash = "#/unknown";
    router.start();

    assert.strictEqual(notFound.length, 1);
    assert.strictEqual(notFound[0], "/unknown");

    router.stop();
  });

  test("activeRoute subscribers fire on route change", () => {
    const received = [];
    const router = createBoundRouter({
      data: { skills: [] },
    });
    const desc = defineRoute({
      pattern: "/skill/:id",
      page: () => {},
    });
    router.register(desc);
    router.activeRoute.subscribe((entry) => received.push(entry));

    win.location.hash = "#/skill/testing";
    router.start();

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].descriptor, desc);
    assert.strictEqual(received[0].ctx.args.id, "testing");

    router.stop();
  });

  test("activeRoute updates on history.replaceState", () => {
    const received = [];
    const router = createBoundRouter({
      data: {},
    });
    router.register(defineRoute({ pattern: "/a", page: () => {} }));
    router.register(defineRoute({ pattern: "/b", page: () => {} }));
    router.activeRoute.subscribe((entry) => received.push(entry));

    win.location.hash = "#/a";
    router.start();

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].descriptor.pattern, "/a");

    win.history.replaceState(null, "", "#/b");

    assert.strictEqual(received.length, 2);
    assert.strictEqual(received[1].descriptor.pattern, "/b");

    router.stop();
  });

  test("routes() returns registered descriptors", () => {
    const router = createBoundRouter();
    const d1 = defineRoute({ pattern: "/a", page: () => {} });
    const d2 = defineRoute({ pattern: "/b", page: () => {} });
    router.register(d1);
    router.register(d2);

    const result = router.routes();
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0], d1);
    assert.strictEqual(result[1], d2);
  });

  test("stop() restores original history.replaceState", () => {
    const original = win.history.replaceState;
    const router = createBoundRouter({ data: {} });
    router.register(defineRoute({ pattern: "/a", page: () => {} }));

    win.location.hash = "#/a";
    router.start();

    assert.notStrictEqual(win.history.replaceState, original);

    router.stop();

    assert.strictEqual(win.history.replaceState, original);
  });

  test("double start() does not double-wrap replaceState", () => {
    const router = createBoundRouter({ data: {} });
    router.register(defineRoute({ pattern: "/a", page: () => {} }));

    win.location.hash = "#/a";
    router.start();
    const patchedFirst = win.history.replaceState;
    router.start();
    assert.strictEqual(win.history.replaceState, patchedFirst);

    router.stop();
  });

  test("empty-value query param becomes true", () => {
    const pages = [];
    const router = createBoundRouter({ data: {} });
    router.register(
      defineRoute({
        pattern: "/skill/:id",
        page: (ctx) => pages.push(ctx),
      }),
    );

    win.location.hash = "#/skill/testing?json";
    router.start();

    assert.strictEqual(pages[0].options.json, true);

    router.stop();
  });

  test("activeRoute is null for unmatched path", () => {
    const received = [];
    const router = createBoundRouter({
      onNotFound: () => {},
    });
    router.register(defineRoute({ pattern: "/skill/:id", page: () => {} }));
    router.activeRoute.subscribe((entry) => received.push(entry));

    win.location.hash = "#/unknown";
    router.start();

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0], null);

    router.stop();
  });

  test("page receives vocabularyBase", () => {
    const calls = [];
    const router = createBoundRouter({
      data: {},
      vocabularyBase: "https://example.invalid/schema/rdf/",
    });
    router.register(
      defineRoute({
        pattern: "/skill/:id",
        page: (ctx, opts) => calls.push(opts),
      }),
    );

    win.location.hash = "#/skill/testing";
    router.start();

    assert.strictEqual(
      calls[0].vocabularyBase,
      "https://example.invalid/schema/rdf/",
    );

    router.stop();
  });
});
