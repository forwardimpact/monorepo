import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { validateKnowledgeBase } from "../src/kb-validator.js";

// The validator's resolution and traversal passes need real filesystem
// semantics (symlinks, stat-through-link), so these tests build small
// vaults under mkdtemp instead of using the mock fs.
const roots = [];
after(async () => {
  for (const root of roots)
    await fsp.rm(root, { recursive: true, force: true });
});

/**
 * Build a temp vault. A `null` value creates a directory; a string writes a
 * file (parents auto-created).
 * @param {Record<string, string|null>} spec
 * @returns {Promise<string>} The vault root.
 */
async function vault(spec) {
  const root = await fsp.mkdtemp(join(tmpdir(), "kb-validator-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(spec)) {
    if (content === null) {
      await fsp.mkdir(join(root, rel), { recursive: true });
      continue;
    }
    await fsp.mkdir(dirname(join(root, rel)), { recursive: true });
    await fsp.writeFile(join(root, rel), content);
  }
  return root;
}

const runtime = { fs: fsp };
const validate = (root) => validateKnowledgeBase(root, runtime);
const ofKind = (result, ...kinds) =>
  result.findings.filter((f) => kinds.includes(f.kind));
const LINK_KINDS = [
  "unresolved",
  "ambiguous",
  "narrower-link",
  "bare-basename",
  "path-string",
];
const TIERS = {
  "0-Draft/": null,
  "1-Management/": null,
  "2-Confidential/": null,
  "3-Team/": null,
  "4-Public/": null,
};
const FM = "---\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-02\n---\n";

describe("rank grammar", () => {
  test("five conforming tiers pass", async () => {
    const result = await validate(await vault(TIERS));
    assert.equal(result.tierCount, 5);
    assert.deepEqual(result.findings, []);
  });

  test("a two-digit prefix fails out-of-grammar-rank", async () => {
    const result = await validate(
      await vault({ "3-Team/": null, "12-Foo/": null }),
    );
    const [finding] = ofKind(result, "out-of-grammar-rank");
    assert.equal(finding.path, "12-Foo");
  });

  test("a date-prefixed personal folder passes", async () => {
    const result = await validate(
      await vault({ "3-Team/": null, "2026-Archive/": null }),
    );
    assert.deepEqual(result.findings, []);
    assert.equal(result.tierCount, 1);
  });

  test("two entries with one rank fail duplicate-rank", async () => {
    const result = await validate(
      await vault({ "3-Crew/": null, "3-Team/": null }),
    );
    assert.equal(ofKind(result, "duplicate-rank").length, 1);
  });
});

describe("legacy detection", () => {
  test("Knowledge/ fails at any time and names MIGRATION.md", async () => {
    const result = await validate(
      await vault({ ...TIERS, "Knowledge/": null }),
    );
    const [finding] = ofKind(result, "legacy-layout");
    assert.equal(finding.path, "Knowledge");
    assert.match(finding.message, /MIGRATION\.md/);
  });

  test("Drafts/ fails at any time", async () => {
    const result = await validate(await vault({ ...TIERS, "Drafts/": null }));
    assert.equal(ofKind(result, "legacy-layout")[0].path, "Drafts");
  });

  test("an entity directory at a tier-less root fails", async () => {
    const result = await validate(await vault({ "People/": null }));
    const [finding] = ofKind(result, "legacy-layout");
    assert.equal(finding.path, "People");
    assert.match(finding.message, /MIGRATION\.md/);
  });

  test("an entity-named personal folder beside tiers passes", async () => {
    const result = await validate(await vault({ ...TIERS, "People/": null }));
    assert.deepEqual(result.findings, []);
  });

  test("an empty root fails no-tiers and names MIGRATION.md", async () => {
    const result = await validate(await vault({}));
    const [finding] = ofKind(result, "no-tiers");
    assert.match(finding.message, /MIGRATION\.md/);
  });
});

describe("link legality and format", () => {
  test("same-tier and narrower-to-wider links pass", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/People/Sarah Chen.md": "note",
        "3-Team/Projects/Apollo.md": "See [[3-Team/People/Sarah Chen]].",
        "2-Confidential/Candidates/Jane Doe.md":
          "Refers to [[3-Team/Projects/Apollo]].",
      }),
    );
    assert.deepEqual(ofKind(result, ...LINK_KINDS), []);
  });

  test("a wider-to-narrower link fails narrower-link", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "2-Confidential/Candidates/Jane Doe.md": "note",
        "3-Team/People/Sarah Chen.md":
          "See [[2-Confidential/Candidates/Jane Doe]].",
      }),
    );
    const [finding] = ofKind(result, "narrower-link");
    assert.equal(finding.file, "3-Team/People/Sarah Chen.md");
    assert.equal(finding.targetTier, "2-Confidential");
    assert.equal(typeof finding.line, "number");
  });

  test("a dangling link fails unresolved", async () => {
    const result = await validate(
      await vault({ ...TIERS, "3-Team/a.md": "See [[3-Team/Ghost]]." }),
    );
    assert.equal(ofKind(result, "unresolved")[0].link, "3-Team/Ghost");
  });

  test("a bare link onto a duplicated basename fails ambiguous", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "2-Confidential/People/Jane Doe.md": "overlay",
        "3-Team/People/Jane Doe.md": "canonical",
        "3-Team/Projects/Apollo.md": "Ping [[Jane Doe]].",
      }),
    );
    assert.equal(ofKind(result, "ambiguous")[0].link, "Jane Doe");
  });

  test("a bare link in a shared tier fails bare-basename", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/People/Sarah Chen.md": "note",
        "3-Team/Projects/Apollo.md": "Ask [[Sarah Chen]].",
      }),
    );
    const [finding] = ofKind(result, "bare-basename");
    assert.equal(finding.link, "Sarah Chen");
    assert.equal(finding.targetTier, "3-Team");
  });

  test("a bare link in a tier-0 note passes", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/People/Sarah Chen.md": "note",
        "0-Draft/idea.md": "Ask [[Sarah Chen]].",
      }),
    );
    assert.deepEqual(ofKind(result, ...LINK_KINDS), []);
  });

  test("a relative link inside one entity folder passes", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "2-Confidential/Candidates/Jane Doe/CV.pdf": "binary",
        "2-Confidential/Candidates/Jane Doe/brief.md": "The [CV](CV.pdf).",
      }),
    );
    assert.deepEqual(ofKind(result, ...LINK_KINDS), []);
  });

  test("a path string naming a narrower tier fails path-string", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "1-Management/Plans/reorg.md": "note",
        "3-Team/note.md": "The plan sits in 1-Management/Plans/reorg.md today.",
      }),
    );
    const [finding] = ofKind(result, "path-string");
    assert.equal(finding.file, "3-Team/note.md");
    assert.match(finding.link, /^1-Management\//);
  });
});

