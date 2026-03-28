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

  // Verify markdown companions
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

test("DocsBuilder handles multiple markdown files correctly", async () => {
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

// --- SEO and LLM optimization tests ---

/**
 * Create a mock fs/path/builder setup for SEO tests
 * @param {object} options
 * @param {Map<string, string>} options.sourceFiles - Map of path → content for source files
 * @param {string[]} options.mdFiles - Markdown file names in source dir
 * @param {string[]} [options.rootFiles] - Non-md files in source root
 * @param {string} [options.template] - Template content
 * @returns {{ files: Map, dirs: Set, builder: DocsBuilder, copied: Map }}
 */
function createTestHarness({
  sourceFiles,
  mdFiles,
  rootFiles = [],
  template = '<html><head>{{markdownUrl}}{{canonicalUrl}}</head><body>{{title}}</body></html>',
}) {
  const files = new Map();
  const dirs = new Set();
  const copied = new Map();

  const allRootEntries = [
    ...mdFiles.map((n) => ({ name: n, isFile: () => true })),
    ...rootFiles.map((n) => ({ name: n, isFile: () => true })),
    { name: "index.template.html", isFile: () => true },
  ];

  const mockFs = {
    existsSync: (p) => {
      if (p.endsWith("index.template.html")) return true;
      if (p.endsWith("assets")) return false;
      return files.has(p) || dirs.has(p) || sourceFiles.has(p);
    },
    mkdirSync: (p) => dirs.add(p),
    rmSync: () => {},
    readdirSync: (p, opts) => {
      if (opts?.withFileTypes) {
        if (p === "src") return allRootEntries;
        return [];
      }
      if (p === "src") return mdFiles;
      return [];
    },
    readFileSync: (p) => {
      if (p.endsWith("index.template.html")) return template;
      if (sourceFiles.has(p)) return sourceFiles.get(p);
      if (files.has(p)) return files.get(p);
      return "";
    },
    writeFileSync: (p, content) => files.set(p, content),
    statSync: () => ({ isFile: () => true }),
    copyFileSync: (s, d) => {
      copied.set(d, sourceFiles.get(s) || "");
      files.set(d, sourceFiles.get(s) || "");
    },
  };

  const mockPath = {
    join: (...parts) => parts.join("/"),
    dirname: (p) => p.split("/").slice(0, -1).join("/") || ".",
  };

  const mockMarked = Object.assign((md) => `<p>${md}</p>`, { use: () => {} });
  const mockMatter = (content) => {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (match) {
      const data = {};
      for (const line of match[1].split("\n")) {
        const kv = line.match(/^(\w+): (.+)$/);
        if (kv) data[kv[1]] = kv[2];
      }
      return { data, content: match[2] };
    }
    return { data: {}, content };
  };
  const mockMustache = (tpl, ctx) =>
    tpl
      .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) =>
        ctx[key] ? inner.replace(/\{\{(\w+)\}\}/g, (__, k) => ctx[k] || "") : "",
      )
      .replace(/\{\{(\w+)\}\}/g, (_, key) => ctx[key] || "");
  const mockPrettier = { format: async (html) => html };

  const builder = new DocsBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
  );

  return { files, dirs, copied, builder };
}

test("DocsBuilder writes markdown companion with title prepend", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nWelcome content"],
    ["src/about.md", "---\ntitle: About\n---\nAbout content"],
  ]);

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md", "about.md"],
  });

  await builder.build("src", "dist");

  assert.ok(files.has("dist/index.md"), "root companion exists");
  assert.ok(files.has("dist/about/index.md"), "about companion exists");

  const rootMd = files.get("dist/index.md");
  assert.ok(rootMd.startsWith("# Home\n\n"), "companion starts with # title");
  assert.ok(rootMd.includes("Welcome content"), "companion has body");

  const aboutMd = files.get("dist/about/index.md");
  assert.ok(aboutMd.startsWith("# About\n\n"), "about companion starts with # title");
});

