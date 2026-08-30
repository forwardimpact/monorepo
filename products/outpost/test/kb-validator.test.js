import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateKnowledgeBase } from "../src/kb-validator.js";
import {
  KB_FM as FM,
  KB_RUNTIME,
  KB_TIERS as TIERS,
  makeVault as vault,
  removeVaults,
  trackVault,
} from "./helpers.js";

// Structure families: rank grammar, legacy detection, links, suffix
// subsets, symlinked tiers, and the baseline. The frontmatter and
// property-link families live in kb-validator-frontmatter.test.js
// (per .claude/rules/test-file-shape.md).
after(removeVaults);

const validate = (root) => validateKnowledgeBase(root, KB_RUNTIME);
const ofKind = (result, ...kinds) =>
  result.findings.filter((f) => kinds.includes(f.kind));
const LINK_KINDS = [
  "unresolved",
  "ambiguous",
  "narrower-link",
  "bare-basename",
  "path-string",
];

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

  test("a root file with a legacy name passes", async () => {
    const result = await validate(
      await vault({ ...TIERS, Knowledge: "a note about knowledge" }),
    );
    assert.deepEqual(result.findings, []);
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

  test("a bare link between siblings in one entity folder still fails", async () => {
    // The entity-subdirectory exemption covers relative markdown links
    // only; a wiki link in a shared tier is tier-prefixed with no
    // exemption, because overlays duplicate basenames across tiers.
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/People/Sarah Chen.md": "note",
        "3-Team/People/Bob Roe.md": "Ask [[Sarah Chen]].",
      }),
    );
    assert.equal(ofKind(result, "bare-basename")[0].link, "Sarah Chen");
  });

  test("an explicit-extension wiki link resolves in tier 0", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/People/Sarah Chen.md": "note",
        "0-Draft/idea.md": "Ask [[Sarah Chen.md]].",
      }),
    );
    assert.deepEqual(ofKind(result, ...LINK_KINDS), []);
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

  test("a cross-entity relative link fails bare-basename", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "3-Team/Projects/Apollo.md": "note",
        "3-Team/People/Sarah Chen.md": "See [Apollo](../Projects/Apollo.md).",
      }),
    );
    assert.equal(
      ofKind(result, "bare-basename")[0].link,
      "../Projects/Apollo.md",
    );
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

  test("a path string inside a fenced command block still fails", async () => {
    const result = await validate(
      await vault({
        ...TIERS,
        "1-Management/Plans/reorg.md": "note",
        "3-Team/note.md":
          "Run:\n\n```bash\nrg reorg 1-Management/Plans/\n```\n",
      }),
    );
    assert.equal(ofKind(result, "path-string").length, 1);
  });

  test("a legal deeper path sharing a personal folder name passes", async () => {
    // A personal root folder may share an entity-directory name; the
    // `3-Team/Projects/...` literal must not read as the personal
    // `Projects/` surface.
    const result = await validate(
      await vault({
        ...TIERS,
        "Projects/": null,
        "3-Team/Projects/Apollo.md": "note",
        "3-Team/note.md": "The plan sits in 3-Team/Projects/Apollo.md today.",
      }),
    );
    assert.deepEqual(ofKind(result, "path-string"), []);
  });
});

describe("suffix subset", () => {
  test("a conforming suffix vault passes", async () => {
    const result = await validate(
      await vault({
        "3-Team/People/Sarah Chen.md": FM + "See [[4-Public/Posts/Welcome]].",
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
    const target = trackVault(await fsp.mkdtemp(join(tmpdir(), "kb-sync-")));
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

  test("a broken symlink inside a tier is skipped, not fatal", async () => {
    const root = await vault({ ...TIERS, "3-Team/a.md": "plain note" });
    await fsp.symlink(
      join(root, "missing.md"),
      join(root, "3-Team", "dead.md"),
    );
    const result = await validate(root);
    assert.equal(result.tierCount, 5);
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
