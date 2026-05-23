import { test, describe } from "node:test";
import assert from "node:assert";

import { interpolateTeamInstructions } from "../src/agent.js";

const humanDiscipline = {
  roleTitle: "Software Engineer",
  specialization: "Backend Engineering",
};

const TI = "This team supports the {roleTitle} ({specialization}).";
const TI_RENDERED =
  "This team supports the Software Engineer (Backend Engineering).";

const FULL_EXPECTATIONS = {
  impactScope: "Features and small projects",
  autonomyExpectation: "Work independently on familiar problems",
  influenceScope: "Mentor junior team members",
  complexityHandled: "Moderate complexity with some ambiguity",
};

const FULL_SECTION = [
  "## Level Expectations",
  "",
  "- **Impact scope:** Features and small projects",
  "- **Autonomy:** Work independently on familiar problems",
  "- **Influence scope:** Mentor junior team members",
  "- **Complexity:** Moderate complexity with some ambiguity",
  "",
].join("\n");

describe("interpolateTeamInstructions (level threading)", () => {
  test("case A — populated teamInstructions, level omitted", () => {
    const result = interpolateTeamInstructions({
      agentTrack: { teamInstructions: TI },
      humanDiscipline,
    });
    assert.strictEqual(result, TI_RENDERED);
  });

  test("case B — populated teamInstructions + populated level expectations", () => {
    const result = interpolateTeamInstructions({
      agentTrack: { teamInstructions: TI },
      humanDiscipline,
      level: { id: "J060", expectations: FULL_EXPECTATIONS },
    });
    assert.strictEqual(result, `${TI_RENDERED}\n\n${FULL_SECTION}`);
  });

  test("case C — absent teamInstructions, populated level expectations", () => {
    const result = interpolateTeamInstructions({
      agentTrack: { identity: "test" },
      humanDiscipline,
      level: { id: "J060", expectations: FULL_EXPECTATIONS },
    });
    assert.strictEqual(result, FULL_SECTION);
  });

  test("case D — absent teamInstructions and level omitted", () => {
    const result = interpolateTeamInstructions({
      agentTrack: { identity: "test" },
      humanDiscipline,
    });
    assert.strictEqual(result, null);
  });

  test("case E — populated teamInstructions; level present but expectations: {}", () => {
    const result = interpolateTeamInstructions({
      agentTrack: { teamInstructions: TI },
      humanDiscipline,
      level: { id: "J060", expectations: {} },
    });
    // Byte-equal to case A — empty expectations suppress the section entirely.
    assert.strictEqual(result, TI_RENDERED);
  });

  test("case F — only impactScope populated", () => {
    const result = interpolateTeamInstructions({
      agentTrack: { teamInstructions: TI },
      humanDiscipline,
      level: { id: "J060", expectations: { impactScope: "Features" } },
    });
    const expected = [
      TI_RENDERED,
      "",
      "## Level Expectations",
      "",
      "- **Impact scope:** Features",
      "",
    ].join("\n");
    assert.strictEqual(result, expected);
  });

  test("case G — unknown expectations key is silently dropped (guards future schema additions)", () => {
    const result = interpolateTeamInstructions({
      agentTrack: { teamInstructions: TI },
      humanDiscipline,
      level: {
        id: "J060",
        expectations: {
          impactScope: "Features",
          futurismScope: "Should not leak",
        },
      },
    });
    assert.ok(
      result.includes("- **Impact scope:** Features"),
      "Impact-scope bullet must appear",
    );
    assert.ok(
      !result.includes("futurismScope"),
      "Unknown keys must not leak through",
    );
    assert.ok(
      !result.includes("Should not leak"),
      "Unknown key values must not leak through",
    );
  });
});
