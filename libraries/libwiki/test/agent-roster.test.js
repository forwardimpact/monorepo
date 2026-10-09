import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createMockFs } from "@forwardimpact/libmock";
import { listAgents, listProjectAgents } from "../src/agent-roster.js";

const AGENTS_DIR = "/repo/agents";

const profile = (name) =>
  `---\nname: ${name}\ndescription: The ${name}.\n---\n# ${name}\n`;

describe("listAgents", () => {
  test("discovers profiles and derives summary paths", () => {
    const fs = createMockFs({
      [`${AGENTS_DIR}/staff-engineer.md`]: profile("staff-engineer"),
      [`${AGENTS_DIR}/product-manager.md`]: profile("product-manager"),
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

  test("a reference file without frontmatter is not on the roster", () => {
    const fs = createMockFs({
      [`${AGENTS_DIR}/staff-engineer.md`]: profile("staff-engineer"),
      [`${AGENTS_DIR}/x-team-protocol.md`]: "# Team Protocol\n\nBoot first.\n",
    });

    const result = listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs);

    assert.deepStrictEqual(
      result.map((r) => r.agent),
      ["staff-engineer"],
    );
  });

  test("a pack-installed <stem>.agent.md keys as <stem>", () => {
    const fs = createMockFs({
      [`${AGENTS_DIR}/staff-engineer.agent.md`]: profile("staff-engineer"),
    });

    const result = listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs);

    assert.equal(result.length, 1);
    assert.equal(result[0].agent, "staff-engineer");
    assert.equal(result[0].summaryPath, join("wiki", "staff-engineer.md"));
  });

  test("a name that differs from the key warns once and stays on the roster", () => {
    const fs = createMockFs({
      [`${AGENTS_DIR}/staff-engineer.md`]: profile("se"),
      [`${AGENTS_DIR}/product-manager.md`]: profile("product-manager"),
    });
    const warnings = [];

    const result = listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs, {
      warn: (m) => warnings.push(m),
    });

    assert.deepStrictEqual(result.map((r) => r.agent).sort(), [
      "product-manager",
      "staff-engineer",
    ]);
    assert.deepStrictEqual(warnings, [
      "profile staff-engineer.md names 'se', roster key is 'staff-engineer'",
    ]);
  });

  test("an absent directory returns an empty roster", () => {
    const fs = createMockFs({});
    assert.deepStrictEqual(
      listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs),
      [],
    );
  });

  test("excludes subdirectories", () => {
    const fs = createMockFs({
      [`${AGENTS_DIR}/staff-engineer.md`]: profile("staff-engineer"),
      [`${AGENTS_DIR}/references/protocol.md`]: profile("protocol"),
    });

    const result = listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs);

    assert.equal(result.length, 1);
    assert.equal(result[0].agent, "staff-engineer");
  });

  test("throws on broadcast collision", () => {
    const fs = createMockFs({ [`${AGENTS_DIR}/all.md`]: profile("all") });

    assert.throws(
      () => listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs),
      /reserved for broadcast/,
    );
  });

  test("skips non-.md files", () => {
    const fs = createMockFs({
      [`${AGENTS_DIR}/staff-engineer.md`]: profile("staff-engineer"),
      [`${AGENTS_DIR}/README.txt`]: profile("readme"),
    });

    const result = listAgents({ agentsDir: AGENTS_DIR, wikiRoot: "wiki" }, fs);

    assert.equal(result.length, 1);
  });
});

describe("listProjectAgents", () => {
  test("reads the profiles directory under the project root", () => {
    const fs = createMockFs({
      "/repo/.claude/agents/staff-engineer.md": profile("staff-engineer"),
      "/repo/.claude/agents/x-protocol.md": "# Protocol\n",
    });

    const result = listProjectAgents(
      { projectRoot: "/repo", wikiRoot: "/repo/wiki" },
      fs,
    );

    assert.deepStrictEqual(result, [
      {
        agent: "staff-engineer",
        summaryPath: join("/repo/wiki", "staff-engineer.md"),
      },
    ]);
  });
});
