import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";

import { runRules } from "@forwardimpact/libutil";
import { RULES } from "../src/audit/rules.js";
import { buildContext, resolveScope } from "../src/audit/scopes.js";

const STATUS_RULES = RULES.filter((r) => r.scope === "status-row");
const WIKI = "/wiki";

function fence(rows) {
  return ["# Spec Status", "", "```", ...rows, "```", ""].join("\n");
}

// Seed STATUS.md in an in-memory fs and run the status-row rules; buildContext
// reads `${wikiRoot}/STATUS.md` through the injected sync surface.
function auditStatus(statusMd) {
  const ctx = buildContext({
    wikiRoot: WIKI,
    today: "2026-05-30",
    fs: createMockFs({ [`${WIKI}/STATUS.md`]: statusMd }),
  });
  return runRules(STATUS_RULES, ctx, { resolveScope });
}

describe("status-row audit", () => {
  test("master and sub-rows pass cleanly", () => {
    const findings = auditStatus(
      fence(["1370\tplan\tapproved", "1370/libutil\tplan\timplemented"]),
    );
    assert.deepEqual(findings, []);
  });

  test("flags a malformed id", () => {
    const ids = auditStatus(fence(["137\tplan\tapproved"])).map((f) => f.id);
    assert.ok(ids.includes("status-row.id-format"));
  });

  test("flags a bad phase and a bad status", () => {
    const ids = auditStatus(
      fence(["1370\tbuild\tapproved", "1380\tplan\tshipped"]),
    ).map((f) => f.id);
    assert.ok(ids.includes("status-row.phase"));
    assert.ok(ids.includes("status-row.status"));
  });

  test("flags a row without three fields", () => {
    const ids = auditStatus(fence(["1370 plan approved"])).map((f) => f.id);
    assert.ok(ids.includes("status-row.shape"));
  });

  test("ignores prose outside the fence", () => {
    const findings = auditStatus(
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
    assert.deepEqual(findings, []);
  });
});
