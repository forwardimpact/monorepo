import { test, describe } from "node:test";
import assert from "node:assert";

import {
  buildLevelView,
  buildBehaviourView,
  buildDisciplineView,
  buildTrackView,
  buildStageView,
  buildDriverView,
  buildToolView,
  aggregateTools,
  slugifyToolName,
} from "../../src/view-builders/index.js";
import {
  levelIri,
  behaviourIri,
  disciplineIri,
  trackIri,
  stageIri,
  driverIri,
  toolIri,
  skillIri,
  driverIri as driverIriFn,
} from "../../src/iri.js";

describe("buildLevelView", () => {
  test("uses ordinalRank as position", () => {
    const view = buildLevelView({
      id: "J060",
      professionalTitle: "Level II",
      qualificationSummary: "Mid level.",
      ordinalRank: 2,
      typicalExperienceRange: "2-5 years",
    });
    assert.strictEqual(view.iri, levelIri("J060"));
    assert.strictEqual(view.position, 2);
    assert.strictEqual(view.name, "Level II");
  });
});

describe("buildBehaviourView", () => {
  test("collects maturity descriptions and related drivers", () => {
    const view = buildBehaviourView(
      {
        id: "systems_thinking",
        name: "Think in Systems",
        description: "...",
        maturityDescriptions: { emerging: "...", developing: "..." },
      },
      {
        drivers: [
          {
            id: "quality",
            name: "Quality",
            contributingBehaviours: ["systems_thinking"],
          },
        ],
      },
    );
    assert.strictEqual(view.iri, behaviourIri("systems_thinking"));
    assert.strictEqual(view.maturities.length, 2);
    assert.strictEqual(view.relatedDrivers[0].iri, driverIriFn("quality"));
  });
});

describe("buildDisciplineView", () => {
  test("flattens skill tier IRIs", () => {
    const view = buildDisciplineView({
      id: "software_engineering",
      specialization: "Software Engineering",
      description: "...",
      coreSkills: ["python"],
      supportingSkills: ["planning"],
      broadSkills: ["incident_response"],
    });
    assert.strictEqual(view.iri, disciplineIri("software_engineering"));
    assert.strictEqual(view.coreSkills[0].iri, skillIri("python"));
    assert.strictEqual(view.supportingSkills[0].iri, skillIri("planning"));
    assert.strictEqual(view.broadSkills[0].iri, skillIri("incident_response"));
  });
});

describe("buildTrackView", () => {
  test("flattens skill modifiers with full IRIs", () => {
    const view = buildTrackView({
      id: "platform",
      name: "Platform",
      description: "...",
      skillModifiers: { python: 1, planning: -1 },
    });
    assert.strictEqual(view.iri, trackIri("platform"));
    assert.strictEqual(view.skillModifiers.length, 2);
    assert.strictEqual(view.skillModifiers[0].skillIri, skillIri("python"));
  });
});

describe("buildStageView", () => {
  test("threads position from caller", () => {
    const view = buildStageView(
      { id: "code", name: "Code", description: "..." },
      3,
    );
    assert.strictEqual(view.iri, stageIri("code"));
    assert.strictEqual(view.position, 3);
  });
});

describe("buildDriverView", () => {
  test("emits contributing skill and behaviour IRIs", () => {
    const view = buildDriverView({
      id: "quality",
      name: "Quality",
      description: "...",
      contributingSkills: ["python"],
      contributingBehaviours: ["systems_thinking"],
    });
    assert.strictEqual(view.iri, driverIri("quality"));
    assert.strictEqual(view.contributingSkills[0].iri, skillIri("python"));
    assert.strictEqual(
      view.contributingBehaviours[0].iri,
      behaviourIri("systems_thinking"),
    );
  });
});

describe("buildToolView", () => {
  test("slugifies the name into a stable id", () => {
    assert.strictEqual(slugifyToolName("VS Code"), "vs-code");
    const view = buildToolView({
      name: "VS Code",
      url: "https://code.visualstudio.com/",
      description: "Editor.",
      usages: [{ skillId: "python" }],
    });
    assert.strictEqual(view.id, "vs-code");
    assert.strictEqual(view.iri, toolIri("vs-code"));
    assert.strictEqual(view.usedBySkills[0].iri, skillIri("python"));
  });
});

describe("aggregateTools", () => {
  test("dedupes tools by name across skills", () => {
    const tools = aggregateTools([
      {
        id: "python",
        name: "Python",
        capability: "foundations",
        toolReferences: [{ name: "VS Code", url: "x" }],
      },
      {
        id: "planning",
        name: "Planning",
        capability: "delivery",
        toolReferences: [{ name: "VS Code", url: "x" }],
      },
    ]);
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].usages.length, 2);
  });
});
