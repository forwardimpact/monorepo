import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";

import {
  injectFrontmatter,
  markdownLinkTargets,
  namedReferences,
  referenceClosure,
  referenceTarget,
} from "../src/skill-pack.js";

describe("injectFrontmatter", () => {
  test("inserts license and metadata before the closing fence", () => {
    const out = injectFrontmatter("---\nname: x\n---\n# Body\n", "1.2.3");
    expect(out).toContain("license: Apache-2.0");
    expect(out).toContain("metadata:");
    expect(out).toContain('  version: "1.2.3"');
    expect(out).toContain("  author: forwardimpact");
    // Body and name survive.
    expect(out).toContain("name: x");
    expect(out).toContain("# Body");
  });

  test("returns content without frontmatter unchanged", () => {
    const input = "# No frontmatter\n";
    expect(injectFrontmatter(input, "1.0.0")).toBe(input);
  });
});

describe("markdownLinkTargets", () => {
  test("extracts inline links and strips fragments, queries, and titles", () => {
    const md = [
      "See [a](x-a.md#section) and [b](../../agents/x-b.md?x=1).",
      '[c](<x-c.md> "Title") plus [d]( x-d.md ).',
      "[def]: .claude/agents/x-e.md",
      "Not a link: x-f.md",
    ].join("\n");
    expect(markdownLinkTargets(md).sort()).toEqual([
      "../../agents/x-b.md",
      ".claude/agents/x-e.md",
      "x-a.md",
      "x-c.md",
      "x-d.md",
    ]);
  });

  test("reads a link whose text wraps across lines", () => {
    // This repository hard-wraps markdown at 80 columns, so a citation
    // routinely spans two lines. The parser anchors on `](`, not on `[`.
    const md = "See the [abstract\noperation](x-work-trackers.md#ops) rule.";
    expect(markdownLinkTargets(md)).toEqual(["x-work-trackers.md"]);
  });

  test("reads a target that wraps after the opening paren", () => {
    expect(markdownLinkTargets("[a](\n  ../../agents/x-a.md\n)")).toEqual([
      "../../agents/x-a.md",
    ]);
  });

  test("reads a target holding angle brackets", () => {
    // The repository writes placeholder paths this way.
    expect(markdownLinkTargets("[a](../../agents/x-<name>.md)")).toEqual([
      "../../agents/x-<name>.md",
    ]);
  });

  test("reads a title that holds a paren", () => {
    expect(markdownLinkTargets('[a](x-a.md "Protocol (v2)")')).toEqual([
      "x-a.md",
    ]);
  });

  test("reads a raw HTML anchor", () => {
    const md = '<a href="../../agents/x-a.md">protocol</a>';
    expect(markdownLinkTargets(md)).toEqual(["../../agents/x-a.md"]);
  });

  test("reads a link definition at any indent", () => {
    const md = "- item\n      [ref]: ../../agents/x-a.md";
    expect(markdownLinkTargets(md)).toEqual(["../../agents/x-a.md"]);
  });

  test("counts a link inside a code fence", () => {
    // The parser does not track code context. A documented example counts as
    // a citation. That over-ships, which keeps every link resolvable.
    const md = "```md\n[a](../../agents/x-a.md)\n```";
    expect(markdownLinkTargets(md)).toEqual(["../../agents/x-a.md"]);
  });

  test("ignores an empty target", () => {
    expect(markdownLinkTargets("[a]() and [b](#anchor)")).toEqual([]);
  });
});

describe("referenceTarget", () => {
  test("resolves the three link shapes that reach the agents dir", () => {
    expect(referenceTarget(".claude/agents/x-a.md", true)).toBe("x-a.md");
    expect(referenceTarget("../../agents/x-a.md", false)).toBe("x-a.md");
    expect(referenceTarget("../../../agents/x-a.md", false)).toBe("x-a.md");
    expect(referenceTarget("x-a.md", true)).toBe("x-a.md");
  });

  test("rejects bare names from skills, other dirs, URLs, and non-markdown", () => {
    // A bare name inside a skill resolves to the skill dir, not agents/.
    expect(referenceTarget("x-a.md", false)).toBe(null);
    // A skill-local reference is not a shared reference.
    expect(referenceTarget("references/x-a.md", false)).toBe(null);
    expect(referenceTarget("wiki/x-a.md", true)).toBe(null);
    expect(
      referenceTarget("https://example.com/.claude/agents/x-a.md", true),
    ).toBe(null);
    expect(referenceTarget("mailto:x-a.md", true)).toBe(null);
    expect(referenceTarget("../../agents/x-a.yaml", false)).toBe(null);
    expect(referenceTarget("", true)).toBe(null);
  });

  test("matches case-sensitively, as the filename convention requires", () => {
    expect(referenceTarget("../../AGENTS/x-a.md", false)).toBe(null);
    expect(referenceTarget("../../agents/x-a.MD", false)).toBe(null);
  });
});

describe("referenceClosure", () => {
  test("follows links between references to a fixpoint and skips unknowns", () => {
    const references = new Map([
      ["x-a.md", "[b](x-b.md)"],
      ["x-b.md", "[c](x-c.md) [a](x-a.md) [gone](x-gone.md)"],
      ["x-c.md", "end"],
      ["x-orphan.md", "[a](x-a.md)"],
    ]);
    const roots = [{ content: "[a](../../agents/x-a.md)", inAgentsDir: false }];
    expect([...referenceClosure(roots, references)].sort()).toEqual([
      "x-a.md",
      "x-b.md",
      "x-c.md",
    ]);
  });

  test("ignores a citation of a profile", () => {
    // A profile is not in the references map. It ships on its own terms.
    const references = new Map([["x-a.md", ""]]);
    const roots = [
      { content: "[p](../../agents/staff-engineer.md)", inAgentsDir: false },
    ];
    expect(referenceClosure(roots, references).size).toBe(0);
  });

  test("returns an empty set for roots with no citations", () => {
    const references = new Map([["x-a.md", ""]]);
    const roots = [{ content: "# Plain", inAgentsDir: false }];
    expect(referenceClosure(roots, references).size).toBe(0);
  });
});

describe("namedReferences", () => {
  test("finds a reference filename whether or not a link wraps it", () => {
    const md = "See [a](../../agents/x-a.md) and also x-b.md in prose.";
    expect([...namedReferences(md)].sort()).toEqual(["x-a.md", "x-b.md"]);
  });

  test("ignores a name inside an absolute URL", () => {
    // That citation resolves without the pack carrying the file.
    const md = "https://github.com/o/r/blob/main/.claude/agents/x-a.md";
    expect(namedReferences(md).size).toBe(0);
  });

  test("ignores a placeholder name", () => {
    expect(namedReferences("`.apm/agents/x-<name>.md`").size).toBe(0);
  });
});
