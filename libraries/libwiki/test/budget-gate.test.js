import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BUDGET_RULE_IDS, RULES } from "../src/audit/rules.js";
import {
  budgetRules,
  measureRef,
  revalidateBudgets,
} from "../src/budget-gate.js";
import { countWords } from "../src/budget.js";

// Build an outgoing measurement map: file -> ruleId -> { value, overCap }.
function outgoing(entries) {
  const m = new Map();
  for (const [file, rules] of Object.entries(entries)) {
    const perRule = new Map();
    for (const [ruleId, v] of Object.entries(rules)) perRule.set(ruleId, v);
    m.set(file, perRule);
  }
  return m;
}

// Build a baseline ref map: file -> ruleId -> { value }.
function baseline(entries) {
  const m = new Map();
  for (const [file, rules] of Object.entries(entries)) {
    const perRule = new Map();
    for (const [ruleId, value] of Object.entries(rules)) {
      perRule.set(ruleId, { value });
    }
    m.set(file, perRule);
  }
  return m;
}

describe("budgetRules", () => {
  test("resolves every BUDGET_RULE_ID to a rule object with a scope and axis", () => {
    const rules = budgetRules();
    assert.equal(rules.length, BUDGET_RULE_IDS.size);
    for (const r of rules) {
      assert.ok(BUDGET_RULE_IDS.has(r.id));
      assert.ok(
        ["summary", "weekly-log-main", "weekly-log-part"].includes(r.scope),
      );
      assert.ok(r.axis === "words" || r.axis === "lines");
      assert.equal(typeof r.check, "function");
    }
  });

  test("word-budget ids map to the words axis, line-budget ids to lines", () => {
    for (const r of budgetRules()) {
      assert.equal(r.axis, r.id.endsWith("word-budget") ? "words" : "lines");
    }
  });
});

describe("revalidateBudgets", () => {
  const WORD = "summary.word-budget";

  test("refuses an over-cap file whose value exceeds the worst baseline (merge union)", () => {
    const { refusals, surfaced } = revalidateBudgets({
      outgoing: outgoing({
        "a.md": { [WORD]: { value: 2100, overCap: true } },
      }),
      sessionBase: baseline({ "a.md": { [WORD]: 2000 } }),
      originTip: baseline({ "a.md": { [WORD]: 2040 } }),
    });
    assert.deepEqual(surfaced, []);
    assert.deepEqual(refusals, [
      { file: "a.md", ruleId: WORD, baseline: 2040, value: 2100 },
    ]);
  });

  test("refuses an author overrun with no merge contribution (baseline from session base)", () => {
    const { refusals } = revalidateBudgets({
      outgoing: outgoing({
        "a.md": { [WORD]: { value: 2057, overCap: true } },
      }),
      sessionBase: baseline({ "a.md": { [WORD]: 1998 } }),
      originTip: baseline({ "a.md": { [WORD]: 1998 } }),
    });
    assert.equal(refusals.length, 1);
    assert.equal(refusals[0].baseline, 1998);
    assert.equal(refusals[0].value, 2057);
  });

  test("refuses a push that deepens an existing breach", () => {
    const { refusals } = revalidateBudgets({
      outgoing: outgoing({
        "a.md": { [WORD]: { value: 2200, overCap: true } },
      }),
      sessionBase: baseline({ "a.md": { [WORD]: 2100 } }),
      originTip: baseline({ "a.md": { [WORD]: 2100 } }),
    });
    assert.equal(refusals.length, 1);
  });

  test("passes a foreign pre-existing breach the writer did not worsen", () => {
    const { refusals, surfaced } = revalidateBudgets({
      outgoing: outgoing({
        "a.md": { [WORD]: { value: 2100, overCap: true } },
      }),
      sessionBase: baseline({ "a.md": { [WORD]: 2100 } }),
      originTip: baseline({ "a.md": { [WORD]: 2100 } }),
    });
    assert.deepEqual(refusals, []);
    assert.deepEqual(surfaced, []);
  });

  test("passes an owner trim that leaves a breached file at or below baseline", () => {
    const { refusals } = revalidateBudgets({
      outgoing: outgoing({
        "a.md": { [WORD]: { value: 2060, overCap: true } },
      }),
      sessionBase: baseline({ "a.md": { [WORD]: 2100 } }),
      originTip: baseline({ "a.md": { [WORD]: 2100 } }),
    });
    assert.deepEqual(refusals, []);
  });

  test("never refuses an under-cap file even when its value rose", () => {
    const { refusals } = revalidateBudgets({
      outgoing: outgoing({
        "a.md": { [WORD]: { value: 2000, overCap: false } },
      }),
      sessionBase: baseline({ "a.md": { [WORD]: 1900 } }),
      originTip: baseline({ "a.md": { [WORD]: 1900 } }),
    });
    assert.deepEqual(refusals, []);
  });

  test("treats an absent baseline as value 0 (max over both refs)", () => {
    const { refusals } = revalidateBudgets({
      outgoing: outgoing({
        "new.md": { [WORD]: { value: 2100, overCap: true } },
      }),
      sessionBase: null,
      originTip: baseline({}),
    });
    assert.equal(refusals.length, 1);
    assert.equal(refusals[0].baseline, 0);
  });

  test("surfaces (does not refuse) a summary breach on an exempt file", () => {
    const { refusals, surfaced } = revalidateBudgets({
      outgoing: outgoing({
        "a.md": { [WORD]: { value: 2100, overCap: true } },
      }),
      sessionBase: baseline({ "a.md": { [WORD]: 2000 } }),
      originTip: baseline({ "a.md": { [WORD]: 2000 } }),
      exemptSummaryFiles: ["a.md"],
    });
    assert.deepEqual(refusals, []);
    assert.equal(surfaced.length, 1);
    assert.equal(surfaced[0].file, "a.md");
  });

  test("exemption covers only summary predicates, not weekly-log on the same push", () => {
    const WL = "weekly-log.word-budget";
    const { refusals, surfaced } = revalidateBudgets({
      outgoing: outgoing({
        "a.md": { [WORD]: { value: 2100, overCap: true } },
        "w.md": { [WL]: { value: 7000, overCap: true } },
      }),
      sessionBase: baseline({
        "a.md": { [WORD]: 2000 },
        "w.md": { [WL]: 6000 },
      }),
      originTip: baseline({ "a.md": { [WORD]: 2000 }, "w.md": { [WL]: 6000 } }),
      exemptSummaryFiles: ["a.md"],
    });
    assert.equal(surfaced.length, 1);
    assert.equal(refusals.length, 1);
    assert.equal(refusals[0].file, "w.md");
  });
});

