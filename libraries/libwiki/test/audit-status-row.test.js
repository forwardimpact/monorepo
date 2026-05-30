import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runRules } from "@forwardimpact/libutil";
import { RULES } from "../src/audit/rules.js";
import { buildContext, resolveScope } from "../src/audit/scopes.js";

const STATUS_RULES = RULES.filter((r) => r.scope === "status-row");

function fence(rows) {
  return ["# Spec Status", "", "```", ...rows, "```", ""].join("\n");
}

describe("status-row audit", () => {
  let dir;
  let wiki;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-status-"));
    wiki = join(dir, "wiki");
    mkdirSync(wiki, { recursive: true });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const auditStatus = () => {
    const ctx = buildContext({
      wikiRoot: wiki,
      today: "2026-05-30",
      fs: nodeFs,
    });
    return runRules(STATUS_RULES, ctx, { resolveScope });
  };

  test("master and sub-rows pass cleanly", () => {
    writeFileSync(
      join(wiki, "STATUS.md"),
      fence(["1370\tplan\tapproved", "1370/libutil\tplan\timplemented"]),
    );
    assert.deepEqual(auditStatus(), []);
  });

  test("flags a malformed id", () => {
    writeFileSync(join(wiki, "STATUS.md"), fence(["137\tplan\tapproved"]));
    const ids = auditStatus().map((f) => f.id);
    assert.ok(ids.includes("status-row.id-format"));
  });

  test("flags a bad phase and a bad status", () => {
    writeFileSync(
      join(wiki, "STATUS.md"),
      fence(["1370\tbuild\tapproved", "1380\tplan\tshipped"]),
    );
    const ids = auditStatus().map((f) => f.id);
    assert.ok(ids.includes("status-row.phase"));
    assert.ok(ids.includes("status-row.status"));
  });

  test("flags a row without three fields", () => {
    writeFileSync(join(wiki, "STATUS.md"), fence(["1370 plan approved"]));
    const ids = auditStatus().map((f) => f.id);
    assert.ok(ids.includes("status-row.shape"));
  });

  test("ignores prose outside the fence", () => {
    writeFileSync(
      join(wiki, "STATUS.md"),
      [
        "# Spec Status",
        "",
        "Format: `{id}<TAB>{phase}<TAB>{status}`.",
        "",
        "```",
        "1370\tplan\tapproved",
        "```",
        "",
      ].join("\n"),
    );
    assert.deepEqual(auditStatus(), []);
  });
});
