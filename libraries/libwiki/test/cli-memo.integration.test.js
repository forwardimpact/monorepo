import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MEMO_INBOX_MARKER } from "../src/constants.js";
import { runMemoCommand } from "../src/commands/memo.js";
import { makeRuntime, ctxFor } from "./helpers.js";

describe("gemba-wiki memo CLI (in-process)", () => {
  let dir;
  let agentsDir;
  let wikiRoot;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wiki-cli-"));
    agentsDir = join(dir, ".claude", "agents");
    wikiRoot = join(dir, "wiki");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(wikiRoot);
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');

    writeFileSync(join(agentsDir, "staff-engineer.md"), "# SE");
    writeFileSync(join(agentsDir, "product-manager.md"), "# PM");

    writeFileSync(
      join(wikiRoot, "staff-engineer.md"),
      `# Staff Engineer\n\n## Message Inbox\n\n${MEMO_INBOX_MARKER}\n\n- old bullet\n`,
    );
    writeFileSync(
      join(wikiRoot, "product-manager.md"),
      `# PM\n\n## Message Inbox\n\n${MEMO_INBOX_MARKER}\n\n- old bullet\n`,
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function run(options, env = {}) {
    const harness = makeRuntime({ cwd: dir, env });
    const result = runMemoCommand(
      ctxFor({ runtime: harness.runtime, options }),
    );
    return { harness, result };
  }

  test("single-target write", () => {
    const { harness } = run({
      from: "technical-writer",
      to: "staff-engineer",
      message: "audit d642ff0c",
    });
    assert.match(harness.stdout, /wrote/);
    const content = readFileSync(join(wikiRoot, "staff-engineer.md"), "utf-8");
    assert.ok(content.includes("from **technical-writer**: audit d642ff0c"));
  });

  test("broadcast writes to every agent except sender", () => {
    writeFileSync(join(agentsDir, "technical-writer.md"), "# TW");
    writeFileSync(
      join(wikiRoot, "technical-writer.md"),
      `# TW\n\n## Message Inbox\n\n${MEMO_INBOX_MARKER}\n`,
    );
    run({ from: "technical-writer", to: "all", message: "check baselines" });
    const se = readFileSync(join(wikiRoot, "staff-engineer.md"), "utf-8");
    const pm = readFileSync(join(wikiRoot, "product-manager.md"), "utf-8");
    const tw = readFileSync(join(wikiRoot, "technical-writer.md"), "utf-8");
    assert.ok(se.includes("check baselines"));
    assert.ok(pm.includes("check baselines"));
    assert.ok(!tw.includes("check baselines"), "sender's own inbox skipped");
  });

  test("missing-marker exits 2", () => {
    writeFileSync(
      join(wikiRoot, "staff-engineer.md"),
      "# SE\n\n## Message Inbox\n\n- no marker\n",
    );
    const { harness, result } = run({
      from: "x",
      to: "staff-engineer",
      message: "test",
    });
    assert.equal(result.code, 2);
    assert.ok(harness.stderr.includes("memo:inbox marker"));
  });

  test("missing target file exits 2", () => {
    const { result } = run({ from: "x", to: "nonexistent", message: "test" });
    assert.equal(result.code, 2);
  });

  test("rejects --to that escapes wiki root via path traversal", () => {
    const outside = join(dir, "outside.md");
    writeFileSync(
      outside,
      `# Outside\n\n## Message Inbox\n\n${MEMO_INBOX_MARKER}\n`,
    );
    const { result } = run({
      from: "x",
      to: "../outside",
      message: "traversal",
    });
    assert.equal(result.code, 2);
    assert.ok(result.error.includes("escapes wiki root"));
    assert.ok(!readFileSync(outside, "utf-8").includes("traversal"));
  });

  test("--from omitted fails closed even with LIBHARNESS_AGENT_PROFILE set", () => {
    // The env var is no longer a fallback: a missing --from is a fail-closed
    // error regardless of env state, and nothing is written.
    const { result } = run(
      { to: "staff-engineer", message: "env test" },
      { LIBHARNESS_AGENT_PROFILE: "security-engineer" },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error, /^memo requires --from <name>; e\.g\. /);
    assert.doesNotMatch(result.error, /LIBHARNESS_AGENT_PROFILE/);
    const content = readFileSync(join(wikiRoot, "staff-engineer.md"), "utf-8");
    assert.ok(!content.includes("env test"), "no memo written");
  });

  test("exits 2 when --from is omitted and env unset", () => {
    const { result } = run(
      { to: "staff-engineer", message: "test" },
      { LIBHARNESS_AGENT_PROFILE: "" },
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });
});
