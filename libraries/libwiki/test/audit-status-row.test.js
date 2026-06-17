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

  const PIN = "a".repeat(40);

  test("experiment rows pass cleanly in every state", () => {
    const findings = auditStatus(
      fence([
        `exp:1351\tregistered\t-\t#1351`,
        `exp:1351\tapproved\t${PIN}\t#1351`,
        `exp:1351\tcancelled\t${PIN}\t#1351`,
        `exp:1351\tcancelled\t-\t#1351`,
        "1370\tplan\tapproved",
      ]),
    );
    assert.deepEqual(findings, []);
  });

  test("flags an experiment row without four fields", () => {
    const ids = auditStatus(fence([`exp:1351\tregistered\t-`])).map(
      (f) => f.id,
    );
    assert.ok(ids.includes("status-row.exp-shape"));
  });

  test("flags a bad experiment state", () => {
    const ids = auditStatus(fence([`exp:1351\tdraft\t-\t#1351`])).map(
      (f) => f.id,
    );
    assert.ok(ids.includes("status-row.exp-state"));
  });

  test("flags a non-hex pin on an approved row and a pin on a registered row", () => {
    const ids = auditStatus(
      fence([
        `exp:1351\tapproved\tnothex\t#1351`,
        `exp:1352\tregistered\t${PIN}\t#1352`,
      ]),
    ).map((f) => f.id);
    assert.ok(ids.includes("status-row.exp-pin"));
    assert.equal(ids.filter((i) => i === "status-row.exp-pin").length, 2);
  });

  test("flags a malformed plan-ref", () => {
    const ids = auditStatus(fence([`exp:1351\tapproved\t${PIN}\t1351`])).map(
      (f) => f.id,
    );
    assert.ok(ids.includes("status-row.exp-planref"));
  });

  test("does not apply spec-shaped rules to experiment rows", () => {
    const ids = auditStatus(fence([`exp:1351\tregistered\t-\t#1351`])).map(
      (f) => f.id,
    );
    assert.ok(!ids.includes("status-row.shape"));
    assert.ok(!ids.includes("status-row.id-format"));
    assert.ok(!ids.includes("status-row.phase"));
  });
});
