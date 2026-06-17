import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { RULES } from "../src/audit/rules.js";

describe("RULES catalogue", () => {
  test("rule order is locked (catalogue snapshot)", () => {
    assert.deepEqual(
      RULES.map((r) => r.id),
      [
        "summary.last-run-marker",
        "summary.first-h2-inbox",
        "summary.memo-inbox-marker",
        "summary.open-blockers-last",
        "summary.line-budget",
        "summary.word-budget",
        "summary.h1-agent-matches-filename",
        "weekly-log.h1-shape",
        "weekly-log.line-budget",
        "weekly-log.word-budget",
        "weekly-log.h1-agent-matches-filename",
        "weekly-log.heading-grammar",
        "decision-block.heading-within-5",
        "weekly-log-part.h1-shape",
        "weekly-log-part.heading-grammar",
        "weekly-log-part.line-budget",
        "weekly-log-part.word-budget",
        "weekly-log-part.h1-agent-matches-filename",
        "memory.file-exists",
        "memory.priority-heading",
        "memory.priority-table-header",
        "memory.priority-separator-row",
        "memory.active-claims-table-header",
        "memory.active-claims-separator-row",
        "priority-row.column-count",
        "claims-row.claimed-at-format",
        "claims-row.expires-at-format",
        "expired-claim",
        "storyboard.current-month-exists",
        "storyboard.agent-h3-required",
        "storyboard.line-budget",
        "storyboard.word-budget",
        "storyboard.markers-balanced.xmr",
        "storyboard.markers-balanced.issues",
        "storyboard.markers-balanced.agent-experiments",
        "metrics-csv.duplicate-row",
        "status-row.shape",
        "status-row.id-format",
        "status-row.phase",
        "status-row.status",
        "status-row.exp-shape",
        "status-row.exp-id-format",
        "status-row.exp-state",
        "status-row.exp-pin",
        "status-row.exp-planref",
        "conflict.markers",
        "admission.not-in-grammar",
      ],
    );
  });

  test("every rule is well-formed", () => {
    const ids = new Set();
    for (const rule of RULES) {
      assert.ok(rule.id);
      assert.ok(rule.scope);
      assert.match(rule.severity, /^(fail|warn)$/);
      assert.equal(typeof rule.check, "function");
      assert.equal(typeof rule.message, "function");
      assert.ok(!ids.has(rule.id), `duplicate id: ${rule.id}`);
      ids.add(rule.id);
    }
  });

  test("structure hints steer to the log commands; part-budget hints drop the by-hand clause", () => {
    const hintOf = (id) => RULES.find((r) => r.id === id).hint;
    // The drift rule and the decision-block rule both name a log command.
    assert.match(hintOf("weekly-log.heading-grammar"), /fit-wiki log/);
    assert.match(hintOf("weekly-log-part.heading-grammar"), /fit-wiki log/);
    assert.match(hintOf("decision-block.heading-within-5"), /fit-wiki log/);
    // The sealed-part budget hints no longer direct a hand-split; `fit-wiki fix`
    // now sub-splits at the block seam.
    for (const id of [
      "weekly-log-part.line-budget",
      "weekly-log-part.word-budget",
    ]) {
      assert.doesNotMatch(hintOf(id), /by hand/);
      assert.match(hintOf(id), /### . block seams/);
    }
  });

  test("weekly-log budget hints are functions resolving to a correctly-targeted rotate command", () => {
    // Copy-paste-safe: the agent comes from the flagged file's prefix, with no
    // placeholder for the caller to substitute. The libutil engine resolves a
    // function hint once per finding (covered in libutil's rules.test.js); here
    // we assert the rule definition produces the right command from the subject.
    const subject = { agentPrefix: "product-manager" };
    const budgetRules = RULES.filter(
      (r) =>
        r.id === "weekly-log.line-budget" || r.id === "weekly-log.word-budget",
    );
    assert.equal(budgetRules.length, 2, "both budget rules present");
    for (const r of budgetRules) {
      assert.equal(typeof r.hint, "function", `${r.id} hint is a function`);
      const hint = r.hint(subject);
      assert.equal(
        hint,
        "run `bunx fit-wiki rotate --agent product-manager` to seal this file as a sealed part and start a fresh weekly log",
      );
      assert.doesNotMatch(hint, /<agent>|<prefix>/);
    }
  });

  test("remediation classes match the annotated set", () => {
    // `fit-wiki fix` dispatches on this field: rotate deterministically,
    // flag for a human, or (default, absent) hand to the agent.
    const REMEDIATION = {
      "weekly-log.line-budget": "rotate",
      "weekly-log.word-budget": "rotate",
      // decision-block.heading-within-5 defaults to "agent" (the writer inserts
      // the heading); part budgets re-bisect deterministically like main logs.
      "weekly-log-part.line-budget": "rotate",
      "weekly-log-part.word-budget": "rotate",
      // A non-grammar filename is flagged for a human — a wrong automated move
      // or delete destroys memory, so admission never auto-fixes.
      "admission.not-in-grammar": "flag",
    };
    for (const rule of RULES) {
      if ("remediation" in rule) {
        assert.match(rule.remediation, /^(rotate|flag|agent)$/);
      }
      assert.equal(
        rule.remediation ?? "agent",
        REMEDIATION[rule.id] ?? "agent",
        `unexpected remediation class for ${rule.id}`,
      );
    }
  });
});
