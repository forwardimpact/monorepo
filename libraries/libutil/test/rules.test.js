import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runRules } from "../src/rules.js";

describe("runRules hints", () => {
  const failing = { check: () => ({ value: 7 }), message: () => "over" };
  const resolveScope = () => [{ path: "wiki/pm-2026-W24.md", agent: "pm" }];

  test("a static hint passes through unchanged", () => {
    const rules = [
      { id: "a", scope: "s", severity: "fail", ...failing, hint: "run x" },
    ];
    const [finding] = runRules(rules, {}, { resolveScope });
    assert.equal(finding.hint, "run x");
  });

  test("a function hint renders with (subject, item, ctx)", () => {
    const rules = [
      {
        id: "a",
        scope: "s",
        severity: "fail",
        ...failing,
        hint: (s, item, ctx) =>
          `run x --agent ${s.agent} ${item.value} ${ctx.label}`,
      },
    ];
    const [finding] = runRules(rules, { label: "c" }, { resolveScope });
    assert.equal(finding.hint, "run x --agent pm 7 c");
  });

  test("an absent hint stays null", () => {
    const rules = [{ id: "a", scope: "s", severity: "fail", ...failing }];
    const [finding] = runRules(rules, {}, { resolveScope });
    assert.equal(finding.hint, null);
  });
});
