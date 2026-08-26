import { test } from "node:test";
import assert from "node:assert/strict";
import { PagesBuilder } from "../src/index.js";
import { resolvePartials, defaultRegistry } from "../src/partials.js";
import {
  assertRejectsMessage,
  assertThrowsMessage,
  createTestRuntime,
} from "@forwardimpact/libmock";

const CHROME = '<nav id="site-chrome">Docs</nav>';
const DEFAULT_TEMPLATE = `<html><head><title>{{title}}</title></head><body>${CHROME}{{breadcrumbs}}{{title}}</body></html>`;

/**
 * Build a mock fs/path/builder setup from a map of source files.
 * Directory entries come from the source paths, so nested pages work.
 * @param {object} options
 * @param {Map<string, string>} options.sourceFiles - Map of path -> content
 * @param {string} [options.template] - Template content
 * @returns {{ files: Map, dirs: Set, builder: PagesBuilder }}
 */
function createTestHarness({ sourceFiles, template = DEFAULT_TEMPLATE }) {
  const files = new Map();
  const dirs = new Set();

  const entriesByDir = new Map();
  const sourceDirs = new Set();
  for (const sourcePath of sourceFiles.keys()) {
    const parts = sourcePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!entriesByDir.has(dir)) entriesByDir.set(dir, new Set());
      entriesByDir.get(dir).add(parts[i]);
      if (i > 1) sourceDirs.add(dir);
    }
  }

  const mockFs = {
    existsSync: (p) => {
      if (p.endsWith("index.template.html")) return true;
      if (p.endsWith("assets")) return false;
      return files.has(p) || dirs.has(p) || sourceFiles.has(p);
    },
    mkdirSync: (p) => dirs.add(p),
    rmSync: () => {},
    readdirSync: (p, opts) => {
      const names = [...(entriesByDir.get(p) || [])];
      if (opts?.withFileTypes) {
        return names.map((name) => ({
          name,
          isFile: () => !sourceDirs.has(`${p}/${name}`),
          isDirectory: () => sourceDirs.has(`${p}/${name}`),
        }));
      }
      return names;
    },
    readFileSync: (p) => {
      if (p.endsWith("index.template.html")) return template;
      if (sourceFiles.has(p)) return sourceFiles.get(p);
      if (files.has(p)) return files.get(p);
      return "";
    },
    writeFileSync: (p, content) => files.set(p, content),
    statSync: (p) => ({
      isDirectory: () => sourceDirs.has(p),
      isFile: () => !sourceDirs.has(p),
    }),
    copyFileSync: (s, d) => files.set(d, sourceFiles.get(s) || ""),
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
    tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => ctx[key] || "");
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

  return { files, dirs, builder };
}

const MOVED = "https://www.gemba.team/docs/prove-changes/";

function redirectSite() {
  return new Map([
    ["src/index.md", "---\ntitle: Home\n---\nWelcome"],
    [
      "src/docs/index.md",
      "---\ntitle: Documentation\ndescription: All guides\n---\nGuides",
    ],
    [
      "src/docs/prove-changes/index.md",
      `---\ntitle: Prove Agent Changes\nredirect: ${MOVED}\n---\nOld body`,
    ],
    [
      "src/docs/generate-dataset/index.md",
      "---\ntitle: Generate a Dataset\ndescription: Build a dataset\n---\nBody",
    ],
  ]);
}

test("PagesBuilder writes a standalone HTML stub for a redirect page", async () => {
  const { files, builder } = createTestHarness({ sourceFiles: redirectSite() });

  await builder.build("src", "dist");

  const stub = files.get("dist/docs/prove-changes/index.html");
  assert.ok(stub, "redirect stub written at the old path");
  assert.ok(stub.startsWith("<!doctype html>"), "stub is a whole document");
  assert.ok(
    stub.includes(`<meta http-equiv="refresh" content="0; url=${MOVED}" />`),
    "stub carries a meta refresh to the target",
  );
  assert.ok(
    stub.includes(`<link rel="canonical" href="${MOVED}" />`),
    "stub carries a canonical link to the target",
  );
  assert.ok(
    stub.includes("<title>Prove Agent Changes</title>"),
    "stub carries the page title",
  );
  assert.equal(
    stub.match(/<a href=/g).length,
    1,
    "stub body holds exactly one link",
  );
  assert.ok(
    stub.includes(`<p>This page moved to <a href="${MOVED}">${MOVED}</a>.</p>`),
    "stub body holds one sentence and the target link",
  );
  assert.ok(!stub.includes(CHROME), "stub does not render site chrome");

  const page = files.get("dist/docs/generate-dataset/index.html");
  assert.ok(page.includes(CHROME), "a normal page still uses the template");
});

