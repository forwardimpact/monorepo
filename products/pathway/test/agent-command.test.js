/**
 * Integration tests for `fit-pathway agent` with the
 * organizational-context slot wired through the CLI.
 *
 * Each test stages a copy of products/map/starter into a temp data dir,
 * optionally writes an organizational-context.yaml, optionally replaces a
 * track's teamInstructions, then invokes runAgentCommand against that
 * staged data dir and reads the rendered .claude/CLAUDE.md.
 *
 * The seventh test (marker-contract collision) is the substantive
 * last-occurrence assertion — without it the rule is trivially true on any
 * single-marker file.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  mkdtempSync,
  rmSync,
  cpSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createDataLoader } from "@forwardimpact/map/loader";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import { runAgentCommand } from "../src/commands/agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const starterDir = join(__dirname, "..", "..", "map", "starter");
const templatesDir = join(__dirname, "..", "templates");

function silent(fn) {
  const original = console.log;
  console.log = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = original;
    });
}

function stageDataDir() {
  const work = mkdtempSync(join(tmpdir(), "agent-orgctx-"));
  cpSync(starterDir, join(work, "data"), { recursive: true });
  return work;
}

function setOrgContext(work, yamlBody) {
  writeFileSync(
    join(work, "data", "organizational-context.yaml"),
    yamlBody,
    "utf-8",
  );
}

function unsetOrgContext(work) {
  const p = join(work, "data", "organizational-context.yaml");
  if (existsSync(p)) rmSync(p);
}

function setTrackTeamInstructions(work, trackId, body) {
  const trackPath = join(work, "data", "tracks", `${trackId}.yaml`);
  let content = readFileSync(trackPath, "utf-8");
  if (/teamInstructions:/m.test(content)) {
    content = content.replace(
      /teamInstructions:\s*\|.*?(?=^\S|^$)/ms,
      `teamInstructions: |\n${body
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n")}\n`,
    );
  } else {
    content += `\nagent:\n  teamInstructions: |\n${body
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n")}\n`;
  }
  writeFileSync(trackPath, content, "utf-8");
}

function clearTrackTeamInstructions(work, trackId) {
  const trackPath = join(work, "data", "tracks", `${trackId}.yaml`);
  const before = readFileSync(trackPath, "utf-8");
  const after = before.replace(
    /^ {2}teamInstructions:.*?(?=^\S|^ {2}\S|^$)/ms,
    "",
  );
  // Sanity guard: silent no-op on YAML shape changes (e.g. indent style) would
  // leave the teamInstructions intact and let the absent-teamInstructions cases
  // exercise the populated path by accident. Fail fast if the strip did
  // nothing.
  assert.notStrictEqual(
    after,
    before,
    `clearTrackTeamInstructions made no change to ${trackPath}`,
  );
  writeFileSync(trackPath, after, "utf-8");
}

async function runAgent(work) {
  const dataDir = join(work, "data");
  const outputDir = join(work, "out");
  const loader = createDataLoader();
  const templateLoader = createTemplateLoader(templatesDir);
  const data = await loader.loadAllData(dataDir);
  await silent(() =>
    runAgentCommand({
      data,
      args: ["software_engineering"],
      options: { track: "platform", output: outputDir },
      dataDir,
      templateLoader,
      loader,
    }),
  );
  return outputDir;
}

function readClaudeMd(outputDir) {
  return readFileSync(join(outputDir, ".claude", "CLAUDE.md"), "utf-8");
}

const POPULATED_SLOT = [
  "repositories:",
  "  - alpha",
  "  - beta",
  "team: team-x",
  "manager: athena",
  "adjacentLeads:",
  "  - handle: iris",
  "    role: DX",
  "projects:",
  "  - project-1",
  "escalationPaths:",
  "  - trigger: incident",
  "    destination: ops@example.com",
  "",
].join("\n");

const EMPTY_SLOT = [
  "repositories: []",
  "team: ''",
  "manager: ''",
  "adjacentLeads: []",
  "projects: []",
  "escalationPaths: []",
  "",
].join("\n");

const MARKER = "## Organizational Context";

describe("runAgentCommand — organizational-context slot", () => {
  test("case 1: populated slot + populated teamInstructions → body then section", async () => {
    const work = stageDataDir();
    try {
      setOrgContext(work, POPULATED_SLOT);
      const outputDir = await runAgent(work);
      const claudeMd = readClaudeMd(outputDir);
      assert.ok(claudeMd.includes(MARKER), "marker missing");
      // Last occurrence of the marker carries the section bullets.
      const markerIdx = claudeMd.lastIndexOf(MARKER);
      assert.ok(
        claudeMd.slice(markerIdx).includes("- **Repositories:** alpha, beta"),
        "section must follow the marker",
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("case 2: populated slot + absent teamInstructions → section-only file", async () => {
    const work = stageDataDir();
    try {
      setOrgContext(work, POPULATED_SLOT);
      clearTrackTeamInstructions(work, "platform");
      const outputDir = await runAgent(work);
      const claudeMd = readClaudeMd(outputDir);
      assert.ok(claudeMd.includes(MARKER));
      assert.ok(claudeMd.includes("- **Manager:** athena"));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("case 3: absent slot + populated teamInstructions → no section", async () => {
    const work = stageDataDir();
    try {
      unsetOrgContext(work);
      const outputDir = await runAgent(work);
      const claudeMd = readClaudeMd(outputDir);
      assert.ok(!claudeMd.includes(MARKER), "marker must not appear");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("case 4: all-empty slot + populated teamInstructions → byte-identical to absent slot", async () => {
    const work1 = stageDataDir();
    const work2 = stageDataDir();
    try {
      unsetOrgContext(work1);
      const absentOut = readClaudeMd(await runAgent(work1));

      setOrgContext(work2, EMPTY_SLOT);
      const emptyOut = readClaudeMd(await runAgent(work2));

      assert.strictEqual(absentOut, emptyOut, "empty slot must match absent");
    } finally {
      rmSync(work1, { recursive: true, force: true });
      rmSync(work2, { recursive: true, force: true });
    }
  });

  test("case 5: populated slot + absent teamInstructions → CLAUDE.md IS written (regression for old skip-on-falsy gate)", async () => {
    const work = stageDataDir();
    try {
      setOrgContext(work, POPULATED_SLOT);
      clearTrackTeamInstructions(work, "platform");
      const outputDir = await runAgent(work);
      assert.ok(
        existsSync(join(outputDir, ".claude", "CLAUDE.md")),
        "CLAUDE.md must be written when slot is the only signal",
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("case 6: idempotent re-run produces byte-identical output", async () => {
    const work = stageDataDir();
    try {
      setOrgContext(work, POPULATED_SLOT);
      const out1 = readClaudeMd(await runAgent(work));
      const out2 = readClaudeMd(await runAgent(work));
      assert.strictEqual(out1, out2);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("case 7: marker-contract last-occurrence rule survives prose collision", async () => {
    const work = stageDataDir();
    try {
      setOrgContext(work, POPULATED_SLOT);
      // Inject the heading into teamInstructions prose so the rendered file
      // contains the marker twice. The LAST occurrence anchors the actual
      // section bullets.
      setTrackTeamInstructions(
        work,
        "platform",
        [
          "Top of teamInstructions.",
          "",
          "## Organizational Context",
          "",
          "(this fake section inside teamInstructions must NOT carry the bullets)",
        ].join("\n"),
      );
      const outputDir = await runAgent(work);
      const claudeMd = readClaudeMd(outputDir);

      const occurrences = claudeMd.match(/^## Organizational Context$/gm) || [];
      assert.strictEqual(
        occurrences.length,
        2,
        "expected the marker to appear twice",
      );

      // Last occurrence is followed by the populated-slot bullets.
      const lastIdx = claudeMd.lastIndexOf(MARKER);
      const tail = claudeMd.slice(lastIdx);
      assert.ok(
        tail.includes("- **Repositories:** alpha, beta"),
        "actual section must follow the LAST marker occurrence",
      );
      assert.ok(
        tail.includes("- **Manager:** athena"),
        "actual section must contain populated bullets after LAST marker",
      );

      // First occurrence is the prose collision, not the section.
      const firstIdx = claudeMd.indexOf(MARKER);
      const between = claudeMd.slice(firstIdx, lastIdx);
      assert.ok(
        between.includes("must NOT carry the bullets"),
        "first marker occurrence must be the prose collision text",
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
