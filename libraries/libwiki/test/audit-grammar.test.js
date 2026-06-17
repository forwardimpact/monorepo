import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPath,
  hasCalendarToken,
  rootSummaryStem,
} from "../src/audit/grammar.js";

// The summary-class files at the wiki root that gate `<agent>/` sidecars.
const AGENTS = new Set([
  "product-manager",
  "release-engineer",
  "staff-engineer",
  "downstream-skill",
]);

const admitted = (p) => classifyPath(p, { rootSummaryAgents: AGENTS });

describe("classifyPath — root classes", () => {
  test("named ledgers admitted", () => {
    for (const f of ["Home.md", "MEMORY.md", "STATUS.md"]) {
      assert.equal(admitted(f), "admitted", f);
    }
  });

  test("summaries admitted (token-free stem)", () => {
    for (const f of ["staff-engineer.md", "downstream-skill.md"]) {
      assert.equal(admitted(f), "admitted", f);
    }
  });

  test("weekly logs and sealed parts admitted", () => {
    assert.equal(admitted("staff-engineer-2026-W24.md"), "admitted");
    assert.equal(admitted("staff-engineer-2026-W24-part3.md"), "admitted");
  });

  test("storyboards admitted", () => {
    assert.equal(admitted("storyboard-2026-M06.md"), "admitted");
  });

  test("all nine dated-deliverable shapes admitted", () => {
    const topics = [
      "trace-analysis",
      "sync-erasure-synthesis",
      "ledger-format-study",
      "parallel-collision",
      "budget-overflow",
      "rotation-debris",
      "claim-race",
      "admission-survey",
      "heading-grammar",
    ];
    for (const topic of topics) {
      assert.equal(admitted(`${topic}-2026-06-11.md`), "admitted", topic);
    }
  });
});

describe("classifyPath — rejections (the defect class)", () => {
  test("#1570 rogue rejected (week token, no exact shape)", () => {
    assert.equal(admitted("product-manager-2026-W24-history.md"), "rejected");
  });

  test("trailing-token smuggling rejected", () => {
    assert.equal(
      admitted("product-manager-2026-W24-history-2026-06-11.md"),
      "rejected",
    );
    assert.equal(
      admitted("product-manager-2026-W24-history-2026-W25.md"),
      "rejected",
    );
  });

  test("standalone bare-year basename rejected", () => {
    // `8080.md` is a lone four-digit segment — a bare-year token matching no
    // exact shape. (The spec's "not a token" example is `8080` *inside* a
    // longer segment; see the admit case below.)
    assert.equal(admitted("8080.md"), "rejected");
    assert.equal(admitted("roadmap-2026.md"), "rejected");
  });

  test("non-.md root file rejected", () => {
    assert.equal(admitted("notes.txt"), "rejected");
  });
});

describe("hasCalendarToken — boundary anchoring", () => {
  test("multi-segment tokens detected (not just bare year)", () => {
    assert.equal(hasCalendarToken("foo-2026-W24"), true); // week
    assert.equal(hasCalendarToken("foo-2026-M06"), true); // month
    assert.equal(hasCalendarToken("foo-2026-06-11"), true); // date
    assert.equal(hasCalendarToken("foo-2026"), true); // bare year
  });

  test("digits inside a longer segment are not a token", () => {
    assert.equal(hasCalendarToken("release8080-notes"), false);
    assert.equal(hasCalendarToken("v2026x"), false);
    // The matching summary filename is therefore admitted.
    assert.equal(admitted("release8080-notes.md"), "admitted");
  });
});

describe("classifyPath — directories", () => {
  test("metrics/ contents admitted by membership at any depth", () => {
    assert.equal(admitted("metrics/kata-design/2026.csv"), "admitted");
    assert.equal(
      admitted("metrics/staff-engineer/trace-analysis/run/x.ndjson"),
      "admitted",
    );
    assert.equal(admitted("metrics/protocol-2026-06-11.md"), "admitted");
  });

  test("<agent>/ sidecar admitted when agent has a root summary", () => {
    assert.equal(admitted("product-manager/exp-51.csv"), "admitted");
    assert.equal(admitted("release-engineer/README.md"), "admitted");
  });

  test("sidecar for a non-summary agent rejected", () => {
    assert.equal(admitted("nonexistent-agent/data.csv"), "rejected");
  });

  test("foreign root directory rejected (the .claude true positive)", () => {
    assert.equal(
      admitted(".claude/worktrees/agent-a41a176e/scratch.md"),
      "rejected",
    );
  });
});

describe("rootSummaryStem", () => {
  test("summary file yields its stem; ledgers and tokened names do not", () => {
    assert.equal(rootSummaryStem("staff-engineer.md"), "staff-engineer");
    assert.equal(rootSummaryStem("MEMORY.md"), null);
    assert.equal(rootSummaryStem("staff-engineer-2026-W24.md"), null);
    assert.equal(rootSummaryStem("notes.txt"), null);
  });
});