test("DocsBuilder transforms markdown body links in companions", async () => {
  const sourceFiles = new Map([
    [
      "src/index.md",
      "---\ntitle: Home\n---\nSee [About](./about.md) and [Core](core.md) and [Docs](docs/index.md) and [Ref](./index.md) and [Hash](core.md#section)",
    ],
  ]);

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md"],
  });

  await builder.build("src", "dist");

  const md = files.get("dist/index.md");
  assert.ok(md.includes("[About](./about/)"), "./file.md → ./file/");
  assert.ok(md.includes("[Core](core/)"), "file.md → file/");
  assert.ok(md.includes("[Docs](docs/)"), "dir/index.md → dir/");
  assert.ok(md.includes("[Ref](./)"), "./index.md → ./");
  assert.ok(md.includes("[Hash](core/#section)"), "hash fragment preserved");
});

test("DocsBuilder generates sitemap.xml with baseUrl", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
    ["src/about.md", "---\ntitle: About\n---\nContent"],
  ]);

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md", "about.md"],
  });

  await builder.build("src", "dist", "https://example.com");

  assert.ok(files.has("dist/sitemap.xml"), "sitemap.xml should be generated");
  const sitemap = files.get("dist/sitemap.xml");
  assert.ok(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  assert.ok(sitemap.includes("<loc>https://example.com/</loc>"));
  assert.ok(sitemap.includes("<loc>https://example.com/about/</loc>"));
});

test("DocsBuilder sorts sitemap entries alphabetically", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
    ["src/zebra.md", "---\ntitle: Zebra\n---\nContent"],
    ["src/about.md", "---\ntitle: About\n---\nContent"],
  ]);

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md", "zebra.md", "about.md"],
  });

  await builder.build("src", "dist", "https://example.com");

  const sitemap = files.get("dist/sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepStrictEqual(locs, [
    "https://example.com/",
    "https://example.com/about/",
    "https://example.com/zebra/",
  ]);
});

test("DocsBuilder skips sitemap when no baseUrl", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
  ]);

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md"],
  });

  await builder.build("src", "dist");

  assert.ok(!files.has("dist/sitemap.xml"), "no sitemap without baseUrl");
  // Companions should still be produced
  assert.ok(files.has("dist/index.md"), "companion still produced without baseUrl");
});

test("DocsBuilder adds alternate and canonical link tags", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
  ]);

  const template =
    '<head><link rel="alternate" type="text/markdown" href="{{markdownUrl}}" />{{#canonicalUrl}}<link rel="canonical" href="{{canonicalUrl}}" />{{/canonicalUrl}}</head>';

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md"],
    template,
  });

  await builder.build("src", "dist", "https://example.com");

  const html = files.get("dist/index.html");
  assert.ok(html.includes('href="index.md"'), "alternate link present");
  assert.ok(
    html.includes('href="https://example.com/"'),
    "canonical link present",
  );
});

test("DocsBuilder omits canonical tag when no baseUrl", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
  ]);

  const template =
    '<head><link rel="alternate" type="text/markdown" href="{{markdownUrl}}" />{{#canonicalUrl}}<link rel="canonical" href="{{canonicalUrl}}" />{{/canonicalUrl}}</head>';

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md"],
    template,
  });

  await builder.build("src", "dist");

  const html = files.get("dist/index.html");
  assert.ok(html.includes('href="index.md"'), "alternate still present");
  assert.ok(!html.includes("rel=\"canonical\""), "no canonical without baseUrl");
});

