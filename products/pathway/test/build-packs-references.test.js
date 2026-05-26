/**
 * Verify the build-packs CLI writer emits one references/{name}.md file per
 * starter `references` entry (criterion 5 + criterion 6 on the build-packs
 * path).
 *
 * Lives in its own file (not build-packs.test.js) because that file is at the
 * 400-line ESLint cap.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { generatePacks } from "../src/commands/build-packs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const starterDir = join(__dirname, "..", "..", "map", "starter");
const pathwayPkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);

async function silent(fn) {
  const original = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = original;
  }
}

describe("generatePacks — references emission", () => {
  let workDir;
  let outputDir;

  before(async () => {
    workDir = mkdtempSync(join(tmpdir(), "fit-pathway-refs-test-"));
    outputDir = join(workDir, "public");
    await mkdir(outputDir, { recursive: true });

    await silent(() =>
      generatePacks({
        outputDir,
        dataDir: starterDir,
        siteUrl: "https://example.test",
        standard: { title: "Engineering Pathway" },
        version: pathwayPkg.version,
        templatesDir: join(__dirname, "..", "templates"),
      }),
    );
  });

  after(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  test("packs include one references/{name}.md per starter entry; no REFERENCE.md", async () => {
    // Starter ships incident-response with two references entries:
    // runbooks + postmortem-template. The build-packs writer must produce
    // both files (verbatim YAML order, byte-identical to the CLI writer
    // path because both share writeSkillReferences) and must not produce
    // the legacy REFERENCE.md anywhere.
    const rawDir = join(outputDir, "packs", "raw");
    // incident-response lives in the platform track only; pin the pack so
    // the test does not depend on readdir() order.
    const archive = "se-platform.tar.gz";
    assert.ok(
      existsSync(join(rawDir, archive)),
      `expected ${archive} to be emitted`,
    );

    const extractDir = mkdtempSync(join(tmpdir(), "fit-pathway-refs-extract-"));
    try {
      execFileSync("tar", ["-xzf", join(rawDir, archive), "-C", extractDir]);
      const refsDir = join(
        extractDir,
        ".claude",
        "skills",
        "incident-response",
        "references",
      );
      assert.ok(
        existsSync(refsDir),
        "incident-response references dir missing",
      );

      const refs = (await readdir(refsDir)).sort();
      assert.deepStrictEqual(refs, ["postmortem-template.md", "runbooks.md"]);
      assert.strictEqual(
        existsSync(join(refsDir, "REFERENCE.md")),
        false,
        "legacy REFERENCE.md must not exist",
      );

      const runbooks = await readFile(join(refsDir, "runbooks.md"), "utf8");
      assert.match(runbooks, /^# Incident Runbooks\n/);
      const postmortem = await readFile(
        join(refsDir, "postmortem-template.md"),
        "utf8",
      );
      assert.match(postmortem, /^# Postmortem Template\n/);
    } finally {
      rmSync(extractDir, { recursive: true, force: true });
    }
  });
});
