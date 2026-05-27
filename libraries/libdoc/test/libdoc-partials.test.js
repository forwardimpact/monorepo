import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePartials, defaultRegistry } from "../src/partials.js";
import { assertThrowsMessage } from "@forwardimpact/libmock";

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

function makePageTree(entries) {
  const map = new Map();
  for (const entry of entries) {
    map.set(entry.urlPath, entry);
  }
  return map;
}

test("card partial renders a tag with h3 and p", () => {
  const pageTree = makePageTree([
    {
      filePath: "docs/getting-started/index.md",
      urlPath: "/docs/getting-started/",
      title: "Getting Started",
      description: "Learn the basics",
    },
  ]);

  const markdown = "Some text\n<!-- part:card:getting-started -->\nMore text";
  const result = resolvePartials(markdown, pageTree, "docs", defaultRegistry, {
    path: mockPath,
  });

  assert.ok(result.includes('<a href="getting-started/">'));
  assert.ok(result.includes("<h3>Getting Started</h3>"));
  assert.ok(result.includes("<p>Learn the basics</p>"));
  assert.ok(result.includes("Some text"));
  assert.ok(result.includes("More text"));
});

test("link partial renders a tag with title text", () => {
  const pageTree = makePageTree([
    {
      filePath: "docs/getting-started/index.md",
      urlPath: "/docs/getting-started/",
      title: "Getting Started",
      description: "Learn the basics",
    },
  ]);

  const markdown = "See <!-- part:link:getting-started --> for details";
  const result = resolvePartials(markdown, pageTree, "docs", defaultRegistry, {
    path: mockPath,
  });

  assert.ok(result.includes('<a href="getting-started/">Getting Started</a>'));
});

test("sibling path resolves correctly", () => {
  const pageTree = makePageTree([
    {
      filePath: "docs/getting-started/index.md",
      urlPath: "/docs/getting-started/",
      title: "Getting Started",
      description: "Intro",
    },
  ]);

  const markdown = "<!-- part:card:getting-started -->";
  const result = resolvePartials(markdown, pageTree, "docs", defaultRegistry, {
    path: mockPath,
  });

  assert.ok(result.includes('<a href="getting-started/">'));
});

test("parent path resolves with ..", () => {
  const pageTree = makePageTree([
    {
      filePath: "pathway/index.md",
      urlPath: "/pathway/",
      title: "Pathway",
      description: "Career paths",
    },
  ]);

  const markdown = "<!-- part:card:../pathway -->";
  const result = resolvePartials(markdown, pageTree, "docs", defaultRegistry, {
    path: mockPath,
  });

  assert.ok(result.includes("<h3>Pathway</h3>"));
  assert.ok(result.includes('<a href="../pathway/">'));
});

test("unknown type throws with type name in message", () => {
  const pageTree = makePageTree([]);

  assertThrowsMessage(
    () =>
      resolvePartials(
        "<!-- part:unknown:foo -->",
        pageTree,
        "docs",
        defaultRegistry,
        { path: mockPath },
      ),
    /Unknown partial type "unknown"/,
  );
});

test("missing target throws with path and source in message", () => {
  const pageTree = makePageTree([]);

  assertThrowsMessage(
    () =>
      resolvePartials(
        "<!-- part:card:nonexistent -->",
        pageTree,
        "docs",
        defaultRegistry,
        { path: mockPath },
      ),
    /Partial target "nonexistent" not found in page tree.*docs/,
  );
});

test("multiple partials in one page all resolve", () => {
  const pageTree = makePageTree([
    {
      filePath: "docs/a/index.md",
      urlPath: "/docs/a/",
      title: "Page A",
      description: "First",
    },
    {
      filePath: "docs/b/index.md",
      urlPath: "/docs/b/",
      title: "Page B",
      description: "Second",
    },
  ]);

  const markdown = "<!-- part:card:a -->\n<!-- part:card:b -->";
  const result = resolvePartials(markdown, pageTree, "docs", defaultRegistry, {
    path: mockPath,
  });

  assert.ok(result.includes("<h3>Page A</h3>"));
  assert.ok(result.includes("<h3>Page B</h3>"));
});

test("href is relative URL between current and target pages", () => {
  const pageTree = makePageTree([
    {
      filePath: "docs/libraries/typed-contracts/index.md",
      urlPath: "/docs/libraries/typed-contracts/",
      title: "Typed Contracts",
      description: "Types",
    },
  ]);

  const markdown = "<!-- part:card:../libraries/typed-contracts -->";
  const result = resolvePartials(
    markdown,
    pageTree,
    "docs/products",
    defaultRegistry,
    { path: mockPath },
  );

  assert.ok(result.includes('<a href="../libraries/typed-contracts/">'));
});
