import { describe, test } from "node:test";
import assert from "node:assert";

import {
  advisorTool,
  createFacilitatedAgentToolServer,
  createOrchestrationContext,
  createSupervisedAgentToolServer,
} from "../src/orchestration-toolkit.js";
import { createDiscussAgentToolServer } from "../src/discuss-tools.js";
import { createAdvisorBudget } from "../src/advisor.js";

const registeredTools = (server) =>
  Object.keys(server.instance._registeredTools);

function makeTool({ budget, consultResult, from = "agent-1" } = {}) {
  const consults = [];
  const events = [];
  const t = advisorTool({
    from,
    consult: async (question) => {
      consults.push(question);
      return consultResult ?? { advice: "Do X.", durationMs: 42 };
    },
    emit: (e) => events.push(e),
    budget: budget ?? createAdvisorBudget(3),
    model: "claude-fable-5",
  });
  return { t, consults, events };
}

describe("advisorTool", () => {
  test("a consult returns the advice with a remaining-budget footer and emits the consult event", async () => {
    const budget = createAdvisorBudget(3);
    const { t, events } = makeTool({ budget });

    const result = await t.handler({ question: "Which fork?" }, {});

    assert.ok(!result.isError);
    assert.strictEqual(
      result.content[0].text,
      "Do X.\n\n[advisor consults remaining: 2]",
    );
    assert.deepStrictEqual(events, [
      {
        type: "advisor_consult",
        caller: "agent-1",
        question: "Which fork?",
        model: "claude-fable-5",
        durationMs: 42,
        remaining: 2,
      },
    ]);
    assert.strictEqual(budget.used, 1);
  });

  test("an unavailable consult returns a fail-open text result (not isError) and still emits the event", async () => {
    const { t, events } = makeTool({
      consultResult: { unavailable: true, reason: "timed out", durationMs: 7 },
    });

    const result = await t.handler({ question: "Q" }, {});

    assert.ok(!result.isError);
    assert.strictEqual(
      result.content[0].text,
      "The advisor is unavailable (timed out) — proceed with your best judgment.",
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "advisor_consult");
    assert.strictEqual(events[0].durationMs, 7);
  });

  test("the cap is enforced in code: consult n+1 starts no session and emits no event", async () => {
    const budget = createAdvisorBudget(2);
    const { t, consults, events } = makeTool({ budget });

    await t.handler({ question: "1" }, {});
    await t.handler({ question: "2" }, {});
    const denied = await t.handler({ question: "3" }, {});

    assert.strictEqual(consults.length, 2);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(
      denied.content[0].text,
      "Consult limit reached (2/2 used) — proceed with your best judgment.",
    );
    assert.strictEqual(budget.used, 2);
  });

  test("the counter is shared across two handlers built over one budget object", async () => {
    const budget = createAdvisorBudget(1);
    const a = makeTool({ budget, from: "agent-a" });
    const b = makeTool({ budget, from: "agent-b" });

    await a.t.handler({ question: "from a" }, {});
    const denied = await b.t.handler({ question: "from b" }, {});

    assert.strictEqual(b.consults.length, 0);
    assert.match(denied.content[0].text, /Consult limit reached \(1\/1 used\)/);
  });
});

describe("agent tool-server extraTools seam", () => {
  const ctx = () => {
    const c = createOrchestrationContext();
    c.rfcs = [];
    return c;
  };
  const extra = () => {
    const { t } = makeTool();
    return t;
  };

  test("supervised agent server includes an injected extra tool and defaults to the unchanged surface", () => {
    const withExtra = createSupervisedAgentToolServer(ctx(), {
      extraTools: [extra()],
    });
    assert.deepStrictEqual(registeredTools(withExtra), [
      "Ask",
      "Answer",
      "Announce",
      "RollCall",
      "Advisor",
    ]);
    assert.deepStrictEqual(
      registeredTools(createSupervisedAgentToolServer(ctx())),
      ["Ask", "Answer", "Announce", "RollCall"],
    );
  });

  test("facilitated agent server includes an injected extra tool and defaults to the unchanged surface", () => {
    const withExtra = createFacilitatedAgentToolServer(ctx(), {
      from: "agent-1",
      extraTools: [extra()],
    });
    assert.deepStrictEqual(registeredTools(withExtra), [
      "Ask",
      "Answer",
      "Announce",
      "RollCall",
      "RequestForComment",
      "Advisor",
    ]);
    assert.deepStrictEqual(
      registeredTools(
        createFacilitatedAgentToolServer(ctx(), { from: "agent-1" }),
      ),
      ["Ask", "Answer", "Announce", "RollCall", "RequestForComment"],
    );
  });

  test("discuss agent server includes an injected extra tool and defaults to the unchanged surface", () => {
    const withExtra = createDiscussAgentToolServer(ctx(), {
      from: "agent-1",
      extraTools: [extra()],
    });
    assert.deepStrictEqual(registeredTools(withExtra), [
      "Ask",
      "Answer",
      "Announce",
      "RollCall",
      "RequestForComment",
      "Acknowledge",
      "Advisor",
    ]);
    assert.deepStrictEqual(
      registeredTools(createDiscussAgentToolServer(ctx(), { from: "agent-1" })),
      [
        "Ask",
        "Answer",
        "Announce",
        "RollCall",
        "RequestForComment",
        "Acknowledge",
      ],
    );
  });
});
