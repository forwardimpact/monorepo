import { test } from "node:test";
import assert from "node:assert/strict";
import { PagesBuilder, PagesServer } from "../src/index.js";
import { createTestRuntime } from "@forwardimpact/libmock";
import { assertThrowsMessage } from "@forwardimpact/libmock";

test("PagesBuilder constructor validates dependencies", () => {
  assertThrowsMessage(
    () => new PagesBuilder(null, null, null, null, null, null),
    /fs is required/,
  );

  const mockFs = {};
  assertThrowsMessage(
    () => new PagesBuilder(mockFs, null, null, null, null, null),
    /path is required/,
  );

  const mockPath = {};
  assertThrowsMessage(
    () => new PagesBuilder(mockFs, mockPath, null, null, null, null),
    /markedParser is required/,
  );

  const mockMarked = Object.assign(() => {}, { use: () => {} });
  assertThrowsMessage(
    () => new PagesBuilder(mockFs, mockPath, mockMarked, null, null, null),
    /matterParser is required/,
  );

  const mockMatter = () => {};
  assertThrowsMessage(
    () =>
      new PagesBuilder(mockFs, mockPath, mockMarked, mockMatter, null, null),
    /mustacheRender is required/,
  );

  const mockMustache = () => {};
  assertThrowsMessage(
    () =>
      new PagesBuilder(
        mockFs,
        mockPath,
        mockMarked,
        mockMatter,
        mockMustache,
        null,
      ),
    /prettier is required/,
  );

  const mockPrettier = { format: async (html) => html };
  const builder = new PagesBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
    createTestRuntime(),
  );
  assert.ok(builder instanceof PagesBuilder);
});

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

test("PagesBuilder generates correct output paths", async () => {
  const files = new Map();
  const dirs = new Set();

  const mockFs = {
    existsSync: (path) => {
      if (path.endsWith("index.template.html")) return true;
      if (path.endsWith("assets")) return false;
      return files.has(path) || dirs.has(path);
    },
    mkdirSync: (path) => {
      dirs.add(path);
    },
    rmSync: () => {},
    readdirSync: (path, opts) => {
      if (opts?.withFileTypes) {
        return [];
      }
      if (path.includes("docs")) {
        return ["index.md", "architecture.md", "concepts.md"];
      }
      return [];
    },
    readFileSync: (path) => {
      if (path.endsWith("index.template.html")) {
        return "{{title}}: {{content}}";
      }
      if (path.endsWith("index.md")) {
        return "---\ntitle: Home\n---\n# Welcome";
      }
      if (path.endsWith("architecture.md")) {
        return "---\ntitle: Architecture\n---\n# Architecture";
      }
      if (path.endsWith("concepts.md")) {
        return "---\ntitle: Concepts\n---\n# Concepts";
      }
      return "";
    },
    writeFileSync: (path, content) => {
      files.set(path, content);
    },
    statSync: () => ({ isFile: () => true }),
    copyFileSync: () => {},
  };

  const mockPath = {
    join: (...parts) => parts.join("/"),
    dirname: (p) => p.split("/").slice(0, -1).join("/") || ".",
    normalize: (p) => {
      const parts = p.split("/").filter(Boolean);
      const result = [];
      for (const part of parts) {
        if (part === "..") result.pop();
        else if (part !== ".") result.push(part);
      }
      return result.join("/") || ".";
    },
    relative: (from, to) => {
      const f = from.split("/").filter(Boolean);
      const t = to.split("/").filter(Boolean);
      let i = 0;
      while (i < f.length && i < t.length && f[i] === t[i]) i++;
      const ups = f.length - i;
      return [...Array(ups).fill(".."), ...t.slice(i)].join("/") || ".";
    },
  };

  const mockMarked = Object.assign((md) => `<p>${md}</p>`, { use: () => {} });
  const mockMatter = (content) => {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (match) {
      const title = match[1].match(/title: (.+)/)?.[1];
      return { data: { title }, content: match[2] };
    }
    return { data: {}, content };
  };
  const mockMustache = (template, context) =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || "");
  const mockPrettier = { format: async (html) => html };

  const builder = new PagesBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
    createTestRuntime(),
  );

  await builder.build("docs", "dist");

  assert.ok(files.has("dist/index.html"), "index.html should be at root");

  assert.ok(
    dirs.has("dist/architecture"),
    "architecture directory should be created",
  );
  assert.ok(
    files.has("dist/architecture/index.html"),
    "architecture/index.html should exist",
  );

  assert.ok(dirs.has("dist/concepts"), "concepts directory should be created");
  assert.ok(
    files.has("dist/concepts/index.html"),
    "concepts/index.html should exist",
  );

  assert.ok(files.has("dist/index.md"), "index.md companion should exist");
  assert.ok(
    files.has("dist/architecture/index.md"),
    "architecture/index.md companion should exist",
  );
  assert.ok(
    files.get("dist/index.md").startsWith("# Home"),
    "companion should start with title",
  );
});

