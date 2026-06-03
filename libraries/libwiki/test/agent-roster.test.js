import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createMockFs } from "@forwardimpact/libmock";
import { listAgents } from "../src/agent-roster.js";

const AGENTS_DIR = "/repo/agents";

describe("listAgents", () => {
  test("discovers agent files and derives summary paths", () => {
    const fs = createMockFs({
      [`${AGENTS_DIR}/staff-engineer.md`]: "# Staff Engineer",
      [`${AGENTS_DIR}/product-manager.md`]: "# PM",
    });

    const result = listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs);

    assert.equal(result.length, 2);
    const names = result.map((r) => r.agent).sort();
    assert.deepStrictEqual(names, ["product-manager", "staff-engineer"]);
    assert.equal(
      result.find((r) => r.agent === "staff-engineer").summaryPath,
      join("wiki", "staff-engineer.md"),
    );
  });

  test("excludes subdirectories", () => {
    const fs = createMockFs({
      [`${AGENTS_DIR}/staff-engineer.md`]: "",
      [`${AGENTS_DIR}/references/protocol.md`]: "",
    });

    const result = listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs);

    assert.equal(result.length, 1);
    assert.equal(result[0].agent, "staff-engineer");
  });

  test("throws on broadcast collision", () => {
    const fs = createMockFs({ [`${AGENTS_DIR}/all.md`]: "" });

    assert.throws(
      () => listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs),
      /reserved for broadcast/,
    );
  });

  test("skips non-.md files", () => {
    const fs = createMockFs({
      [`${AGENTS_DIR}/staff-engineer.md`]: "",
      [`${AGENTS_DIR}/README.txt`]: "",
    });

    const result = listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs);

    assert.equal(result.length, 1);
  });
});
