import { test, describe } from "node:test";
import assert from "node:assert";

import { buildCapabilityView } from "../../src/view-builders/capability.js";
import { capabilityIri, skillIri } from "../../src/iri.js";

describe("buildCapabilityView", () => {
  test("returns shared-module IRIs and inlines owned skills", () => {
    const capability = {
      id: "delivery",
      name: "Delivery",
      description: "Shipping value.",
      professionalResponsibilities: { working: "You ship features." },
    };
    const skills = [
      {
        id: "planning",
        name: "Planning",
        capability: "delivery",
        description: "Planning work.",
        proficiencyDescriptions: { working: "..." },
      },
      {
        id: "other",
        name: "Other",
        capability: "reliability",
        proficiencyDescriptions: {},
      },
    ];

    const view = buildCapabilityView(capability, {
      capabilities: [capability],
      skills,
      disciplines: [],
      tracks: [],
      drivers: [],
    });

    assert.strictEqual(view.iri, capabilityIri("delivery"));
    assert.strictEqual(view.skills.length, 1);
    assert.strictEqual(view.skills[0].iri, skillIri("planning"));
    assert.strictEqual(view.skills[0].name, "Planning");
    assert.deepStrictEqual(view.professionalResponsibilities, [
      { level: "working", description: "You ship features." },
    ]);
  });
});