test("PagesBuilder writes a markdown companion for a redirect page", async () => {
  const { files, builder } = createTestHarness({ sourceFiles: redirectSite() });

  await builder.build("src", "dist");

  assert.equal(
    files.get("dist/docs/prove-changes/index.md"),
    `# Prove Agent Changes\n\nThis page moved to ${MOVED}.\n`,
    "companion names the title and the new URL",
  );
});

test("PagesBuilder excludes a redirect page from sitemap.xml", async () => {
  const { files, builder } = createTestHarness({ sourceFiles: redirectSite() });

  await builder.build("src", "dist", "https://example.com");

  const sitemap = files.get("dist/sitemap.xml");
  assert.ok(
    sitemap.includes("<loc>https://example.com/docs/generate-dataset/</loc>"),
    "a normal page is listed",
  );
  assert.ok(
    !sitemap.includes("/docs/prove-changes/"),
    "the redirect page is not listed",
  );
});

test("PagesBuilder excludes a redirect page from the augmented llms.txt", async () => {
  const sourceFiles = redirectSite();
  sourceFiles.set(
    "src/llms.txt",
    "# Site\n\n## Products\n\n## Documentation\n\n## Optional\n",
  );

  const { files, builder } = createTestHarness({ sourceFiles });

  await builder.build("src", "dist", "https://example.com");

  const llms = files.get("dist/llms.txt");
  assert.ok(
    llms.includes(
      "- [Generate a Dataset](https://example.com/docs/generate-dataset/index.md)",
    ),
    "a normal docs page is indexed",
  );
  assert.ok(
    !llms.includes("Prove Agent Changes"),
    "the redirect page is not indexed",
  );
});

test("PagesBuilder rejects a redirect that is not an absolute http(s) URL", async () => {
  const relative = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nWelcome"],
    [
      "src/docs/prove-changes/index.md",
      "---\ntitle: Prove Agent Changes\nredirect: /docs/prove-changes/\n---\nBody",
    ],
  ]);

  await assertRejectsMessage(
    () =>
      createTestHarness({ sourceFiles: relative }).builder.build("src", "dist"),
    /Invalid redirect in src\/docs\/prove-changes\/index\.md: "\/docs\/prove-changes\/" is not an absolute http or https URL/,
    "the message names the offending file",
  );

  const wrongScheme = new Map([
    ["src/index.md", "---\ntitle: Home\n---\nWelcome"],
    [
      "src/moved/index.md",
      "---\ntitle: Moved\nredirect: ftp://example.com/moved/\n---\nBody",
    ],
  ]);

  await assertRejectsMessage(
    () =>
      createTestHarness({ sourceFiles: wrongScheme }).builder.build(
        "src",
        "dist",
      ),
    /Invalid redirect in src\/moved\/index\.md/,
    "a non-http scheme fails the build",
  );
});

test("PagesBuilder keeps breadcrumbs on the descendants of a redirect page", async () => {
  const sourceFiles = redirectSite();
  sourceFiles.set(
    "src/docs/prove-changes/run-eval/index.md",
    "---\ntitle: Run an Eval\n---\nBody",
  );

  const { files, builder } = createTestHarness({ sourceFiles });

  await builder.build("src", "dist");

  const child = files.get("dist/docs/prove-changes/run-eval/index.html");
  assert.ok(
    child.includes('<a href="/docs/">Documentation</a>'),
    "the top ancestor resolves",
  );
  assert.ok(
    child.includes('<a href="/docs/prove-changes/">Prove Agent Changes</a>'),
    "the redirect ancestor still resolves its title",
  );
  assert.ok(child.includes("<span>Run an Eval</span>"), "the leaf resolves");
});

test("resolvePartials refuses a redirect page as a partial target", () => {
  const pageTree = new Map([
    [
      "/docs/generate-dataset/",
      {
        filePath: "docs/generate-dataset/index.md",
        urlPath: "/docs/generate-dataset/",
        title: "Generate a Dataset",
        description: "Build a dataset",
        redirect: "",
      },
    ],
    [
      "/docs/prove-changes/",
      {
        filePath: "docs/prove-changes/index.md",
        urlPath: "/docs/prove-changes/",
        title: "Prove Agent Changes",
        description: "",
        redirect: MOVED,
      },
    ],
  ]);

  const mockPath = {
    join: (...parts) => parts.join("/"),
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

  const ok = resolvePartials(
    "<!-- part:card:generate-dataset -->",
    pageTree,
    "docs",
    defaultRegistry,
    { path: mockPath },
  );
  assert.ok(
    ok.includes("<h3>Generate a Dataset</h3>"),
    "a normal target still resolves",
  );

  assertThrowsMessage(
    () =>
      resolvePartials(
        "<!-- part:card:prove-changes -->",
        pageTree,
        "docs",
        defaultRegistry,
        { path: mockPath },
      ),
    /Partial target "prove-changes" is a redirect stub/,
    "a redirect target fails the build",
  );
});
