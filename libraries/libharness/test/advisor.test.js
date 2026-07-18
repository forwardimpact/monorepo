import { describe, test } from "node:test";
import assert from "node:assert";

import { createTestRuntime, createMockAgentQuery } from "@forwardimpact/libmock";

import {
  ADVISOR_SYSTEM_PROMPT,
  advisorGuidance,
  createAdvisor,
  createAdvisorBudget,
  DEFAULT_CONSULT_TIMEOUT_MS,
} from "../src/advisor.js";
import { createTranscriptRecorder } from "../src/transcript-recorder.js";
import { createNoopRedactor } from "../src/redaction.js";

const adviceMessages = [
  { type: "system", subtype: "init", session_id: "sess-adv" },
  {
    type: "result",
    subtype: "success",
    result: "Take the smaller refactor.",
    total_cost_usd: 0.01,
    usage: { input_tokens: 100, output_tokens: 10 },
  },
];

function makeRecorder() {
  const recorder = createTranscriptRecorder({
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: "You are the caller agent.",
    },
    redactor: createNoopRedactor(),
  });
  recorder.recordPrompt("The delivered task");
  recorder.recordMessage('{"type":"assistant","seq":1}');
  return recorder;
}

function baseDeps(overrides = {}) {
  return {
    model: "claude-fable-5",
    cwd: "/tmp/caller",
    query: createMockAgentQuery(adviceMessages),
    recorder: makeRecorder(),
    redactor: createNoopRedactor(),
    runtime: createTestRuntime(),
    onLine: () => {},
    ...overrides,
  };
}

