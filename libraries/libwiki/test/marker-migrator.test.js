import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { insertMarkers } from "../src/marker-migrator.js";
import { MEMO_INBOX_MARKER } from "../src/constants.js";

describe("insertMarkers", () => {
  function setup(agents) {
    const dir = mkdtempSync(join(tmpdir(), "migrator-"));
    const agentsDir = join(dir, "agents");
    const wikiRoot = join(dir, "wiki");
    mkdirSync(agentsDir);
    mkdirSync(wikiRoot);

    for (const [name, content] of Object.entries(agents)) {
      writeFileSync(join(agentsDir, name + ".md"), "# " + name);
      writeFileSync(join(wikiRoot, name + ".md"), content);
    }

    return { agentsDir, wikiRoot };
  }

  test("inserts marker on first run", () => {
    const { agentsDir, wikiRoot } = setup({
      "staff-engineer":
        "# Staff Engineer\n\n## Message Inbox\n\n- existing bullet\n",
    });

    const result = insertMarkers({ agentsDir, wikiRoot }, nodeFs);

    assert.deepStrictEqual(result.inserted, ["staff-engineer"]);
    assert.deepStrictEqual(result.skipped, []);
    assert.deepStrictEqual(result.errors, []);

    const content = readFileSync(join(wikiRoot, "staff-engineer.md"), "utf-8");
    assert.ok(content.includes(MEMO_INBOX_MARKER));
  });

  test("skips on second run (idempotent)", () => {
    const { agentsDir, wikiRoot } = setup({
      "staff-engineer":
        "# Staff Engineer\n\n## Message Inbox\n\n- existing bullet\n",
    });

    insertMarkers({ agentsDir, wikiRoot }, nodeFs);
    const result = insertMarkers({ agentsDir, wikiRoot }, nodeFs);

    assert.deepStrictEqual(result.inserted, []);
    assert.deepStrictEqual(result.skipped, ["staff-engineer"]);
  });

  test("reports error when heading missing", () => {
    const { agentsDir, wikiRoot } = setup({
      "staff-engineer": "# Staff Engineer\n\nNo inbox section here.\n",
    });

    const result = insertMarkers({ agentsDir, wikiRoot }, nodeFs);

    assert.deepStrictEqual(result.errors, [
      { agent: "staff-engineer", reason: "missing-heading" },
    ]);
  });

  test("marker placed directly under heading", () => {
    const { agentsDir, wikiRoot } = setup({
      "staff-engineer": "## Message Inbox\n\n- existing bullet\n",
    });

    insertMarkers({ agentsDir, wikiRoot }, nodeFs);

    const lines = readFileSync(
      join(wikiRoot, "staff-engineer.md"),
      "utf-8",
    ).split("\n");
    const headingIdx = lines.findIndex((l) => l.trim() === "## Message Inbox");
    assert.equal(lines[headingIdx + 2], MEMO_INBOX_MARKER);
  });
});
