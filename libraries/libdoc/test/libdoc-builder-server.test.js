import { test } from "node:test";
import assert from "node:assert/strict";
import { PagesServer } from "../src/index.js";
import { createTestRuntime } from "@forwardimpact/libmock";
import { assertThrowsMessage } from "@forwardimpact/libmock";

test("PagesServer constructor validates dependencies", () => {
  assertThrowsMessage(
    () => new PagesServer(null, null, null, null),
    /fs is required/,
  );

  const mockFs = {};
  assertThrowsMessage(
    () => new PagesServer(mockFs, null, null, null),
    /builder is required/,
  );

  const mockBuilder = {};
  const server = new PagesServer(mockFs, null, null, mockBuilder, {
    runtime: createTestRuntime(),
  });
  assert.ok(server instanceof PagesServer);

  const mockHono = function () {};
  const mockServe = () => {};
  const serverWithHono = new PagesServer(
    mockFs,
    mockHono,
    mockServe,
    mockBuilder,
    { runtime: createTestRuntime() },
  );
  assert.ok(serverWithHono instanceof PagesServer);
});

test("PagesServer stopWatch handles null watcher", () => {
  const mockFs = {};
  const mockHono = function () {};
  const mockServe = () => {};
  const mockBuilder = {};

  const server = new PagesServer(mockFs, mockHono, mockServe, mockBuilder, {
    runtime: createTestRuntime(),
  });

  assert.doesNotThrow(() => server.stopWatch());
});


test("PagesServer handles directory requests correctly", async () => {
  const files = new Map();
  files.set("dist/index.html", "Home");
  files.set("dist/architecture/index.html", "Architecture");
  files.set("dist/concepts/index.html", "Concepts");

  const mockFs = {
    existsSync: (path) => {
      if (
        path === "dist/architecture" ||
        path === "dist/concepts" ||
        path === "dist/concepts/"
      )
        return true;
      return files.has(path);
    },
    statSync: (path) => ({
      isDirectory: () =>
        path === "dist/architecture" ||
        path === "dist/concepts" ||
        path === "dist/concepts/",
    }),
    readFileSync: (path) => files.get(path) || "",
    watch: () => ({ close: () => {} }),
  };

  const mockApp = {
    routes: new Map(),
    get: function (pattern, handler) {
      this.routes.set(pattern, handler);
    },
    fetch: null,
  };

  const mockHono = function () {
    return mockApp;
  };

  const mockServe = () => ({});
  const mockBuilder = {};

  const server = new PagesServer(mockFs, mockHono, mockServe, mockBuilder, {
    runtime: createTestRuntime(),
  });
  server.serve("dist", { port: 3000, hostname: "0.0.0.0" });

  const handler = mockApp.routes.get("*");
  assert.ok(handler, "Should register wildcard route handler");

  const rootResult = await handler({
    req: { path: "/" },
    text: (msg, status) => ({ body: msg, status }),
    body: (content, status, headers) => ({ content, status, headers }),
  });
  assert.strictEqual(rootResult.content, "Home");

  const archResult = await handler({
    req: { path: "/architecture" },
    text: (msg, status) => ({ body: msg, status }),
    body: (content, status, headers) => ({ content, status, headers }),
  });
  assert.strictEqual(archResult.content, "Architecture");

  const conceptsResult = await handler({
    req: { path: "/concepts/" },
    text: (msg, status) => ({ body: msg, status }),
    body: (content, status, headers) => ({ content, status, headers }),
  });
  assert.strictEqual(conceptsResult.content, "Concepts");
});
