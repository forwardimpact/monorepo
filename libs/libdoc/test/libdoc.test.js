import { test } from "node:test";
import assert from "node:assert/strict";
import { DocsBuilder, DocsServer } from "../index.js";

test("DocsBuilder constructor validates dependencies", () => {
  assert.throws(
    () => new DocsBuilder(null, null, null, null, null, null),
    /fs is required/,
  );

  const mockFs = {};
  assert.throws(
    () => new DocsBuilder(mockFs, null, null, null, null, null),
    /path is required/,
  );

  const mockPath = {};
  assert.throws(
    () => new DocsBuilder(mockFs, mockPath, null, null, null, null),
    /markedParser is required/,
  );

  const mockMarked = Object.assign(() => {}, { use: () => {} });
  assert.throws(
    () => new DocsBuilder(mockFs, mockPath, mockMarked, null, null, null),
    /matterParser is required/,
  );

  const mockMatter = () => {};
  assert.throws(
    () => new DocsBuilder(mockFs, mockPath, mockMarked, mockMatter, null, null),
    /mustacheRender is required/,
  );

  const mockMustache = () => {};
  assert.throws(
    () =>
      new DocsBuilder(
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
  const builder = new DocsBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
  );
  assert.ok(builder instanceof DocsBuilder);
});

test("DocsServer constructor validates dependencies", () => {
  assert.throws(() => new DocsServer(null, null, null, null), /fs is required/);

  const mockFs = {};
  assert.throws(
    () => new DocsServer(mockFs, null, null, null),
    /builder is required/,
  );

  const mockBuilder = {};
  const server = new DocsServer(mockFs, null, null, mockBuilder);
  assert.ok(server instanceof DocsServer);

  // Test with Hono dependencies provided
  const mockHono = function () {};
  const mockServe = () => {};
  const serverWithHono = new DocsServer(
    mockFs,
    mockHono,
    mockServe,
    mockBuilder,
  );
  assert.ok(serverWithHono instanceof DocsServer);
});

test("DocsServer stopWatch handles null watcher", () => {
  const mockFs = {};
  const mockHono = function () {};
  const mockServe = () => {};
  const mockBuilder = {};

  const server = new DocsServer(mockFs, mockHono, mockServe, mockBuilder);

  // Should not throw when watcher is null
  assert.doesNotThrow(() => server.stopWatch());
});

test("DocsBuilder generates correct output paths", async () => {
  const files = new Map();
  const dirs = new Set();

  const mockFs = {
    existsSync: (path) => {
      if (path.endsWith("index.template.html")) return true;
      if (path.endsWith("assets")) return false;
      if (path.endsWith("public")) return false;
      return files.has(path) || dirs.has(path);
    },
    mkdirSync: (path) => {
      dirs.add(path);
    },
    rmSync: () => {},
    readdirSync: (path) => {
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

  const builder = new DocsBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
  );

  await builder.build("docs", "dist");

  // Verify index.md → dist/index.html
  assert.ok(files.has("dist/index.html"), "index.html should be at root");

  // Verify architecture.md → dist/architecture/index.html
  assert.ok(
    dirs.has("dist/architecture"),
    "architecture directory should be created",
  );
  assert.ok(
    files.has("dist/architecture/index.html"),
    "architecture/index.html should exist",
  );

  // Verify concepts.md → dist/concepts/index.html
  assert.ok(dirs.has("dist/concepts"), "concepts directory should be created");
  assert.ok(
    files.has("dist/concepts/index.html"),
    "concepts/index.html should exist",
  );
});

test("DocsBuilder handles multiple markdown files correctly", async () => {
  const files = new Map();
  const dirs = new Set();

  const mockFs = {
    existsSync: (path) => {
      if (path.endsWith("index.template.html")) return true;
      if (path.endsWith("assets")) return false;
      if (path.endsWith("public")) return false;
      return files.has(path) || dirs.has(path);
    },
    mkdirSync: (path) => {
      dirs.add(path);
    },
    rmSync: () => {},
    readdirSync: (path) => {
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
  };

  const mockMarked = Object.assign((md) => `<p>${md}</p>`, { use: () => {} });
  const mockMatter = (_content) => ({
    data: { title: "Test" },
    content: "Content",
  });
  const mockMustache = (template, context) => context.title;
  const mockPrettier = { format: async (html) => html };

  const builder = new DocsBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
  );

  await builder.build("docs", "dist");

  // Verify all files are created with correct paths
  assert.ok(files.has("dist/index.html"));
  assert.ok(files.has("dist/reference/index.html"));
  assert.ok(files.has("dist/configuration/index.html"));
  assert.ok(files.has("dist/deployment/index.html"));

  // Verify directories were created
  assert.ok(dirs.has("dist/reference"));
  assert.ok(dirs.has("dist/configuration"));
  assert.ok(dirs.has("dist/deployment"));
});

test("DocsBuilder skips CLAUDE.md and SKILL.md files", async () => {
  const files = new Map();
  const dirs = new Set();

  const mockFs = {
    existsSync: (path) => {
      if (path.endsWith("index.template.html")) return true;
      if (path.endsWith("assets")) return false;
      if (path.endsWith("public")) return false;
      return files.has(path) || dirs.has(path);
    },
    mkdirSync: (path) => {
      dirs.add(path);
    },
    rmSync: () => {},
    readdirSync: (path) => {
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
  };

  const mockMarked = Object.assign((md) => `<p>${md}</p>`, { use: () => {} });
  const mockMatter = (_content) => ({
    data: { title: "Test" },
    content: "Content",
  });
  const mockMustache = (template, context) => context.title;
  const mockPrettier = { format: async (html) => html };

  const builder = new DocsBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
  );

  await builder.build("docs", "dist");

  // CLAUDE.md and SKILL.md should not be built
  assert.ok(
    !files.has("dist/CLAUDE/index.html"),
    "CLAUDE.md should be skipped",
  );
  assert.ok(!files.has("dist/SKILL/index.html"), "SKILL.md should be skipped");

  // Regular markdown files should still be built
  assert.ok(files.has("dist/index.html"), "index.html should exist");
  assert.ok(
    files.has("dist/guide/index.html"),
    "guide/index.html should exist",
  );
});

test("DocsServer handles directory requests correctly", async () => {
  const files = new Map();
  files.set("dist/index.html", "Home");
  files.set("dist/architecture/index.html", "Architecture");
  files.set("dist/concepts/index.html", "Concepts");

  const mockFs = {
    existsSync: (path) => {
      // Handle both directory and file checks
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

  const server = new DocsServer(mockFs, mockHono, mockServe, mockBuilder);
  server.serve("dist", { port: 3000, hostname: "0.0.0.0" });

  // Get the handler for "*"
  const handler = mockApp.routes.get("*");
  assert.ok(handler, "Should register wildcard route handler");

  // Test root request
  const rootResult = await handler({
    req: { path: "/" },
    text: (msg, status) => ({ body: msg, status }),
    body: (content, status, headers) => ({ content, status, headers }),
  });
  assert.strictEqual(rootResult.content, "Home");

  // Test directory request without trailing slash
  const archResult = await handler({
    req: { path: "/architecture" },
    text: (msg, status) => ({ body: msg, status }),
    body: (content, status, headers) => ({ content, status, headers }),
  });
  assert.strictEqual(archResult.content, "Architecture");

  // Test directory request with trailing slash
  const conceptsResult = await handler({
    req: { path: "/concepts/" },
    text: (msg, status) => ({ body: msg, status }),
    body: (content, status, headers) => ({ content, status, headers }),
  });
  assert.strictEqual(conceptsResult.content, "Concepts");
});
