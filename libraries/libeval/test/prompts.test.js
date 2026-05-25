import { describe, test } from "node:test";
import assert from "node:assert";

import {
  FACILITATOR_SYSTEM_PROMPT,
  FACILITATED_AGENT_SYSTEM_PROMPT,
  SUPERVISOR_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT,
} from "@forwardimpact/libeval";

const FACILITATED_PROMPTS = [
  ["FACILITATOR_SYSTEM_PROMPT", FACILITATOR_SYSTEM_PROMPT],
  ["FACILITATED_AGENT_SYSTEM_PROMPT", FACILITATED_AGENT_SYSTEM_PROMPT],
];
const SUPERVISE_PROMPTS = [
  ["SUPERVISOR_SYSTEM_PROMPT", SUPERVISOR_SYSTEM_PROMPT],
  ["AGENT_SYSTEM_PROMPT", AGENT_SYSTEM_PROMPT],
];
const LEAD_PROMPTS = [
  ["FACILITATOR_SYSTEM_PROMPT", FACILITATOR_SYSTEM_PROMPT],
  ["SUPERVISOR_SYSTEM_PROMPT", SUPERVISOR_SYSTEM_PROMPT],
];
const AGENT_PROMPTS = [
  ["FACILITATED_AGENT_SYSTEM_PROMPT", FACILITATED_AGENT_SYSTEM_PROMPT],
  ["AGENT_SYSTEM_PROMPT", AGENT_SYSTEM_PROMPT],
];
const ALL_PROMPTS = [...FACILITATED_PROMPTS, ...SUPERVISE_PROMPTS];

describe("COALIGNED L0 — leads name Ask and their terminal tool", () => {
  test("facilitator names Ask and Conclude", () => {
    assert.ok(FACILITATOR_SYSTEM_PROMPT.includes("Ask"));
    assert.ok(FACILITATOR_SYSTEM_PROMPT.includes("Conclude"));
  });
  test("supervisor names Ask and Conclude", () => {
    assert.ok(SUPERVISOR_SYSTEM_PROMPT.includes("Ask"));
    assert.ok(SUPERVISOR_SYSTEM_PROMPT.includes("Conclude"));
  });
});

describe("COALIGNED L0 — leads state delegation constraint", () => {
  for (const [name, prompt] of LEAD_PROMPTS) {
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
        prompt.includes("Recursion guard"),
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
