import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { Supervisor } from "@forwardimpact/libeval";
import { isIntervention } from "../src/supervisor.js";
import { createMockRunner } from "./mock-runner.js";

describe("isIntervention", () => {
  test("detects EVALUATION_INTERVENTION on its own line", () => {
    assert.strictEqual(isIntervention("EVALUATION_INTERVENTION"), true);
    assert.strictEqual(
      isIntervention("Some text\nEVALUATION_INTERVENTION\nMore text"),
      true,
    );
    assert.strictEqual(
      isIntervention("Stop.\n\nEVALUATION_INTERVENTION"),
      true,
    );
  });

  test("tolerates markdown formatting around the signal", () => {
    assert.strictEqual(isIntervention("**EVALUATION_INTERVENTION**"), true);
    assert.strictEqual(isIntervention("*EVALUATION_INTERVENTION*"), true);
    assert.strictEqual(isIntervention("__EVALUATION_INTERVENTION__"), true);
    assert.strictEqual(isIntervention("_EVALUATION_INTERVENTION_"), true);
    assert.strictEqual(isIntervention("`EVALUATION_INTERVENTION`"), true);
    assert.strictEqual(
      isIntervention(
        "Wrong path.\n\n**EVALUATION_INTERVENTION**\n\nTry the documented one.",
      ),
      true,
    );
  });

  test("matches EVALUATION_INTERVENTION inline", () => {
    assert.strictEqual(
      isIntervention("Stopping you with EVALUATION_INTERVENTION now."),
      true,
    );
    assert.strictEqual(
      isIntervention("Note: EVALUATION_INTERVENTION. Switch to Y."),
      true,
    );
  });

  test("does not match empty or unrelated text", () => {
    assert.strictEqual(isIntervention(""), false);
    assert.strictEqual(isIntervention("Stop and think."), false);
    assert.strictEqual(isIntervention("INTERVENTION"), false);
  });

  test("does not match EVALUATION_COMPLETE alone", () => {
    assert.strictEqual(isIntervention("EVALUATION_COMPLETE"), false);
    assert.strictEqual(
      isIntervention("Good work.\n\nEVALUATION_COMPLETE"),
      false,
    );
  });
});