describe("suffix subset", () => {
  test("a conforming suffix vault passes", async () => {
    const result = await validate(
      await vault({
        "3-Team/People/Sarah Chen.md":
          "---\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-02\n---\n" +
          "See [[4-Public/Posts/Welcome]].",
        "4-Public/Posts/Welcome.md":
          "---\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-02\n" +
          "verified: true\n---\nHello.",
      }),
    );
    assert.equal(result.tierCount, 2);
    assert.deepEqual(result.findings, []);
  });
});

describe("symlinked tiers", () => {
  test("a tier symlinked to a rank-less sync target validates identically", async () => {
    const target = await fsp.mkdtemp(join(tmpdir(), "kb-sync-target-"));
    roots.push(target);
    await fsp.mkdir(join(target, "People"), { recursive: true });
    await fsp.writeFile(join(target, "People", "Sarah Chen.md"), "note");
    const root = await vault({
      "2-Confidential/post.md": FM + "See [[3-Team/People/Sarah Chen]].",
    });
    await fsp.symlink(target, join(root, "3-Team"), "dir");

    const result = await validate(root);
    assert.equal(result.tierCount, 2);
    assert.deepEqual(ofKind(result, ...LINK_KINDS), []);
  });
});

describe("baseline", () => {
  const baseline = JSON.stringify({
    findings: [
      { kind: "unresolved", file: "3-Team/a.md", link: "3-Team/Ghost" },
    ],
  });

  test("a baselined finding reports baselined true, a new one false", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "validation-baseline.json": baseline,
        "3-Team/a.md": "See [[3-Team/Ghost]] and [[3-Team/Ghost Two]].",
      }),
    );
    const [known, fresh] = ofKind(result, "unresolved");
    assert.equal(known.baselined, true);
    assert.equal(fresh.baselined, false);
  });

  test("matching survives a line shift", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "validation-baseline.json": baseline,
        "3-Team/a.md": "One.\n\nTwo.\n\nSee [[3-Team/Ghost]].",
      }),
    );
    const [finding] = ofKind(result, "unresolved");
    assert.equal(finding.line, 5);
    assert.equal(finding.baselined, true);
  });
});

