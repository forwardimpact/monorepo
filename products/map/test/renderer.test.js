/**
 * Renderer tests — verify each entity type renders to a complete HTML
 * document whose microdata, when parsed by the same parser libresource
 * uses, produces the expected fit: vocabulary quads.
 *
 * Quad-level assertions (rather than raw HTML string matching) keep these
 * tests resilient to whitespace and template restructuring while still
 * catching real semantic regressions.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MicrodataRdfParser } from "microdata-rdf-streaming-parser";

import { createRenderer } from "../src/renderer.js";
import {
  DERIVED_ENTITY_TYPES,
  skillIri,
  capabilityIri,
  levelIri,
  behaviourIri,
  disciplineIri,
  trackIri,
  stageIri,
  driverIri,
  toolIri,
  VOCAB_BASE,
} from "../src/iri.js";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

async function parseQuads(html) {
  const parser = new MicrodataRdfParser({
    baseIRI: "https://example.invalid/",
    contentType: "text/html",
  });
  parser.write(html);
  parser.end();
  const quads = [];
  for await (const quad of parser) {
    quads.push(quad);
  }
  return quads;
}

function typesOf(quads) {
  return quads
    .filter((q) => q.predicate.value === RDF_TYPE)
    .map((q) => q.object.value);
}

function hasQuad(quads, { subject, predicate, object }) {
  return quads.some(
    (q) =>
      (!subject || q.subject.value === subject) &&
      (!predicate || q.predicate.value === predicate) &&
      (!object || q.object.value === object),
  );
}

const SKILL = {
  id: "python",
  name: "Python",
  capability: "foundations",
  description: "Writing Python.",
  proficiencyDescriptions: { working: "Ship features." },
};

const CAPABILITY = {
  id: "foundations",
  name: "Foundations",
  description: "Engineering basics.",
  professionalResponsibilities: { working: "Own delivery." },
};

const CTX = {
  capabilities: [CAPABILITY],
  skills: [SKILL],
  disciplines: [
    {
      id: "software_engineering",
      specialization: "Software Engineering",
      coreSkills: ["python"],
      description: "Builds software.",
    },
  ],
  tracks: [
    {
      id: "platform",
      name: "Platform",
      description: "...",
      skillModifiers: { python: 1 },
    },
  ],
  drivers: [
    {
      id: "quality",
      name: "Quality",
      description: "...",
      contributingSkills: ["python"],
      contributingBehaviours: ["systems_thinking"],
    },
  ],
  behaviours: [],
};

describe("Renderer", () => {
  const renderer = createRenderer();

  test("renderSkill emits a complete HTML document with fit:Skill quads", async () => {
    const html = renderer.renderSkill(SKILL, CTX);
    assert.match(html, /^<!doctype html>/i);

    const quads = await parseQuads(html);
    const types = typesOf(quads);
    assert.ok(
      types.includes(`${VOCAB_BASE}Skill`),
      `expected fit:Skill type, got: ${types.join(", ")}`,
    );
    assert.ok(
      hasQuad(quads, {
        subject: skillIri("python"),
        predicate: `${VOCAB_BASE}name`,
      }),
    );
    assert.ok(
      hasQuad(quads, {
        subject: skillIri("python"),
        predicate: `${VOCAB_BASE}capability`,
        object: capabilityIri("foundations"),
      }),
    );
  });

  test("renderCapability nests its owned skills via the skill-inline partial", async () => {
    const html = renderer.renderCapability(CAPABILITY, CTX);
    const quads = await parseQuads(html);
    const types = typesOf(quads);
    assert.ok(types.includes(`${VOCAB_BASE}Capability`));
    assert.ok(types.includes(`${VOCAB_BASE}Skill`));
    assert.ok(
      hasQuad(quads, {
        subject: capabilityIri("foundations"),
        predicate: `${VOCAB_BASE}skill`,
        object: skillIri("python"),
      }),
    );
  });

  test("standalone skill quads match those of the same skill nested in a capability", async () => {
    const standalone = await parseQuads(renderer.renderSkill(SKILL, CTX));
    const nested = await parseQuads(renderer.renderCapability(CAPABILITY, CTX));

    const skillName = (quads) =>
      quads.find(
        (q) =>
          q.subject.value === skillIri("python") &&
          q.predicate.value === `${VOCAB_BASE}name`,
      );

    assert.ok(skillName(standalone));
    assert.ok(skillName(nested));
    assert.strictEqual(
      skillName(standalone).object.value,
      skillName(nested).object.value,
    );
  });

  test("renderLevel emits fit:Level", async () => {
    const html = renderer.renderLevel({
      id: "J060",
      professionalTitle: "Level II",
      qualificationSummary: "Mid level.",
      ordinalRank: 2,
    });
    const quads = await parseQuads(html);
    assert.ok(typesOf(quads).includes(`${VOCAB_BASE}Level`));
    assert.ok(
      hasQuad(quads, {
        subject: levelIri("J060"),
        predicate: `${VOCAB_BASE}name`,
      }),
    );
  });

  test("renderBehaviour emits fit:Behaviour", async () => {
    const html = renderer.renderBehaviour(
      {
        id: "systems_thinking",
        name: "Think in Systems",
        description: "...",
        maturityDescriptions: { emerging: "..." },
      },
      CTX,
    );
    const quads = await parseQuads(html);
    assert.ok(typesOf(quads).includes(`${VOCAB_BASE}Behaviour`));
    assert.ok(
      hasQuad(quads, {
        subject: behaviourIri("systems_thinking"),
        predicate: `${VOCAB_BASE}name`,
      }),
    );
  });

  test("renderDiscipline emits fit:Discipline with coreSkill links", async () => {
    const html = renderer.renderDiscipline(CTX.disciplines[0]);
    const quads = await parseQuads(html);
    assert.ok(typesOf(quads).includes(`${VOCAB_BASE}Discipline`));
    assert.ok(
      hasQuad(quads, {
        subject: disciplineIri("software_engineering"),
        predicate: `${VOCAB_BASE}coreSkill`,
        object: skillIri("python"),
      }),
    );
  });

  test("renderTrack emits fit:Track with nested fit:SkillModifier items", async () => {
    const html = renderer.renderTrack(CTX.tracks[0]);
    const quads = await parseQuads(html);
    const types = typesOf(quads);
    assert.ok(types.includes(`${VOCAB_BASE}Track`));
    assert.ok(
      types.includes(`${VOCAB_BASE}SkillModifier`),
      "track should render nested fit:SkillModifier items",
    );
    assert.ok(
      hasQuad(quads, {
        subject: trackIri("platform"),
        predicate: `${VOCAB_BASE}name`,
      }),
    );
    // The nested SkillModifier should carry a fit:skill link to the skill IRI
    assert.ok(
      hasQuad(quads, {
        predicate: `${VOCAB_BASE}skill`,
        object: skillIri("python"),
      }),
    );
  });

  test("renderStage emits fit:Stage", async () => {
    const html = renderer.renderStage(
      { id: "code", name: "Code", description: "..." },
      1,
    );
    const quads = await parseQuads(html);
    assert.ok(typesOf(quads).includes(`${VOCAB_BASE}Stage`));
    assert.ok(
      hasQuad(quads, {
        subject: stageIri("code"),
        predicate: `${VOCAB_BASE}name`,
      }),
    );
  });

  test("renderDriver emits fit:Driver with contributing skill links", async () => {
    const html = renderer.renderDriver(CTX.drivers[0]);
    const quads = await parseQuads(html);
    assert.ok(typesOf(quads).includes(`${VOCAB_BASE}Driver`));
    assert.ok(
      hasQuad(quads, {
        subject: driverIri("quality"),
        predicate: `${VOCAB_BASE}contributingSkill`,
        object: skillIri("python"),
      }),
    );
  });

  test("renderTool emits fit:Tool with usedBySkill links", async () => {
    const html = renderer.renderTool({
      name: "VS Code",
      url: "https://code.visualstudio.com/",
      description: "Editor.",
      usages: [
        { skillId: "python", skillName: "Python", capabilityId: "foundations" },
      ],
    });
    const quads = await parseQuads(html);
    assert.ok(typesOf(quads).includes(`${VOCAB_BASE}Tool`));
    assert.ok(
      hasQuad(quads, {
        subject: toolIri("vs-code"),
        predicate: `${VOCAB_BASE}usedBySkill`,
        object: skillIri("python"),
      }),
    );
  });

  test("no rendered document emits a derived-entity type as a main itemtype", async () => {
    const docs = [
      renderer.renderSkill(SKILL, CTX),
      renderer.renderCapability(CAPABILITY, CTX),
      renderer.renderLevel({
        id: "J040",
        professionalTitle: "Level I",
        qualificationSummary: "Entry.",
        ordinalRank: 1,
      }),
      renderer.renderBehaviour(
        {
          id: "systems_thinking",
          name: "Think in Systems",
          description: "...",
          maturityDescriptions: { emerging: "..." },
        },
        CTX,
      ),
      renderer.renderDiscipline(CTX.disciplines[0]),
      renderer.renderTrack(CTX.tracks[0]),
      renderer.renderStage({ id: "code", name: "Code", description: "..." }, 1),
      renderer.renderDriver(CTX.drivers[0]),
      renderer.renderTool({
        name: "VS Code",
        url: "x",
        description: "y",
        usages: [{ skillId: "python" }],
      }),
    ];

    for (const html of docs) {
      const quads = await parseQuads(html);
      const types = typesOf(quads);
      for (const derived of DERIVED_ENTITY_TYPES) {
        assert.ok(
          !types.includes(derived),
          `derived type ${derived} must never appear in Map export output`,
        );
      }
    }
  });
});
