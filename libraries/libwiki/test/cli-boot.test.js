import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";

import { runBootCommand } from "../src/commands/boot.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const WIKI_ROOT = "/wiki";

function seededFs() {
  return createMockFs({
    [`${WIKI_ROOT}/MEMORY.md`]:
      "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| *None* | — | — | — | — |\n",
    [`${WIKI_ROOT}/staff-engineer.md`]:
      "# Staff Engineer — Summary\n\nSE summary.\n",
  });
}

describe("fit-wiki boot CLI (in-process)", () => {
  function run(options) {
    const harness = makeRuntime({ fsSync: seededFs() });
    const result = runBootCommand(
      ctxFor({
        runtime: harness.runtime,
        options: {
          "wiki-root": WIKI_ROOT,
          agent: "staff-engineer",
          ...options,
        },
      }),
    );
    return { harness, result };
  }

  test("prints JSON digest", () => {
    const { harness } = run({ today: "2026-05-19" });
    const digest = JSON.parse(harness.stdout);
    assert.equal(typeof digest.summary, "string");
    assert.ok(Array.isArray(digest.owned_priorities));
    assert.ok(Array.isArray(digest.claims));
  });

  test("markdown format emits human-readable output", () => {
    const { harness } = run({ today: "2026-05-19", format: "markdown" });
    assert.match(harness.stdout, /# Boot Digest/);
  });
});