describe("Supervisor - mid-turn intervention", () => {
  test("observation without intervention does not interrupt the agent", async () => {
    // Agent emits one structured assistant text block — fires onBatch once.
    // Supervisor responds with "Keep going." — neither signal flag is set,
    // so the agent's SDK session completes naturally and the end-of-turn
    // review then emits EVALUATION_COMPLETE.
    const agentMessages = [
      [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "I'm working on it." }],
          },
        },
      ],
    ];

    const agentRunner = createMockRunner(
      [{ text: "I'm working on it." }],
      agentMessages,
    );

    const supervisorRunner = createMockRunner([
      { text: "Welcome! Please install." },
      { text: "Keep going." },
      { text: "Good work.\n\nEVALUATION_COMPLETE" },
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

    let agentResumeCalls = 0;
    const origAgentResume = agentRunner.resume;
    agentRunner.resume = async (prompt) => {
      agentResumeCalls++;
      return origAgentResume.call(agentRunner, prompt);
    };

    const result = await supervisor.run("Install");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
    assert.strictEqual(
      agentResumeCalls,
      0,
      "Agent should not be resumed when supervisor never intervenes",
    );

    // Trace must contain a mid_turn_review marker but no intervention markers.
    const data = output.read()?.toString() ?? "";
    const orchestratorEvents = data
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l))
      .filter((e) => e.source === "orchestrator");
    assert.ok(
      orchestratorEvents.some((e) => e.event?.type === "mid_turn_review"),
      "Trace should contain mid_turn_review when onBatch fires",
    );
    assert.ok(
      !orchestratorEvents.some(
        (e) => e.event?.type === "intervention_requested",
      ),
      "Trace should not contain intervention_requested when supervisor only observes",
    );
  });

  test("EVALUATION_INTERVENTION from mid-turn batch interrupts and relays", async () => {
    // Agent's first call fires onBatch on a structured assistant text block;
    // supervisor responds with EVALUATION_INTERVENTION → abort + relay.
    // Agent's second call (resume) finishes naturally; end-of-turn review
    // then emits EVALUATION_COMPLETE.
    const agentMessages = [
      [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "I'll try the wrong path." }],
          },
        },
      ],
      [
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "OK, switching to the documented path." },
            ],
          },
        },
      ],
    ];

    const agentRunner = createMockRunner(
      [
        { text: "I'll try the wrong path." },
        { text: "OK, switching to the documented path." },
      ],
      agentMessages,
    );

    // Supervisor responses (in order):
    //   0: turn 0 introduction
    //   1: mid-turn 1 batch 1 — intervene
    //   2: mid-turn 1 batch 1 (post-resume) — keep going
    //   3: end-of-turn 1 — EVALUATION_COMPLETE
    const supervisorMessages = [
      undefined,
      [
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "EVALUATION_INTERVENTION Stop and use the documented path.",
              },
            ],
          },
        },
      ],
      undefined,
      undefined,
    ];

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome." },
        { text: "EVALUATION_INTERVENTION Stop and use the documented path." },
        { text: "Keep going." },
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

    let agentResumeCalls = 0;
    let firstResumePrompt = null;
    const origAgentResume = agentRunner.resume;
    agentRunner.resume = async (prompt) => {
      agentResumeCalls++;
      if (agentResumeCalls === 1) firstResumePrompt = prompt;
      return origAgentResume.call(agentRunner, prompt);
    };

    const result = await supervisor.run("Install");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
    assert.strictEqual(
      agentResumeCalls,
      1,
      "Agent should be resumed exactly once after intervention",
    );
    assert.ok(
      firstResumePrompt && firstResumePrompt.includes("documented path"),
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
      "Trace should contain intervention_requested orchestrator event",
    );
    assert.ok(
      orchestratorEvents.some((e) => e.event?.type === "intervention_relayed"),
      "Trace should contain intervention_relayed orchestrator event",
    );
  });

  test("EVALUATION_INTERVENTION and EVALUATION_COMPLETE in the same turn", async () => {
    // Batch 1: supervisor intervenes (abort + relay).
    // After resume, batch 1 of resume: supervisor writes EVALUATION_COMPLETE
    // (mid-turn) — the loop must exit success without running an end-of-turn
    // review.
    const agentMessages = [
      [
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "Trying X." }] },
        },
      ],
      [
        {
          type: "assistant",
          message: { content: [{ type: "text", text: "OK trying Y." }] },
        },
      ],
    ];

    const agentRunner = createMockRunner(
      [{ text: "Trying X." }, { text: "Trying Y." }],
      agentMessages,
    );

    const supervisorMessages = [
      undefined,
      [
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "EVALUATION_INTERVENTION Try Y instead.",
              },
            ],
          },
        },
      ],
      [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Excellent. EVALUATION_COMPLETE" }],
          },
        },
      ],
    ];

    const supervisorRunner = createMockRunner(
      [
        { text: "Welcome." },
        { text: "EVALUATION_INTERVENTION Try Y instead." },
        { text: "Excellent. EVALUATION_COMPLETE" },
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

    let agentResumeCalls = 0;
    const origAgentResume = agentRunner.resume;
    agentRunner.resume = async (prompt) => {
      agentResumeCalls++;
      return origAgentResume.call(agentRunner, prompt);
    };

    const result = await supervisor.run("Install");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.turns, 1);
    assert.strictEqual(
      agentResumeCalls,
      1,
      "Agent.resume runs once (after intervention); EVALUATION_COMPLETE then ends the turn",
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
      orchestratorEvents.some((e) => e.event?.type === "complete_requested"),
      "Trace should contain complete_requested for mid-turn EVALUATION_COMPLETE",
    );
  });
});
