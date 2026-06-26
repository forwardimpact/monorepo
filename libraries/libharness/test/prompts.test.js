import { describe, test } from "node:test";
import assert from "node:assert";

import {
  FACILITATOR_SYSTEM_PROMPT,
  FACILITATED_AGENT_SYSTEM_PROMPT,
  SUPERVISOR_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT,
  DISCUSS_SYSTEM_PROMPT,
  DISCUSS_AGENT_SYSTEM_PROMPT,
} from "@forwardimpact/libharness";

const FACILITATED_PROMPTS = [
  ["FACILITATOR_SYSTEM_PROMPT", FACILITATOR_SYSTEM_PROMPT],
  ["FACILITATED_AGENT_SYSTEM_PROMPT", FACILITATED_AGENT_SYSTEM_PROMPT],
];
const SUPERVISE_PROMPTS = [
  ["SUPERVISOR_SYSTEM_PROMPT", SUPERVISOR_SYSTEM_PROMPT],
  ["AGENT_SYSTEM_PROMPT", AGENT_SYSTEM_PROMPT],
];
const DISCUSS_PROMPTS = [
  ["DISCUSS_SYSTEM_PROMPT", DISCUSS_SYSTEM_PROMPT],
  ["DISCUSS_AGENT_SYSTEM_PROMPT", DISCUSS_AGENT_SYSTEM_PROMPT],
];
const LEAD_PROMPTS = [
  ["FACILITATOR_SYSTEM_PROMPT", FACILITATOR_SYSTEM_PROMPT],
  ["SUPERVISOR_SYSTEM_PROMPT", SUPERVISOR_SYSTEM_PROMPT],
  ["DISCUSS_SYSTEM_PROMPT", DISCUSS_SYSTEM_PROMPT],
];
const AGENT_PROMPTS = [
  ["FACILITATED_AGENT_SYSTEM_PROMPT", FACILITATED_AGENT_SYSTEM_PROMPT],
  ["AGENT_SYSTEM_PROMPT", AGENT_SYSTEM_PROMPT],
  ["DISCUSS_AGENT_SYSTEM_PROMPT", DISCUSS_AGENT_SYSTEM_PROMPT],
];
const ALL_PROMPTS = [
  ...FACILITATED_PROMPTS,
  ...SUPERVISE_PROMPTS,
  ...DISCUSS_PROMPTS,
];

describe("COALIGNED L0 — leads name Ask and their terminal tool", () => {
  test("facilitator names Ask and Conclude", () => {
    assert.ok(FACILITATOR_SYSTEM_PROMPT.includes("Ask"));
    assert.ok(FACILITATOR_SYSTEM_PROMPT.includes("Conclude"));
  });
  test("supervisor names Ask and Conclude", () => {
    assert.ok(SUPERVISOR_SYSTEM_PROMPT.includes("Ask"));
    assert.ok(SUPERVISOR_SYSTEM_PROMPT.includes("Conclude"));
  });
  test("discuss-lead names Ask, Adjourn, and Recess", () => {
    assert.ok(DISCUSS_SYSTEM_PROMPT.includes("Ask"));
    assert.ok(DISCUSS_SYSTEM_PROMPT.includes("Adjourn"));
    assert.ok(DISCUSS_SYSTEM_PROMPT.includes("Recess"));
  });
});

describe("COALIGNED L0 — leads describe Ask as async and surface auto-resume", () => {
  for (const [name, prompt] of LEAD_PROMPTS) {
    test(`${name} states Ask is async`, () => {
      assert.ok(
        prompt.includes("`Ask` is async"),
        `${name} must say Ask is async so the lead does not assume a sync return`,
      );
    });
    test(`${name} states answers arrive in the inbox on the next turn`, () => {
      assert.ok(
        prompt.includes("`[answer#N]"),
        `${name} must show the answer tag the lead will see on resume`,
      );
      assert.ok(
        prompt.includes("next turn"),
        `${name} must say answers arrive on the next turn`,
      );
    });
    test(`${name} states auto-resume: end the turn while Asks are pending`, () => {
      assert.ok(
        prompt.includes("End your turn while Asks are pending"),
        `${name} must direct the lead to end the turn rather than wait inline`,
      );
      assert.ok(
        prompt.includes("system resumes you"),
        `${name} must name the auto-resume mechanic`,
      );
    });
  }
});

describe("COALIGNED L0 — agents describe inbox arrival of questions", () => {
  for (const [name, prompt] of AGENT_PROMPTS) {
    test(`${name} states questions arrive in the inbox as [ask#N]`, () => {
      assert.ok(
        prompt.includes("`[ask#N]"),
        `${name} must show the ask tag agents will see`,
      );
      assert.ok(
        prompt.includes("inbox"),
        `${name} must name the inbox so the arrival channel is explicit`,
      );
    });
  }
});

describe("COALIGNED L0 — leads state delegation constraint", () => {
  // Supervisor is excluded: it has its own tools (incl. Bash) to do its own
  // work, so it delegates only the agent's task — not all work — via Ask.
  const NO_TOOL_LEADS = [
    ["FACILITATOR_SYSTEM_PROMPT", FACILITATOR_SYSTEM_PROMPT],
    ["DISCUSS_SYSTEM_PROMPT", DISCUSS_SYSTEM_PROMPT],
  ];
  for (const [name, prompt] of NO_TOOL_LEADS) {
    test(`${name} contains delegation constraint`, () => {
      assert.ok(
        prompt.includes("no tools to perform work yourself"),
        `${name} must state that the lead cannot do work directly`,
      );
    });
  }
});

describe("COALIGNED L0 — agents name Answer and carry recursion guard", () => {
  for (const [name, prompt] of AGENT_PROMPTS) {
    test(`${name} names Answer`, () => {
      assert.ok(prompt.includes("Answer"));
    });
    test(`${name} carries recursion guard`, () => {
      assert.ok(
        prompt.includes("Do not redo completed work"),
        `${name} must carry the recursion guard`,
      );
    });
  }
});

describe("COALIGNED L0 — prompts carry no enforcement phrasing", () => {
  const forbidden = [
    "then Answer",
    "then Share",
    "respond via",
    "stop making",
    "must Answer",
    "before your turn",
  ];
  for (const [name, prompt] of ALL_PROMPTS) {
    test(`${name} free of enforcement phrases`, () => {
      for (const phrase of forbidden) {
        assert.ok(!prompt.includes(phrase), `${name} contains "${phrase}"`);
      }
    });
  }
});

describe("COALIGNED L0 — prompts are domain-agnostic", () => {
  const forbidden = ["kata-", "storyboard", "coaching", "Toyota", "meeting"];
  for (const [name, prompt] of ALL_PROMPTS) {
    test(`${name} free of domain vocabulary`, () => {
      for (const word of forbidden) {
        assert.ok(!prompt.includes(word), `${name} contains "${word}"`);
      }
    });
  }
});

describe("COALIGNED L0 — prompts do not reference removed Tell / Share tools", () => {
  for (const [name, prompt] of ALL_PROMPTS) {
    test(`${name} free of Tell / Share references`, () => {
      assert.ok(!prompt.includes("Tell"), `${name} contains "Tell"`);
      assert.ok(!prompt.includes("Share"), `${name} contains "Share"`);
    });
  }
});
