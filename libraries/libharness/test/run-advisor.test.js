import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import {
  createMockAgentQuery,
  createMockFs,
  createTestRuntime,
} from "@forwardimpact/libmock";

import { parseRunOptions, wireRunSession } from "../src/commands/run.js";
import { advisorGuidance } from "../src/advisor.js";
import { createNoopRedactor } from "../src/redaction.js";
import { SequenceCounter } from "../src/sequence-counter.js";

const PROFILE_MD = "---\nname: coder\n---\nYou are the coder persona.";

function makeRuntime() {
  return createTestRuntime({
    fs: createMockFs({ "/work/.claude/agents/coder.md": PROFILE_MD }),
  });
}

function parse(values, runtime = makeRuntime()) {
  return parseRunOptions({ "task-text": "do it", cwd: "/work", ...values }, runtime);
}

const adviceMessages = [
  { type: "system", subtype: "init", session_id: "sess-adv" },
  {
    type: "result",
    subtype: "success",
    result: "Advice.",
    total_cost_usd: 0.01,
    usage: { input_tokens: 10, output_tokens: 5 },
  },
];

async function wire({ values = {}, query } = {}) {
  const runtime = makeRuntime();
  const opts = parse(values, runtime);
  const output = new PassThrough();
  const wired = await wireRunSession({
    opts,
    redactor: createNoopRedactor(),
    output,
    counter: new SequenceCounter(),
    query: query ?? createMockAgentQuery(adviceMessages),
    runtime,
  });
  return { ...wired, output, runtime };
}

const outputLines = (output) =>
  (output.read()?.toString() ?? "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);

describe("parseRunOptions - advisor flags", () => {
  test("defaults: no advisor model, max-uses 3", () => {
    const opts = parse();
    assert.strictEqual(opts.advisorModel, undefined);
    assert.strictEqual(opts.advisorMaxUses, 3);
  });

  test("flag values parse through", () => {
    const opts = parse({ "advisor-model": "adv-m", "advisor-max-uses": "5" });
    assert.strictEqual(opts.advisorModel, "adv-m");
    assert.strictEqual(opts.advisorMaxUses, 5);
  });

  test("--advisor-max-uses without --advisor-model is a usage error", () => {
    assert.throws(
      () => parse({ "advisor-max-uses": "5" }),
      /--advisor-max-uses requires --advisor-model/,
    );
  });
});

describe("wireRunSession - advisor wiring", () => {
  test("no advisor flag: no advisor server, no system prompt (today's behavior)", async () => {
    const { runner, advisor } = await wire();
    assert.strictEqual(advisor, null);
    assert.strictEqual(runner.mcpServers, null);
    assert.strictEqual(runner.systemPrompt, null);
  });

  test("advisor server present iff advisorModel is set", async () => {
    const { runner, advisor } = await wire({
      values: { "advisor-model": "adv-m" },
    });
    assert.ok(advisor);
    assert.strictEqual(runner.mcpServers.advisor.type, "sdk");
    assert.deepStrictEqual(
      Object.keys(runner.mcpServers.advisor.instance._registeredTools),
      ["Advisor"],
    );
  });

  test("with a profile the guidance rides the profile amendment", async () => {
    const { runner } = await wire({
      values: { "advisor-model": "adv-m", "agent-profile": "coder" },
    });
    const append = runner.systemPrompt.append;
    assert.match(append, /You are the coder persona\./);
    assert.ok(append.includes(advisorGuidance(3)));
    assert.ok(append.indexOf("<session_protocol>") !== -1);
  });

  test("with no profile the guidance is the sole session-protocol fragment", async () => {
    const { runner } = await wire({ values: { "advisor-model": "adv-m" } });
    assert.deepStrictEqual(runner.systemPrompt, {
      type: "preset",
      preset: "claude_code",
      append: `<session_protocol>\n${advisorGuidance(3)}\n</session_protocol>`,
    });
  });

  test("a consult forwards the seeded composed prompt and lands advisor + consult lines with monotonic seq", async () => {
    const captured = [];
    const query = createMockAgentQuery(adviceMessages, (params) =>
      captured.push(params),
    );
    const { runner, output } = await wire({
      values: { "advisor-model": "adv-m" },
      query,
    });

    const advisorTool =
      runner.mcpServers.advisor.instance._registeredTools.Advisor;
    const result = await advisorTool.handler({ question: "Which way?" }, {});

    assert.match(result.content[0].text, /Advice\./);
    // The recorder was seeded with the composed (preset) system prompt.
    assert.match(captured[0].prompt, /<caller_system_prompt>/);
    assert.match(captured[0].prompt, /\(claude_code preset\)/);
    assert.ok(captured[0].prompt.includes(advisorGuidance(3)));
    assert.strictEqual(captured[0].options.model, "adv-m");

    const lines = outputLines(output);
    const sources = lines.map((l) => l.source);
    assert.deepStrictEqual(sources, ["advisor", "advisor", "orchestrator"]);
    const event = lines[2].event;
    assert.strictEqual(event.type, "advisor_consult");
    assert.strictEqual(event.caller, "agent");
    assert.strictEqual(event.model, "adv-m");
    assert.strictEqual(event.remaining, 2);
    const seqs = lines.map((l) => l.seq);
    for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1]);
  });

  test("onPrompt feeds the recorder: a later consult forwards the delivered task", async () => {
    const captured = [];
    const query = createMockAgentQuery(adviceMessages, (params) =>
      captured.push(params),
    );
    const { runner } = await wire({
      values: { "advisor-model": "adv-m" },
      query,
    });

    await runner.run("The delivered task");
    const advisorTool =
      runner.mcpServers.advisor.instance._registeredTools.Advisor;
    await advisorTool.handler({ question: "Q" }, {});

    const consultParams = captured[captured.length - 1];
    assert.match(consultParams.prompt, /<caller_prompts>\nThe delivered task/);
    assert.match(consultParams.prompt, /<caller_transcript>/);
  });
});