test("DocsBuilder augments llms.txt with page links", async () => {
  const llmsContent = [
    "# Test Site",
    "",
    "> Description",
    "",
    "## Products",
    "",
    "## Documentation",
    "",
    "## Optional",
    "",
  ].join("\n");

  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
    ["src/about.md", "---\ntitle: About\ndescription: About page\n---\nContent"],
    ["src/map.md", "---\ntitle: Map\ndescription: Data product\n---\nContent"],
    ["src/llms.txt", llmsContent],
  ]);

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md", "about.md", "map.md"],
    rootFiles: ["llms.txt"],
  });

  await builder.build("src", "dist", "https://example.com");

  assert.ok(files.has("dist/llms.txt"), "llms.txt should exist");
  const llms = files.get("dist/llms.txt");

  // Product pages under Products section
  assert.ok(
    llms.includes("- [Map](https://example.com/map/index.md): Data product"),
    "map under Products",
  );

  // Optional pages
  assert.ok(
    llms.includes("- [Home](https://example.com/index.md)"),
    "home under Optional",
  );
  assert.ok(
    llms.includes("- [About](https://example.com/about/index.md): About page"),
    "about under Optional",
  );
});

test("DocsBuilder skips llms.txt when no curated file exists", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
  ]);

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md"],
  });

  await builder.build("src", "dist", "https://example.com");

  assert.ok(!files.has("dist/llms.txt"), "no llms.txt without curated file");
});

test("DocsBuilder uses CNAME fallback when no baseUrl provided", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
    ["src/CNAME", "example.com"],
  ]);

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md"],
  });

  await builder.build("src", "dist");

  assert.ok(files.has("dist/sitemap.xml"), "sitemap generated from CNAME");
  const sitemap = files.get("dist/sitemap.xml");
  assert.ok(
    sitemap.includes("<loc>https://example.com/</loc>"),
    "CNAME-derived URL used",
  );
});

test("DocsBuilder prefers explicit baseUrl over CNAME", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
    ["src/CNAME", "cname.example.com"],
  ]);

  const { files, builder } = createTestHarness({
    sourceFiles,
    mdFiles: ["index.md"],
  });

  await builder.build("src", "dist", "https://explicit.example.com");

  const sitemap = files.get("dist/sitemap.xml");
  assert.ok(
    sitemap.includes("<loc>https://explicit.example.com/</loc>"),
    "explicit baseUrl takes precedence",
  );
  assert.ok(
    !sitemap.includes("cname.example.com"),
    "CNAME not used when explicit baseUrl given",
  );
});

test("DocsBuilder copies root-level static files and skips .md, template, CNAME", async () => {
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
    ["src/robots.txt", "User-agent: *"],
    ["src/favicon.ico", "icon-data"],
    ["src/CNAME", "example.com"],
    ["src/index.template.html", "template"],
  ]);

  const allRootEntries = [
    { name: "index.md", isFile: () => true },
    { name: "robots.txt", isFile: () => true },
    { name: "favicon.ico", isFile: () => true },
    { name: "CNAME", isFile: () => true },
    { name: "index.template.html", isFile: () => true },
    { name: "docs", isFile: () => false },
  ];

  const files = new Map();
  const dirs = new Set();
  const copied = new Map();

  const mockFs = {
    existsSync: (p) => {
      if (p.endsWith("index.template.html")) return true;
      if (p.endsWith("assets")) return false;
      return files.has(p) || dirs.has(p) || sourceFiles.has(p);
    },
    mkdirSync: (p) => dirs.add(p),
    rmSync: () => {},
    readdirSync: (p, opts) => {
      if (opts?.withFileTypes) {
        if (p === "src") return allRootEntries;
        return [];
      }
      if (p === "src") return ["index.md"];
      return [];
    },
    readFileSync: (p) => {
      if (p.endsWith("index.template.html")) return "{{title}}";
      if (sourceFiles.has(p)) return sourceFiles.get(p);
      if (files.has(p)) return files.get(p);
      return "";
    },
    writeFileSync: (p, content) => files.set(p, content),
    statSync: () => ({ isFile: () => true }),
    copyFileSync: (s, d) => {
      copied.set(d, s);
      files.set(d, sourceFiles.get(s) || "");
    },
  };

  const mockPath = {
    join: (...parts) => parts.join("/"),
    dirname: (p) => p.split("/").slice(0, -1).join("/") || ".",
  };

  const mockMarked = Object.assign((md) => `<p>${md}</p>`, { use: () => {} });
  const mockMatter = (_content) => ({
    data: { title: "Home" },
    content: "Content",
  });
  const mockMustache = (_tpl, ctx) => ctx.title;
  const mockPrettier = { format: async (html) => html };

  const builder = new DocsBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
  );

  await builder.build("src", "dist");

  assert.ok(copied.has("dist/robots.txt"), "robots.txt copied");
  assert.ok(copied.has("dist/favicon.ico"), "favicon.ico copied");
  assert.ok(!copied.has("dist/CNAME"), "CNAME not copied");
  assert.ok(!copied.has("dist/index.template.html"), "template not copied");
  assert.ok(!copied.has("dist/index.md") || !copied.get("dist/index.md")?.includes("src/index.md"), ".md not copied as static");
});

