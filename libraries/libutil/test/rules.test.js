import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runRules } from "../src/rules.js";

// A single-scope resolver returning the supplied subjects verbatim.
const resolverFor = (subjects) => ({
  resolveScope: (scope) => (scope === "s" ? subjects : []),
});

describe("runRules hint resolution", () => {
  test("renders a static-string hint unchanged", () => {
    const rules = [
      {
        id: "static-rule",
        scope: "s",
        severity: "fail",
        check: () => ({ value: 1 }),
        message: () => "msg",
        hint: "do the thing",
      },
    ];
    const [finding] = runRules(rules, {}, resolverFor([{ path: "a.md" }]));
    assert.equal(finding.hint, "do the thing");
  });

  test("resolves a function hint once per finding from the subject", () => {
    const rules = [
      {
        id: "fn-rule",
        scope: "s",
        severity: "fail",
        check: () => ({ value: 2 }),
        message: () => "msg",
        hint: (subject) => `rotate --agent ${subject.agentPrefix}`,
      },
    ];
    const findings = runRules(
      rules,
      {},
      resolverFor([
        { path: "staff-engineer-2026-W21.md", agentPrefix: "staff-engineer" },
        { path: "product-manager-2026-W21.md", agentPrefix: "product-manager" },
      ]),
    );
    assert.equal(findings[0].hint, "rotate --agent staff-engineer");
    assert.equal(findings[1].hint, "rotate --agent product-manager");
  });

  test("a missing hint is null", () => {
    const rules = [
      {
        id: "no-hint",
        scope: "s",
        severity: "warn",
        check: () => ({}),
        message: () => "msg",
      },
    ];
    const [finding] = runRules(rules, {}, resolverFor([{ path: "a.md" }]));
    assert.equal(finding.hint, null);
  });

  test("passes (subject, item, ctx) to the function hint", () => {
    const seen = [];
    const rules = [
      {
        id: "args-rule",
        scope: "s",
        severity: "fail",
        check: () => ({ value: 9 }),
        message: () => "msg",
        hint: (subject, item, ctx) => {
          seen.push({ subject, item, ctx });
          return `${item.value}/${ctx.tag}`;
        },
      },
    ];
    const [finding] = runRules(
      rules,
      { tag: "ctx" },
      resolverFor([{ path: "a.md" }]),
    );
    assert.equal(finding.hint, "9/ctx");
    assert.equal(seen[0].item.value, 9);
    assert.equal(seen[0].ctx.tag, "ctx");
  });
});
