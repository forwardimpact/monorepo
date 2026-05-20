import { test, describe } from "node:test";
import assert from "node:assert";

import { buildPrompt, formatReply } from "../index.js";

describe("buildPrompt", () => {
  test("returns just the message text when history is empty", () => {
    assert.strictEqual(buildPrompt("hello", []), "hello");
  });

  test("prepends prior exchanges in chronological order", () => {
    const history = [
      { role: "user", text: "first question" },
      { role: "assistant", text: "first answer" },
    ];
    const result = buildPrompt("follow-up", history);
    assert.match(result, /Prior conversation:/);
    assert.match(result, /User: first question/);
    assert.match(result, /Agent: first answer/);
    assert.match(result, /Current message: follow-up/);
    assert.ok(
      result.indexOf("first question") < result.indexOf("first answer"),
      "user message must precede agent reply",
    );
    assert.ok(
      result.indexOf("first answer") < result.indexOf("follow-up"),
      "history must precede current message",
    );
  });

  test("caps history to the last 5 exchanges (10 entries)", () => {
    const history = [];
    for (let i = 0; i < 8; i++) {
      history.push({ role: "user", text: `q${i}` });
      history.push({ role: "assistant", text: `a${i}` });
    }
    const result = buildPrompt("now", history);
    // Oldest 3 exchanges (entries 0..5) are dropped; q5..q7 / a5..a7 remain.
    for (let i = 0; i < 3; i++) {
      assert.ok(
        !new RegExp(`User: q${i}\\b`).test(result),
        `q${i} must be dropped`,
      );
      assert.ok(
        !new RegExp(`Agent: a${i}\\b`).test(result),
        `a${i} must be dropped`,
      );
    }
    for (let i = 3; i < 8; i++) {
      assert.match(result, new RegExp(`User: q${i}\\b`));
      assert.match(result, new RegExp(`Agent: a${i}\\b`));
    }
  });

  test("drops the oldest entries when the prompt exceeds the character cap", () => {
    const big = "x".repeat(1500);
    const history = [
      { role: "user", text: `oldest ${big}` },
      { role: "assistant", text: `old reply ${big}` },
      { role: "user", text: `newer ${big}` },
      { role: "assistant", text: `newer reply ${big}` },
    ];
    const result = buildPrompt("now", history);
    assert.ok(
      result.length <= 4000,
      `expected <=4000 chars, got ${result.length}`,
    );
    // Older entries must be dropped first; newer must remain in the result.
    assert.ok(!result.includes("oldest"), "oldest entry must be dropped");
    assert.match(result, /Current message: now/);
  });
});

describe("formatReply", () => {
  test("formats verdict and summary in bold + dash form", () => {
    assert.strictEqual(
      formatReply({ verdict: "success", summary: "done" }),
      "**success** — done",
    );
  });

  test("appends a run-log link when run_url is present", () => {
    const out = formatReply({
      verdict: "failure",
      summary: "diagnosed root cause",
      run_url: "https://github.com/foo/bar/actions/runs/9",
    });
    assert.match(out, /\*\*failure\*\* — diagnosed root cause/);
    assert.match(
      out,
      /\[run log\]\(https:\/\/github\.com\/foo\/bar\/actions\/runs\/9\)/,
    );
  });

  test("falls back to 'unknown' when verdict is missing", () => {
    const out = formatReply({ summary: "no verdict" });
    assert.match(out, /\*\*unknown\*\*/);
  });
});
