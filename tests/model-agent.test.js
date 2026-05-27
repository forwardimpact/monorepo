import { describe, it } from "node:test";
import assert from "node:assert";

import { assertThrowsMessage } from "@forwardimpact/libmock";

import {
  deriveReferenceLevel,
  interpolateTeamInstructions,
  renderOrganizationalContext,
} from "@forwardimpact/libskill/agent";

describe("Agent Module", () => {
  describe("deriveReferenceLevel", () => {
    it("selects first level with practitioner-level core skills", () => {
      const levels = [
        {
          id: "junior",
          ordinalRank: 1,
          baseSkillProficiencies: { core: "foundational" },
        },
        {
          id: "mid",
          ordinalRank: 2,
          baseSkillProficiencies: { core: "working" },
        },
        {
          id: "senior",
          ordinalRank: 3,
          baseSkillProficiencies: { core: "practitioner" },
        },
        {
          id: "staff",
          ordinalRank: 4,
          baseSkillProficiencies: { core: "expert" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "senior");
    });

    it("falls back to first working-level level when no practitioner exists", () => {
      const levels = [
        {
          id: "junior",
          ordinalRank: 1,
          baseSkillProficiencies: { core: "awareness" },
        },
        {
          id: "mid",
          ordinalRank: 2,
          baseSkillProficiencies: { core: "working" },
        },
        {
          id: "senior",
          ordinalRank: 3,
          baseSkillProficiencies: { core: "working" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "mid");
    });

    it("falls back to middle level when no practitioner or working exists", () => {
      const levels = [
        {
          id: "G1",
          ordinalRank: 1,
          baseSkillProficiencies: { core: "awareness" },
        },
        {
          id: "G2",
          ordinalRank: 2,
          baseSkillProficiencies: { core: "foundational" },
        },
        {
          id: "G3",
          ordinalRank: 3,
          baseSkillProficiencies: { core: "foundational" },
        },
        {
          id: "G4",
          ordinalRank: 4,
          baseSkillProficiencies: { core: "foundational" },
        },
        {
          id: "G5",
          ordinalRank: 5,
          baseSkillProficiencies: { core: "foundational" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "G3"); // index 2 = floor(5/2)
    });

    it("handles unsorted level input", () => {
      const levels = [
        {
          id: "staff",
          ordinalRank: 4,
          baseSkillProficiencies: { core: "expert" },
        },
        {
          id: "junior",
          ordinalRank: 1,
          baseSkillProficiencies: { core: "foundational" },
        },
        {
          id: "senior",
          ordinalRank: 3,
          baseSkillProficiencies: { core: "practitioner" },
        },
        {
          id: "mid",
          ordinalRank: 2,
          baseSkillProficiencies: { core: "working" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "senior");
    });

    it("throws when no levels provided", () => {
      assertThrowsMessage(
        () => deriveReferenceLevel([]),
        /No levels configured/,
      );
      assertThrowsMessage(
        () => deriveReferenceLevel(null),
        /No levels configured/,
      );
    });

    it("works with single level", () => {
      const levels = [
        {
          id: "only",
          ordinalRank: 1,
          baseSkillProficiencies: { core: "awareness" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "only");
    });

    it("works with different level ID naming conventions", () => {
      // Customer might use L1/L2/L3 or Level1/Level2 or anything
      const levels = [
        {
          id: "Band-A",
          ordinalRank: 1,
          baseSkillProficiencies: { core: "foundational" },
        },
        {
          id: "Band-B",
          ordinalRank: 2,
          baseSkillProficiencies: { core: "working" },
        },
        {
          id: "Band-C",
          ordinalRank: 3,
          baseSkillProficiencies: { core: "practitioner" },
        },
      ];
      const result = deriveReferenceLevel(levels);
      assert.strictEqual(result.id, "Band-C");
    });
  });
});

describe("interpolateTeamInstructions", () => {
  const discipline = {
    roleTitle: "Software Engineer",
    specialization: "Backend Engineering",
  };

  it("replaces {roleTitle} and {specialization} placeholders", () => {
    const agentTrack = {
      teamInstructions:
        "This team supports the {roleTitle} track.\nSpecialization: {specialization}.",
    };
    const result = interpolateTeamInstructions({
      agentTrack,
      humanDiscipline: discipline,
    });
    assert.strictEqual(
      result,
      "This team supports the Software Engineer track.\nSpecialization: Backend Engineering.",
    );
  });

  it("returns null when teamInstructions is absent", () => {
    const agentTrack = { identity: "test" };
    const result = interpolateTeamInstructions({
      agentTrack,
      humanDiscipline: discipline,
    });
    assert.strictEqual(result, null);
  });

  it("returns null when agentTrack is null", () => {
    const result = interpolateTeamInstructions({
      agentTrack: null,
      humanDiscipline: discipline,
    });
    assert.strictEqual(result, null);
  });

  it("returns string unchanged when no placeholders present", () => {
    const agentTrack = { teamInstructions: "Static instructions." };
    const result = interpolateTeamInstructions({
      agentTrack,
      humanDiscipline: discipline,
    });
    assert.strictEqual(result, "Static instructions.");
  });
});

describe("renderOrganizationalContext", () => {
  const fullExample = {
    repositories: ["molecularforge", "data-lake-infra", "api-gateway"],
    team: "pharma-platform",
    manager: "athena",
    adjacentLeads: [
      { handle: "iris", role: "DX" },
      { handle: "prometheus", role: "DS/AI" },
    ],
    projects: ["drug-discovery-pipeline", "lab-data-portal"],
    escalationPaths: [
      {
        trigger: "production page after hours",
        destination: "pagerduty://pharma-platform-oncall",
      },
      {
        trigger: "security incident",
        destination: "security@pharma.example.com",
      },
    ],
  };

  const fullExampleRendered =
    "## Organizational Context\n" +
    "\n" +
    "- **Repositories:** molecularforge, data-lake-infra, api-gateway\n" +
    "- **Team:** pharma-platform\n" +
    "- **Manager:** athena\n" +
    "- **Adjacent leads:** iris (DX), prometheus (DS/AI)\n" +
    "- **Projects:** drug-discovery-pipeline, lab-data-portal\n" +
    "- **Escalation paths:**\n" +
    "  - production page after hours → pagerduty://pharma-platform-oncall\n" +
    "  - security incident → security@pharma.example.com\n";

  it("returns null for null input", () => {
    assert.strictEqual(renderOrganizationalContext(null), null);
  });

  it("returns null for undefined input", () => {
    assert.strictEqual(renderOrganizationalContext(undefined), null);
  });

  it("returns null for empty object", () => {
    assert.strictEqual(renderOrganizationalContext({}), null);
  });

  it("returns null when all concerns are empty", () => {
    const result = renderOrganizationalContext({
      repositories: [],
      team: "",
      manager: "",
      adjacentLeads: [],
      projects: [],
      escalationPaths: [],
    });
    assert.strictEqual(result, null);
  });

  it("emits a single bullet when only manager is populated", () => {
    const result = renderOrganizationalContext({ manager: "athena" });
    assert.strictEqual(
      result,
      "## Organizational Context\n\n- **Manager:** athena\n",
    );
  });

  it("renders the full populated example byte-for-byte", () => {
    assert.strictEqual(
      renderOrganizationalContext(fullExample),
      fullExampleRendered,
    );
  });

  it("emits adjacent leads without a trailing comma when single entry", () => {
    const result = renderOrganizationalContext({
      adjacentLeads: [{ handle: "iris", role: "DX" }],
    });
    assert.match(result, /- \*\*Adjacent leads:\*\* iris \(DX\)\n$/);
    assert.ok(!result.includes("iris (DX),"));
  });

  it("emits a single escalation path as one sub-bullet", () => {
    const result = renderOrganizationalContext({
      escalationPaths: [{ trigger: "incident", destination: "ops@example" }],
    });
    assert.strictEqual(
      result,
      "## Organizational Context\n\n- **Escalation paths:**\n  - incident → ops@example\n",
    );
  });

  it("emits a single repository without commas", () => {
    const result = renderOrganizationalContext({ repositories: ["only-repo"] });
    assert.strictEqual(
      result,
      "## Organizational Context\n\n- **Repositories:** only-repo\n",
    );
  });

  it("suppresses empty arrays under a populated section", () => {
    const result = renderOrganizationalContext({
      repositories: ["one", "two"],
      adjacentLeads: [],
      escalationPaths: [],
    });
    assert.strictEqual(
      result,
      "## Organizational Context\n\n- **Repositories:** one, two\n",
    );
  });

  it("ends with exactly one trailing newline (not zero, not two)", () => {
    const result = renderOrganizationalContext(fullExample);
    assert.ok(result.endsWith("\n"));
    assert.ok(!result.endsWith("\n\n"));
  });
});
