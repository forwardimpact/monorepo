import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Supervisor } from "@forwardimpact/libeval";
import { createMockRunner } from "./mock-runner.js";

const textBlock = (t) => ({
  type: "assistant",
  message: { content: [{ type: "text", text: t }] },
});

describe("Supervisor - batching at the default batchSize", () => {
  test("mid-turn review fires once per 3 agent text messages", async () => {
    // Agent emits 7 text-block assistant messages in one turn. With the
    // default batchSize of 3 the supervisor's mid-turn review should fire
    // twice (after messages 3 and 6) plus once more from the terminal
    // result flush carrying the remaining message — not seven times, as
    // the old per-message flushing would have done.
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
    // Leave batchSize at the default (3) — this is the behaviour we're
    // verifying end-to-end through the supervisor loop.
    assert.strictEqual(agentRunner.batchSize, 3);

    const supervisorRunner = createMockRunner([
      { text: "Welcome. Begin." },
      { text: "Keep going." }, // mid-turn batch 1 (messages 1-3)
      { text: "Keep going." }, // mid-turn batch 2 (messages 4-6)
      { text: "Keep going." }, // terminal result flush (message 7 + result)
      { text: "Good work.\n\nEVALUATION_COMPLETE" }, // end-of-turn review
    ]);

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
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

    // 3 flushes total: two at the batchSize threshold (messages 3 and 6),
    // one at the terminal result (trailing message + result marker).
    assert.strictEqual(
      midTurnReviews.length,
      3,
      "Supervisor should review 3 times per turn, not 7",
    );
  });

  test("EVALUATION_INTERVENTION at the default batchSize still aborts and relays", async () => {
    // Companion to the observation test above: the 3-message batching and
    // the intervention path exercised together.
    //
    // Agent call 1 emits 3 text-block messages (triggering a flush at the
    // 3rd). The supervisor intervenes; the agent SDK session aborts and
    // the supervisor's intervention text is relayed into resume(). Agent
    // call 2 has 1 text block — below the batchSize threshold — so no
    // extra mid-turn flush fires, and the supervisor jumps straight to
    // the end-of-turn review.
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

    const supervisorMessages = [
      undefined,
      [
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "EVALUATION_INTERVENTION Use the documented path.",
              },
            ],
          },
        },
      ],
      undefined,
    ];

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome. Begin." },
        { text: "EVALUATION_INTERVENTION Use the documented path." },
        { text: "Good.\n\nEVALUATION_COMPLETE" },
      ],
      supervisorMessages,
    );

    const output = new PassThrough();
    const supervisor = new Supervisor({
      agentRunner,
      supervisorRunner,
      output,
      maxTurns: 10,
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
      "Resume prompt should carry the supervisor's intervention text",
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