describe("createAdvisor", () => {
  for (const missing of [
    "model",
    "cwd",
    "query",
    "recorder",
    "redactor",
    "runtime",
    "onLine",
  ]) {
    test(`throws on missing ${missing}`, () => {
      const deps = baseDeps();
      delete deps[missing];
      assert.throws(
        () => createAdvisor(deps),
        new RegExp(`${missing} is required`),
      );
    });
  }

  test("one consult runs exactly one session on the advisor model with the restricted tool surface", async () => {
    const captured = [];
    const query = createMockAgentQuery(adviceMessages, (params) =>
      captured.push(params),
    );
    const advisor = createAdvisor(baseDeps({ query }));

    const result = await advisor.consult("Which approach?");

    assert.strictEqual(captured.length, 1);
    const opts = captured[0].options;
    assert.strictEqual(opts.model, "claude-fable-5");
    assert.strictEqual(opts.cwd, "/tmp/caller");
    assert.strictEqual(opts.maxTurns, 5);
    assert.deepStrictEqual(opts.allowedTools, ["Read", "Glob", "Grep"]);
    assert.deepStrictEqual(opts.disallowedTools, [
      "Bash",
      "Write",
      "Edit",
      "Agent",
      "Task",
      "TaskOutput",
      "TaskStop",
    ]);
    assert.ok(opts.systemPrompt.append.includes(ADVISOR_SYSTEM_PROMPT));
    assert.strictEqual(result.advice, "Take the smaller refactor.");
    assert.strictEqual(typeof result.durationMs, "number");
  });

  test("the forwarded prompt carries the whole recorded context and the question", async () => {
    const captured = [];
    const query = createMockAgentQuery(adviceMessages, (params) =>
      captured.push(params),
    );
    const advisor = createAdvisor(baseDeps({ query }));

    await advisor.consult("Which approach?");

    const prompt = captured[0].prompt;
    assert.match(prompt, /<caller_system_prompt>/);
    assert.match(prompt, /You are the caller agent\./);
    assert.match(prompt, /<caller_prompts>\nThe delivered task/);
    assert.match(prompt, /<caller_transcript>\n\{"type":"assistant","seq":1\}/);
    assert.match(prompt, /<consult_question>\nWhich approach\?\n<\/consult_question>/);
  });

  test("a second consult re-renders the record as it stands (stateless)", async () => {
    const captured = [];
    const query = createMockAgentQuery(adviceMessages, (params) =>
      captured.push(params),
    );
    const recorder = makeRecorder();
    const advisor = createAdvisor(baseDeps({ query, recorder }));

    await advisor.consult("First?");
    recorder.recordMessage('{"type":"assistant","seq":2}');
    await advisor.consult("Second?");

    assert.strictEqual(captured.length, 2);
    assert.ok(!captured[0].prompt.includes('"seq":2'));
    assert.ok(captured[1].prompt.includes('"seq":1'));
    assert.ok(captured[1].prompt.includes('"seq":2'));
  });

  test("a hanging query times out to {unavailable}", async () => {
    const hangingQuery = (params) =>
      (async function* () {
        await new Promise((_, reject) => {
          params.options.abortController.signal.addEventListener("abort", () =>
            reject(new Error("aborted by signal")),
          );
        });
      })();
    const advisor = createAdvisor(
      baseDeps({ query: hangingQuery, timeoutMs: 20 }),
    );

    const result = await advisor.consult("Anyone there?");
    assert.strictEqual(result.unavailable, true);
    assert.match(result.reason, /timed out or aborted/);
  });

  test("a throwing query yields {unavailable} with the error reason", async () => {
    const query = () =>
      (async function* () {
        throw new Error("model exploded");
      })();
    const advisor = createAdvisor(baseDeps({ query }));

    const result = await advisor.consult("Q");
    assert.strictEqual(result.unavailable, true);
    assert.match(result.reason, /model exploded/);
  });

  test("abort() during a pending consult yields {unavailable}", async () => {
    const hangingQuery = (params) =>
      (async function* () {
        await new Promise((_, reject) => {
          params.options.abortController.signal.addEventListener("abort", () =>
            reject(new Error("aborted by signal")),
          );
        });
      })();
    const advisor = createAdvisor(baseDeps({ query: hangingQuery }));

    const pending = advisor.consult("Q");
    advisor.abort();
    const result = await pending;
    assert.strictEqual(result.unavailable, true);
    assert.match(result.reason, /timed out or aborted/);
  });

  test("a non-success session resolves {unavailable}, never rejects", async () => {
    const query = createMockAgentQuery([
      { type: "result", subtype: "error", result: "" },
    ]);
    const advisor = createAdvisor(baseDeps({ query }));

    const result = await advisor.consult("Q");
    assert.strictEqual(result.unavailable, true);
    assert.match(result.reason, /advisor session failed/);
  });
});

describe("advisor prompts and budget", () => {
  test("ADVISOR_SYSTEM_PROMPT fixes the response contract and a length ceiling", () => {
    assert.match(ADVISOR_SYSTEM_PROMPT, /assessment/);
    assert.match(ADVISOR_SYSTEM_PROMPT, /recommendation/);
    assert.match(ADVISOR_SYSTEM_PROMPT, /unsolicited findings/);
    assert.match(ADVISOR_SYSTEM_PROMPT, /at most three short paragraphs/);
    assert.match(ADVISOR_SYSTEM_PROMPT, /never modify/);
  });

  test("advisorGuidance names the tool, the judgment call, and the budget", () => {
    const guidance = advisorGuidance(3);
    assert.match(guidance, /`Advisor` tool/);
    assert.match(guidance, /hard decision points/);
    assert.match(guidance, /budget is 3 consults/);
    assert.match(guidance, /never mandatory/);
    assert.match(advisorGuidance(1), /budget is 1 consult,/);
  });

  test("createAdvisorBudget starts at zero used", () => {
    assert.deepStrictEqual(createAdvisorBudget(3), { maxUses: 3, used: 0 });
  });

  test("default consult timeout is five minutes", () => {
    assert.strictEqual(DEFAULT_CONSULT_TIMEOUT_MS, 300_000);
  });
});
