import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { insertMarkers } from "../src/marker-migrator.js";
import { MEMO_INBOX_MARKER } from "../src/constants.js";

const AGENTS_DIR = "/repo/agents";
const WIKI_ROOT = "/repo/wiki";

describe("insertMarkers", () => {
  // Seed each agent's profile + wiki summary in an in-memory fs. insertMarkers
  // reads both and rewrites the wiki summary through the same sync surface.
  function setup(agents) {
    const seed = {};
    for (const [name, content] of Object.entries(agents)) {
      seed[`${AGENTS_DIR}/${name}.md`] = "# " + name;
      seed[`${WIKI_ROOT}/${name}.md`] = content;
    }
    return createMockFs(seed);
  }

  test("inserts marker on first run", () => {
    const fs = setup({
      "staff-engineer":
        "# Staff Engineer\n\n## Message Inbox\n\n- existing bullet\n",
    });

    const result = insertMarkers(
      { agentsDir: AGENTS_DIR, wikiRoot: WIKI_ROOT },
      fs,
    );

    assert.deepStrictEqual(result.inserted, ["staff-engineer"]);
    assert.deepStrictEqual(result.skipped, []);
    assert.deepStrictEqual(result.errors, []);

    const content = fs.readFileSync(`${WIKI_ROOT}/staff-engineer.md`, "utf-8");
    assert.ok(content.includes(MEMO_INBOX_MARKER));
  });

  test("skips on second run (idempotent)", () => {
    const fs = setup({
      "staff-engineer":
        "# Staff Engineer\n\n## Message Inbox\n\n- existing bullet\n",
    });

    insertMarkers({ agentsDir: AGENTS_DIR, wikiRoot: WIKI_ROOT }, fs);
    const result = insertMarkers(
      { agentsDir: AGENTS_DIR, wikiRoot: WIKI_ROOT },
      fs,
    );

    assert.deepStrictEqual(result.inserted, []);
    assert.deepStrictEqual(result.skipped, ["staff-engineer"]);
  });

  test("reports error when heading missing", () => {
    const fs = setup({
      "staff-engineer": "# Staff Engineer\n\nNo inbox section here.\n",
    });

    const result = insertMarkers(
      { agentsDir: AGENTS_DIR, wikiRoot: WIKI_ROOT },
      fs,
    );

    assert.deepStrictEqual(result.errors, [
      { agent: "staff-engineer", reason: "missing-heading" },
    ]);
  });

  test("marker placed directly under heading", () => {
    const fs = setup({
      "staff-engineer": "## Message Inbox\n\n- existing bullet\n",
    });

    insertMarkers({ agentsDir: AGENTS_DIR, wikiRoot: WIKI_ROOT }, fs);

    const lines = fs
      .readFileSync(`${WIKI_ROOT}/staff-engineer.md`, "utf-8")
      .split("\n");
    const headingIdx = lines.findIndex((l) => l.trim() === "## Message Inbox");
    assert.equal(lines[headingIdx + 2], MEMO_INBOX_MARKER);
  });
});
