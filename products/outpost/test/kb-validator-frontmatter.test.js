import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { validateKnowledgeBase } from "../src/kb-validator.js";
import {
  KB_FM as FM,
  KB_RUNTIME,
  KB_TIERS as TIERS,
  makeVault as vault,
  removeVaults,
} from "./helpers.js";

// Frontmatter and property-link families, split out of kb-validator.test.js
// per .claude/rules/test-file-shape.md.
after(removeVaults);

const validate = (root) => validateKnowledgeBase(root, KB_RUNTIME);
const ofKind = (result, ...kinds) =>
  result.findings.filter((f) => kinds.includes(f.kind));

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

  test("an unparseable block is one finding, not four", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/People/A.md": "---\ntype: [unclosed\n---\nBody.",
      }),
    );
    assert.equal(ofKind(result, "frontmatter-invalid").length, 1);
    assert.deepEqual(ofKind(result, "frontmatter-missing"), []);
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

  test("a scalar tags value still hits the vocabulary checks", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "registry.yaml": REGISTRY,
        "3-Team/People/A.md":
          "---\ntype: person\ncreated: 2026-01-01\nupdated: 2026-01-02\n" +
          'aliases:\n  - "A"\ntags: topic/hiring\n---\n',
      }),
    );
    const [finding] = ofKind(result, "frontmatter-vocabulary");
    assert.equal(finding.property, "tags");
    assert.equal(finding.value, "topic/hiring");
  });

  test("an empty registry file skips vocabulary checks without crashing", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "registry.yaml": "# humans fill this in later\n",
        "3-Team/People/A.md":
          "---\ntype: alien\ncreated: 2026-01-01\nupdated: 2026-01-02\n---\n",
      }),
    );
    assert.deepEqual(ofKind(result, "frontmatter-vocabulary"), []);
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