test("PagesBuilder handles multiple markdown files correctly", async () => {
  const files = new Map();
  const dirs = new Set();

  const mockFs = {
    existsSync: (path) => {
      if (path.endsWith("index.template.html")) return true;
      if (path.endsWith("assets")) return false;
      return files.has(path) || dirs.has(path);
    },
    mkdirSync: (path) => {
      dirs.add(path);
    },
    rmSync: () => {},
    readdirSync: (path, opts) => {
      if (opts?.withFileTypes) return [];
      if (path.includes("docs")) {
        return [
          "index.md",
          "reference.md",
          "configuration.md",
          "deployment.md",
        ];
      }
      return [];
    },
    readFileSync: (path) => {
      if (path.endsWith("index.template.html")) {
        return "{{title}}";
      }
      return "---\ntitle: Test\n---\nContent";
    },
    writeFileSync: (path, content) => {
      files.set(path, content);
    },
    statSync: () => ({ isFile: () => true }),
    copyFileSync: () => {},
  };

  const mockPath = {
    join: (...parts) => parts.join("/"),
    dirname: (p) => p.split("/").slice(0, -1).join("/") || ".",
    normalize: (p) => {
      const parts = p.split("/").filter(Boolean);
      const result = [];
      for (const part of parts) {
        if (part === "..") result.pop();
        else if (part !== ".") result.push(part);
      }
      return result.join("/") || ".";
    },
    relative: (from, to) => {
      const f = from.split("/").filter(Boolean);
      const t = to.split("/").filter(Boolean);
      let i = 0;
      while (i < f.length && i < t.length && f[i] === t[i]) i++;
      const ups = f.length - i;
      return [...Array(ups).fill(".."), ...t.slice(i)].join("/") || ".";
    },
  };

  const mockMarked = Object.assign((md) => `<p>${md}</p>`, { use: () => {} });
  const mockMatter = (_content) => ({
    data: { title: "Test" },
    content: "Content",
  });
  const mockMustache = (template, context) => context.title;
  const mockPrettier = { format: async (html) => html };

  const builder = new PagesBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
    createTestRuntime(),
  );

  await builder.build("docs", "dist");

  assert.ok(files.has("dist/index.html"));
  assert.ok(files.has("dist/reference/index.html"));
  assert.ok(files.has("dist/configuration/index.html"));
  assert.ok(files.has("dist/deployment/index.html"));

  assert.ok(dirs.has("dist/reference"));
  assert.ok(dirs.has("dist/configuration"));
  assert.ok(dirs.has("dist/deployment"));
});

test("PagesBuilder skips CLAUDE.md and SKILL.md files", async () => {
  const files = new Map();
  const dirs = new Set();

  const mockFs = {
    existsSync: (path) => {
      if (path.endsWith("index.template.html")) return true;
      if (path.endsWith("assets")) return false;
      return files.has(path) || dirs.has(path);
    },
    mkdirSync: (path) => {
      dirs.add(path);
    },
    rmSync: () => {},
    readdirSync: (path, opts) => {
      if (opts?.withFileTypes) return [];
      if (path.includes("docs")) {
        return ["index.md", "CLAUDE.md", "SKILL.md", "guide.md"];
      }
      return [];
    },
    readFileSync: (path) => {
      if (path.endsWith("index.template.html")) {
        return "{{title}}: {{content}}";
      }
      return "---\ntitle: Test\n---\nContent";
    },
    writeFileSync: (path, content) => {
      files.set(path, content);
    },
    statSync: () => ({ isFile: () => true }),
    copyFileSync: () => {},
  };

  const mockPath = {
    join: (...parts) => parts.join("/"),
    dirname: (p) => p.split("/").slice(0, -1).join("/") || ".",
    normalize: (p) => {
      const parts = p.split("/").filter(Boolean);
      const result = [];
      for (const part of parts) {
        if (part === "..") result.pop();
        else if (part !== ".") result.push(part);
      }
      return result.join("/") || ".";
    },
    relative: (from, to) => {
      const f = from.split("/").filter(Boolean);
      const t = to.split("/").filter(Boolean);
      let i = 0;
      while (i < f.length && i < t.length && f[i] === t[i]) i++;
      const ups = f.length - i;
      return [...Array(ups).fill(".."), ...t.slice(i)].join("/") || ".";
    },
  };

  const mockMarked = Object.assign((md) => `<p>${md}</p>`, { use: () => {} });
  const mockMatter = (_content) => ({
    data: { title: "Test" },
    content: "Content",
  });
  const mockMustache = (template, context) => context.title;
  const mockPrettier = { format: async (html) => html };

  const builder = new PagesBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
    createTestRuntime(),
  );

  await builder.build("docs", "dist");

  assert.ok(
    !files.has("dist/CLAUDE/index.html"),
    "CLAUDE.md should be skipped",
  );
  assert.ok(!files.has("dist/SKILL/index.html"), "SKILL.md should be skipped");

  assert.ok(files.has("dist/index.html"), "index.html should exist");
  assert.ok(
    files.has("dist/guide/index.html"),
    "guide/index.html should exist",
  );
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
