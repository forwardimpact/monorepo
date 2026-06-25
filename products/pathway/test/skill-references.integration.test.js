/**
 * Tests for skill multiple references.
 *
 * Covers:
 *  - formatReference(entry, template) byte shape
 *  - writeSkillReferences wipe-then-write semantics (criterion 6)
 *  - skillToMarkdown per-entry `## {title}` emission (§ 7)
 *  - prepareSkillDetail SkillDetailView.references shape (criterion 5/6 prep)
 *
 * DOM-formatter coverage relies on the build-packs.test.js integration test
 * which exercises the starter pipeline end-to-end (the DOM renderer requires
 * a real browser document, not available under bun:test).
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { formatReference } from "../src/formatters/agent/skill.js";
import { writeSkillReferences } from "../src/commands/agent-io.js";
import { skillToMarkdown } from "../src/formatters/skill/markdown.js";
import { prepareSkillDetail } from "../src/formatters/skill/shared.js";

const runtime = createDefaultRuntime();

const REFERENCE_TEMPLATE = "# {{{title}}}\n\n{{{body}}}\n";

const baseSkill = {
  id: "incident-response",
  name: "Incident Response",
  capability: "reliability",
  description: "Handle incidents.",
  proficiencyDescriptions: { working: "Respond to common incidents." },
};

const baseContext = {
  disciplines: [],
  tracks: [],
  drivers: [],
  capabilities: [{ id: "reliability", name: "Reliability" }],
};

describe("formatReference(entry, template)", () => {
  test("renders title and body verbatim", () => {
    const out = formatReference(
      { name: "ignored", title: "Runbooks", body: "Step one.\nStep two." },
      REFERENCE_TEMPLATE,
    );
    assert.strictEqual(out, "# Runbooks\n\nStep one.\nStep two.\n");
  });

  test("triple-brace template avoids HTML escaping", () => {
    const out = formatReference(
      { name: "x", title: "T<&>", body: "Body <html>." },
      REFERENCE_TEMPLATE,
    );
    assert.ok(out.includes("T<&>"));
    assert.ok(out.includes("Body <html>."));
  });
});

describe("writeSkillReferences", () => {
  let workDir;
  let skillDir;

  beforeEach(async () => {
    workDir = mkdtempSync(join(tmpdir(), "skill-references-writer-"));
    skillDir = join(workDir, "incident-response");
    await mkdir(skillDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  test("returns 0 and creates no directory when references is empty", async () => {
    const count = await writeSkillReferences(
      skillDir,
      [],
      REFERENCE_TEMPLATE,
      runtime,
    );
    assert.strictEqual(count, 0);
    assert.strictEqual(existsSync(join(skillDir, "references")), false);
  });

  test("returns 0 when references is undefined", async () => {
    const count = await writeSkillReferences(
      skillDir,
      undefined,
      REFERENCE_TEMPLATE,
      runtime,
    );
    assert.strictEqual(count, 0);
  });

  test("writes one file per entry with verbatim body", async () => {
    const count = await writeSkillReferences(
      skillDir,
      [
        { name: "runbooks", title: "Runbooks", body: "Body A." },
        { name: "postmortem", title: "Postmortem", body: "Body B." },
      ],
      REFERENCE_TEMPLATE,
      runtime,
    );
    assert.strictEqual(count, 2);
    const refDir = join(skillDir, "references");
    const files = (await readdir(refDir)).sort();
    assert.deepStrictEqual(files, ["postmortem.md", "runbooks.md"]);
    const runbooks = await readFile(join(refDir, "runbooks.md"), "utf-8");
    assert.strictEqual(runbooks, "# Runbooks\n\nBody A.\n");
  });

  test("wipes pre-existing references/ before writing (criterion 6)", async () => {
    const refDir = join(skillDir, "references");
    await mkdir(refDir, { recursive: true });
    await writeFile(join(refDir, "stale.md"), "leftover", "utf-8");
    await writeFile(join(refDir, "REFERENCE.md"), "legacy", "utf-8");

    await writeSkillReferences(
      skillDir,
      [{ name: "fresh", title: "Fresh", body: "Body." }],
      REFERENCE_TEMPLATE,
      runtime,
    );

    const files = (await readdir(refDir)).sort();
    assert.deepStrictEqual(files, ["fresh.md"]);
    assert.strictEqual(existsSync(join(refDir, "stale.md")), false);
    assert.strictEqual(existsSync(join(refDir, "REFERENCE.md")), false);
  });

  test("removes the directory entirely when references becomes empty", async () => {
    const refDir = join(skillDir, "references");
    await mkdir(refDir, { recursive: true });
    await writeFile(join(refDir, "old.md"), "old", "utf-8");

    await writeSkillReferences(skillDir, [], REFERENCE_TEMPLATE, runtime);

    assert.strictEqual(existsSync(refDir), false);
  });
});

describe("skillToMarkdown — references loop", () => {
  test("emits one ## {title} per reference, in YAML order", () => {
    const out = skillToMarkdown(
      {
        ...baseSkill,
        references: [
          { name: "a", title: "Alpha", body: "Alpha body." },
          { name: "b", title: "Beta", body: "Beta body." },
        ],
      },
      baseContext,
    );
    assert.ok(out.includes("## Alpha\n\nAlpha body."));
    assert.ok(out.includes("## Beta\n\nBeta body."));
    assert.ok(out.indexOf("## Alpha") < out.indexOf("## Beta"));
  });

  test("no references → no per-reference section", () => {
    const out = skillToMarkdown(baseSkill, baseContext);
    assert.ok(!out.includes("## Alpha"));
    assert.ok(!out.includes("## Implementation Patterns"));
  });

  test("references with the same title produce two identical headings", () => {
    const out = skillToMarkdown(
      {
        ...baseSkill,
        references: [
          { name: "a", title: "Same", body: "First." },
          { name: "b", title: "Same", body: "Second." },
        ],
      },
      baseContext,
    );
    const occurrences = out.split("## Same").length - 1;
    assert.strictEqual(occurrences, 2);
  });
});

describe("prepareSkillDetail — references field", () => {
  test("missing references defaults to empty array", () => {
    const view = prepareSkillDetail(baseSkill, baseContext);
    assert.deepStrictEqual(view.references, []);
  });

  test("passes references through unchanged", () => {
    const refs = [
      { name: "a", title: "Alpha", body: "Body A." },
      { name: "b", title: "Beta", body: "Body B." },
    ];
    const view = prepareSkillDetail(
      { ...baseSkill, references: refs },
      baseContext,
    );
    assert.deepStrictEqual(view.references, refs);
  });

  test("legacy implementationReference is no longer present on the view", () => {
    const view = prepareSkillDetail(baseSkill, baseContext);
    assert.strictEqual(Object.hasOwn(view, "implementationReference"), false);
  });
});
