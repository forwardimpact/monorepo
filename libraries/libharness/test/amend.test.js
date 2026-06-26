import { describe, test } from "node:test";
import assert from "node:assert";
import { Writable } from "node:stream";

import {
  Facilitator,
  Supervisor,
  createFacilitator,
  createAgentRunner,
  FACILITATED_AGENT_SYSTEM_PROMPT,
} from "@forwardimpact/libharness";
import {
  createOrchestrationContext,
  createConcludeHandler,
} from "../src/orchestration-toolkit.js";
import { MessageBus } from "../src/message-bus.js";
import { createNoopRedactor } from "../src/redaction.js";
import { createMockRunner } from "./mock-runner.js";
import { createToolUseMsg, createTestRuntime } from "@forwardimpact/libmock";

const noop = () => createNoopRedactor();

const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });

function devNullStream() {
  return new Writable({
    write(_c, _e, cb) {
      cb();
    },
  });
}

describe("systemPromptAmend delivery (SC 7 a)", () => {
  test("Facilitator appends systemPromptAmend after FACILITATED_AGENT_SYSTEM_PROMPT", () => {
    const facilitator = createFacilitator({
      facilitatorCwd: "/tmp/fac",
      agentConfigs: [
        {
          name: "agent-1",
          role: "worker",
          cwd: "/tmp/agent",
          systemPromptAmend: "<TEST_MARKER>",
        },
      ],
      query: async function* () {},
      output: devNullStream(),
      redactor: noop(),
      runtime: createTestRuntime(),
    });
    const append = facilitator.agents[0].runner.systemPrompt.append;
    assert.ok(append.includes(FACILITATED_AGENT_SYSTEM_PROMPT));
    // The amendment is folded transparently into the <session_protocol>
    // section — after the protocol trailer, before the closing tag.
    const amendAt = append.indexOf("<TEST_MARKER>");
    assert.ok(
      append.indexOf(FACILITATED_AGENT_SYSTEM_PROMPT) < amendAt,
      "amendment follows the protocol trailer",
    );
    assert.ok(
      amendAt < append.indexOf("</session_protocol>"),
      "amendment lands inside the <session_protocol> section",
    );
  });

  test("Facilitator without systemPromptAmend wraps just the protocol", () => {
    const facilitator = createFacilitator({
      facilitatorCwd: "/tmp/fac",
      agentConfigs: [{ name: "agent-1", role: "worker", cwd: "/tmp/agent" }],
      query: async function* () {},
      output: devNullStream(),
      redactor: noop(),
      runtime: createTestRuntime(),
    });
    assert.strictEqual(
      facilitator.agents[0].runner.systemPrompt.append,
      `<session_protocol>\n${FACILITATED_AGENT_SYSTEM_PROMPT}\n</session_protocol>`,
    );
  });
});

describe("taskAmend delivery (SC 7 b)", () => {
  test("AgentRunner prepends taskAmend onto the SDK prompt", async () => {
    let captured = null;
    const runner = createAgentRunner({
      cwd: "/tmp",
      query: async function* ({ prompt }) {
        captured = prompt;
        yield { type: "result", subtype: "success", result: "" };
      },
      output: devNullStream(),
      taskAmend: "<TEST_APPEND>",
      redactor: noop(),
    });
    await runner.run("base task");
    assert.strictEqual(captured, "base task\n\n<TEST_APPEND>");
  });

  test("Facilitator concatenates taskAmend onto the initial task", async () => {
    const ctx = createOrchestrationContext();
    const messageBus = new MessageBus({ participants: ["facilitator", "a"] });
    ctx.messageBus = messageBus;
    ctx.participants = [
      { name: "facilitator", role: "facilitator" },
      { name: "a", role: "a" },
    ];
    let capturedTask = null;
    const facilitatorRunner = createMockRunner(
      [{ text: "Done" }],
      [[concludeMsg("Complete")]],
      { toolDispatcher: { Conclude: (i) => createConcludeHandler(ctx)(i) } },
    );
    const origRun = facilitatorRunner.run;
    facilitatorRunner.run = async (task) => {
      capturedTask = task;
      return origRun.call(facilitatorRunner, task);
    };
    const facilitator = new Facilitator({
      facilitatorRunner,
      agents: [{ name: "a", role: "a", runner: createMockRunner([]) }],
      messageBus,
      output: devNullStream(),
      maxTurns: 10,
      ctx,
      taskAmend: "<TEST_APPEND>",
      redactor: noop(),
    });
    await facilitator.run("base task");
    assert.strictEqual(capturedTask, "base task\n\n<TEST_APPEND>");
  });

  test("Supervisor concatenates taskAmend onto the initial task", async () => {
    const ctx = createOrchestrationContext();
    const messageBus = new MessageBus({
      participants: ["supervisor", "agent"],
    });
    ctx.messageBus = messageBus;
    ctx.participants = [
      { name: "supervisor", role: "supervisor" },
      { name: "agent", role: "agent" },
    ];
    let capturedTask = null;
    const supervisorRunner = createMockRunner(
      [{ text: "Done" }],
      [[concludeMsg("Complete")]],
      { toolDispatcher: { Conclude: (i) => createConcludeHandler(ctx)(i) } },
    );
    const origRun = supervisorRunner.run;
    supervisorRunner.run = async (task) => {
      capturedTask = task;
      return origRun.call(supervisorRunner, task);
    };
    const supervisor = new Supervisor({
      agentRunner: createMockRunner([]),
      supervisorRunner,
      output: devNullStream(),
      maxTurns: 10,
      ctx,
      messageBus,
      taskAmend: "<TEST_APPEND>",
      redactor: noop(),
    });
    await supervisor.run("base task");
    assert.strictEqual(capturedTask, "base task\n\n<TEST_APPEND>");
  });
});