const REGISTRY = [
  "types:",
  "  People: person",
  "  Candidates: candidate",
  "reserved:",
  "  CHANGELOG.md: changelog",
  "status:",
  "  candidate: [new, screening]",
  "tags:",
  "  - { tag: topic/hiring, bound: 2, intent: recruitment }",
  "",
].join("\n");

describe("frontmatter conformance", () => {
  test("a note without a block fails frontmatter-missing per core key", async () => {
    const result = await validate(
      await vault({ ...TIERS, "3-Team/People/A.md": "no block" }),
    );
    const properties = ofKind(result, "frontmatter-missing").map(
      (f) => f.property,
    );
    assert.deepEqual(properties, ["type", "created", "updated"]);
  });

  test("bad dates, nested keys, and inline tags fail frontmatter-invalid", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/People/A.md":
          "---\ntype: note\ncreated: Jan 1\nupdated: 2026-01-02\n" +
          "nested:\n  a: 1\n---\nBody with #topic/hiring inline.",
      }),
    );
    const findings = ofKind(result, "frontmatter-invalid");
    assert.deepEqual(findings.map((f) => [f.property, f.value]).sort(), [
      ["created", "Jan 1"],
      ["nested", "[object Object]"],
      ["tags", "#topic/hiring"],
    ]);
  });

  test("vocabulary findings need the registry", async () => {
    const spec = {
      ...TIERS,
      "3-Team/People/A.md":
        "---\ntype: alien\ncreated: 2026-01-01\nupdated: 2026-01-02\n" +
        "tags:\n  - topic/hiring\n---\n",
    };
    const bare = await validate(await vault(spec));
    assert.deepEqual(ofKind(bare, "frontmatter-vocabulary"), []);

    const result = await validate(
      await vault({ ...spec, "registry.yaml": REGISTRY }),
    );
    const values = ofKind(result, "frontmatter-vocabulary").map((f) => f.value);
    // `alien` is outside the type vocabulary, and topic/hiring's tier bound
    // (2) excludes a 3-Team note.
    assert.deepEqual(values.sort(), ["alien", "topic/hiring"]);
  });

  test("conditional triggers fail frontmatter-missing when unmet", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "registry.yaml": REGISTRY,
        "2-Confidential/Candidates/Jane Doe.md":
          "---\ntype: candidate\ncreated: 2026-01-01\nupdated: 2026-01-02\n---\n",
      }),
    );
    const properties = ofKind(result, "frontmatter-missing").map(
      (f) => f.property,
    );
    assert.deepEqual(properties.sort(), ["aliases", "status"]);
  });

  test("an undeclared overlay fails overlay-undeclared", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/People/Jane Doe.md": FM,
        "2-Confidential/People/Jane Doe.md": FM,
      }),
    );
    const [finding] = ofKind(result, "overlay-undeclared");
    assert.equal(finding.file, "2-Confidential/People/Jane Doe.md");
    assert.equal(finding.property, "canonical");
  });

  test("a conforming person note passes with the registry", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "registry.yaml": REGISTRY,
        "3-Team/People/Sarah Chen.md":
          "---\ntype: person\ncreated: 2026-01-01\nupdated: 2026-01-02\n" +
          'aliases:\n  - "Chen, Sarah"\n---\nA colleague.',
      }),
    );
    assert.deepEqual(result.findings, []);
  });
});

describe("property links", () => {
  test("a narrower property link reports narrower-link", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "2-Confidential/Candidates/Jane Doe.md": FM,
        "3-Team/People/Sarah Chen.md":
          "---\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-02\n" +
          'related: "[[2-Confidential/Candidates/Jane Doe]]"\n---\n',
      }),
    );
    const [finding] = ofKind(result, "narrower-link");
    assert.equal(finding.link, "2-Confidential/Candidates/Jane Doe");
  });

  test("a bare property link reports bare-basename even inside an entity folder", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "2-Confidential/Candidates/Jane Doe/CV.pdf": "binary",
        "2-Confidential/Candidates/Jane Doe/brief.md":
          "---\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-02\n" +
          'attachment: "[[CV.pdf]]"\n---\n',
      }),
    );
    assert.equal(ofKind(result, "bare-basename")[0].link, "CV.pdf");
  });

  test("an unquoted property link reports frontmatter-invalid", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/People/Jane Doe.md": FM,
        "3-Team/People/Sarah Chen.md":
          "---\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-02\n" +
          "related: [[3-Team/People/Jane Doe]]\n---\n",
      }),
    );
    const [finding] = ofKind(result, "frontmatter-invalid");
    assert.equal(finding.property, "related");
  });
});
