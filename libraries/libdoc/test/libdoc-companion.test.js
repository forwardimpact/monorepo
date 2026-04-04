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
  assert.ok(
    aboutMd.startsWith("# About\n\n"),
    "about companion starts with # title",
  );
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
  assert.ok(md.includes("[About](./about/)"), "./file.md -> ./file/");
  assert.ok(md.includes("[Core](core/)"), "file.md -> file/");
  assert.ok(md.includes("[Docs](docs/)"), "dir/index.md -> dir/");
  assert.ok(md.includes("[Ref](./)"), "./index.md -> ./");
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
  assert.ok(
    sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'),
  );
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
  assert.ok(
    files.has("dist/index.md"),
    "companion still produced without baseUrl",
  );
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
  assert.ok(!html.includes('rel="canonical"'), "no canonical without baseUrl");
});