test("DocsBuilder classifies docs pages under Documentation in llms.txt", async () => {
  const llmsContent = "# Site\n\n## Products\n\n## Documentation\n\n## Optional\n";

  // We need a mock that handles subdirectories for docs/
  const sourceFiles = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nContent"],
    ["src/llms.txt", llmsContent],
  ]);

  const files = new Map();
  const dirs = new Set();

  const mockFs = {
    existsSync: (p) => {
      if (p.endsWith("index.template.html")) return true;
      if (p.endsWith("assets")) return false;
      return files.has(p) || dirs.has(p) || sourceFiles.has(p);
    },
    mkdirSync: (p) => dirs.add(p),
    rmSync: () => {},
    readdirSync: (p, opts) => {
      if (opts?.withFileTypes) {
        if (p === "src")
          return [
            { name: "index.md", isFile: () => true },
            { name: "llms.txt", isFile: () => true },
            { name: "docs", isFile: () => false },
            { name: "index.template.html", isFile: () => true },
          ];
        return [];
      }
      if (p === "src") return ["index.md", "docs"];
      if (p === "src/docs") return ["map.md"];
      return [];
    },
    readFileSync: (p) => {
      if (p.endsWith("index.template.html")) return "{{title}}";
      if (p === "src/docs/map.md") return "---\ntitle: Map Docs\n---\nContent";
      if (sourceFiles.has(p)) return sourceFiles.get(p);
      if (files.has(p)) return files.get(p);
      return "";
    },
    writeFileSync: (p, content) => files.set(p, content),
    statSync: (p) => ({
      isDirectory: () => p === "src/docs",
      isFile: () => p !== "src/docs",
    }),
    copyFileSync: (s, d) => files.set(d, sourceFiles.get(s) || ""),
  };

  const mockPath = {
    join: (...parts) => parts.join("/"),
    dirname: (p) => p.split("/").slice(0, -1).join("/") || ".",
  };

  const mockMarked = Object.assign((md) => `<p>${md}</p>`, { use: () => {} });
  const mockMatter = (content) => {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (match) {
      const data = {};
      for (const line of match[1].split("\n")) {
        const kv = line.match(/^(\w+): (.+)$/);
        if (kv) data[kv[1]] = kv[2];
      }
      return { data, content: match[2] };
    }
    return { data: {}, content };
  };
  const mockMustache = (_tpl, ctx) => ctx.title;
  const mockPrettier = { format: async (html) => html };

  const builder = new DocsBuilder(
    mockFs,
    mockPath,
    mockMarked,
    mockMatter,
    mockMustache,
    mockPrettier,
  );

  await builder.build("src", "dist", "https://example.com");

  const llms = files.get("dist/llms.txt");
  // docs/map.md → /docs/map/ → Documentation section
  const docSection = llms.split("## Documentation")[1].split("## Optional")[0];
  assert.ok(
    docSection.includes("[Map Docs]"),
    "docs page classified under Documentation",
  );
});
