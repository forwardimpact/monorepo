import { test } from "node:test";
import assert from "node:assert/strict";
import { DocsBuilder } from "../index.js";

function createTestHarness({
  sourceFiles,
  mdFiles,
  rootFiles = [],
  template = "<html><head>{{markdownUrl}}{{canonicalUrl}}</head><body>{{title}}</body></html>",
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
        ctx[key]
          ? inner.replace(/\{\{(\w+)\}\}/g, (__, k) => ctx[k] || "")
          : "",
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
    [
      "src/about.md",
      "---\ntitle: About\ndescription: About page\n---\nContent",
    ],
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
  assert.ok(
    !copied.has("dist/index.md") ||
      !copied.get("dist/index.md")?.includes("src/index.md"),
    ".md not copied as static",
  );
});

test("DocsBuilder classifies docs pages under Documentation in llms.txt", async () => {
  const llmsContent =
    "# Site\n\n## Products\n\n## Documentation\n\n## Optional\n";

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
  const docSection = llms.split("## Documentation")[1].split("## Optional")[0];
  assert.ok(
    docSection.includes("[Map Docs]"),
    "docs page classified under Documentation",
  );
});