describe("measureRef", () => {
  // A summary file body with `n` words; the H1 makes it classify as a summary
  // for any caller that reads it, but measureRef counts the whole blob text.
  const showFileFor = (bodies) => async (_ref, file) => bodies[file] ?? null;

  test("counts each budgeted file's blob and flags over-cap via the rule check", async () => {
    const overCapWords = `${"word ".repeat(2049)}`; // > 2048 summary cap
    const measured = await measureRef(
      showFileFor({ "x.md": overCapWords }),
      "HEAD",
      [{ relPath: "x.md", scope: "summary" }],
    );
    const perRule = measured.get("x.md");
    assert.equal(perRule.get("summary.word-budget").value, 2049);
    assert.equal(perRule.get("summary.word-budget").overCap, true);
    // Lines: a single line is well under the 496 line cap.
    assert.equal(perRule.get("summary.line-budget").overCap, false);
  });

  test("criterion 8 (measurement parity): the gate value equals the audit's countWords", async () => {
    const text = `# A — Summary\n${"word ".repeat(123)}`;
    const measured = await measureRef(showFileFor({ "x.md": text }), "HEAD", [
      { relPath: "x.md", scope: "summary" },
    ]);
    assert.equal(
      measured.get("x.md").get("summary.word-budget").value,
      countWords(text),
    );
  });

  test("an absent file counts as zero and is under cap", async () => {
    const measured = await measureRef(showFileFor({}), "HEAD", [
      { relPath: "gone.md", scope: "summary" },
    ]);
    const perRule = measured.get("gone.md");
    assert.equal(perRule.get("summary.word-budget").value, 0);
    assert.equal(perRule.get("summary.word-budget").overCap, false);
  });

  // Criterion 8, predicate-inheritance half: the gate's over-cap decision is
  // the budget rule's own `check`. Tightening that predicate in RULES changes
  // the gate's verdict for unchanged content with no gate-code change.
  test("a tighter budget predicate flows through the gate with no gate change", async () => {
    const rule = RULES.find((r) => r.id === "summary.word-budget");
    const original = rule.check;
    const under = `${"word ".repeat(100)}`; // 100 words: under the real 2048 cap
    try {
      const before = await measureRef(showFileFor({ "x.md": under }), "HEAD", [
        { relPath: "x.md", scope: "summary" },
      ]);
      assert.equal(
        before.get("x.md").get("summary.word-budget").overCap,
        false,
      );

      rule.check = (s) => (s.words > 50 ? { value: s.words } : null);
      const after = await measureRef(showFileFor({ "x.md": under }), "HEAD", [
        { relPath: "x.md", scope: "summary" },
      ]);
      assert.equal(after.get("x.md").get("summary.word-budget").overCap, true);
    } finally {
      rule.check = original;
    }
  });
});
