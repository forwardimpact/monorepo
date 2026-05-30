import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listAgents } from "../src/agent-roster.js";

describe("listAgents", () => {
  function makeTmpDir() {
    return mkdtempSync(join(tmpdir(), "roster-"));
  }

  test("discovers agent files and derives summary paths", () => {
    const dir = makeTmpDir();
    const agentsDir = join(dir, "agents");
    mkdirSync(agentsDir);
    writeFileSync(join(agentsDir, "staff-engineer.md"), "# Staff Engineer");
    writeFileSync(join(agentsDir, "product-manager.md"), "# PM");

    const result = listAgents({ agentsDir, wikiRoot: "wiki" }, nodeFs);

    assert.equal(result.length, 2);
    const names = result.map((r) => r.agent).sort();
    assert.deepStrictEqual(names, ["product-manager", "staff-engineer"]);
    assert.equal(
      result.find((r) => r.agent === "staff-engineer").summaryPath,
      join("wiki", "staff-engineer.md"),
    );
  });

  test("excludes subdirectories", () => {
    const dir = makeTmpDir();
    const agentsDir = join(dir, "agents");
    mkdirSync(agentsDir);
    writeFileSync(join(agentsDir, "staff-engineer.md"), "");
    mkdirSync(join(agentsDir, "references"));
    writeFileSync(join(agentsDir, "references", "protocol.md"), "");

    const result = listAgents({ agentsDir, wikiRoot: "wiki" }, nodeFs);

    assert.equal(result.length, 1);
    assert.equal(result[0].agent, "staff-engineer");
  });

  test("throws on broadcast collision", () => {
    const dir = makeTmpDir();
    const agentsDir = join(dir, "agents");
    mkdirSync(agentsDir);
    writeFileSync(join(agentsDir, "all.md"), "");

    assert.throws(
      () => listAgents({ agentsDir, wikiRoot: "wiki" }, nodeFs),
      /reserved for broadcast/,
    );
  });

  test("skips non-.md files", () => {
    const dir = makeTmpDir();
    const agentsDir = join(dir, "agents");
    mkdirSync(agentsDir);
    writeFileSync(join(agentsDir, "staff-engineer.md"), "");
    writeFileSync(join(agentsDir, "README.txt"), "");

    const result = listAgents({ agentsDir, wikiRoot: "wiki" }, nodeFs);

    assert.equal(result.length, 1);
  });
});
