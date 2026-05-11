import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Supervisor } from "@forwardimpact/libeval";
import {
  createOrchestrationContext,
  createConcludeHandler,
  createRedirectHandler,
} from "../src/orchestration-toolkit.js";
import { createNoopRedactor } from "../src/redaction.js";
import { createMockRunner } from "./mock-runner.js";
import {
  createToolUseMsg,
  createTextBlockMsg as textBlock,
} from "@forwardimpact/libharness";

const noop = () => createNoopRedactor();

const concludeMsg = (summary, verdict = "success") =>
  createToolUseMsg("Conclude", { verdict, summary });
const redirectMsg = (message) => createToolUseMsg("Redirect", { message });

describe("Supervisor - batching at the default batchSize", () => {
  test("mid-turn review fires once per 3 agent text messages", async () => {
    const ctx = createOrchestrationContext();
    const concludeHandler = createConcludeHandler(ctx);

    const agentMessages = [
      [
        textBlock("step 1"),
        textBlock("step 2"),
        textBlock("step 3"),
        textBlock("step 4"),
        textBlock("step 5"),
        textBlock("step 6"),
        textBlock("step 7"),
        { type: "result", subtype: "success", result: "Done." },
      ],
    ];

    const agentRunner = createMockRunner(
      [{ text: "Finished." }],
      agentMessages,
    );
    assert.strictEqual(agentRunner.batchSize, 3);

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome. Begin." },
        { text: "Keep going." },
        { text: "Keep going." },
        { text: "Keep going." },
        { text: "Done" },
      ],
      [undefined, undefined, undefined, undefined, [concludeMsg("Complete")]],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    const result = await supervisor.run("Do the task");
    assert.strictEqual(result.success, true);

    const midTurnReviews = (output.read()?.toString() ?? "")
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
      .filter(
        (l) =>
          l.source === "orchestrator" && l.event?.type === "mid_turn_review",
      );

    assert.strictEqual(
      midTurnReviews.length,
      3,
      "Supervisor should review 3 times per turn, not 7",
    );
  });

  test("Redirect at the default batchSize still aborts and relays", async () => {
    const ctx = createOrchestrationContext();
    const concludeHandler = createConcludeHandler(ctx);
    const redirectHandler = createRedirectHandler(ctx);

    const agentMessages = [
      [
        textBlock("reading docs"),
        textBlock("running Bash"),
        textBlock("found the wrong path"),
      ],
      [textBlock("corrected, using the documented path")],
    ];

    const agentRunner = createMockRunner(
      [{ text: "wrong path" }, { text: "corrected" }],
      agentMessages,
    );
    assert.strictEqual(agentRunner.batchSize, 3);

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome. Begin." },
        { text: "Use the documented path." },
        { text: "Done" },
      ],
      [
        undefined,
        [redirectMsg("Use the documented path.")],
        [concludeMsg("Complete")],
      ],
      {
        toolDispatcher: {
          Conclude: (input) => concludeHandler(input),
          Redirect: (input) => redirectHandler(input),
        },
      },
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
      ctx,
      redactor: noop(),
    });
    agentRunner.onLine = (line) => supervisor.emitLine(line);
    supervisorRunner.onLine = (line) => supervisor.emitLine(line);

    let resumePrompt = null;
    const origResume = agentRunner.resume;
    agentRunner.resume = async (prompt) => {
      resumePrompt = prompt;
      return origResume.call(agentRunner, prompt);
    };

    const result = await supervisor.run("Install");
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
    assert.ok(
      resumePrompt && resumePrompt.includes("documented path"),
      "Resume prompt should carry the redirect message",
    );

    const orchestratorEvents = (output.read()?.toString() ?? "")
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
      .filter((e) => e.source === "orchestrator");
    assert.ok(
      orchestratorEvents.some(
        (e) => e.event?.type === "intervention_requested",
      ),
      "Trace should contain intervention_requested",
    );
    assert.ok(
      orchestratorEvents.some((e) => e.event?.type === "intervention_relayed"),
      "Trace should contain intervention_relayed",
    );
  });
});
