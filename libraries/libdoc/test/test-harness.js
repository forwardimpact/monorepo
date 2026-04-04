import { DocsBuilder } from "../index.js";

/**
 * Create a mock fs/path/builder setup for tests
 * @param {object} options
 * @param {Map<string, string>} options.sourceFiles - Map of path -> content for source files
 * @param {string[]} options.mdFiles - Markdown file names in source dir
 * @param {string[]} [options.rootFiles] - Non-md files in source root
 * @param {string} [options.template] - Template content
 * @returns {{ files: Map, dirs: Set, builder: DocsBuilder, copied: Map }}
 */
export function createTestHarness({
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
