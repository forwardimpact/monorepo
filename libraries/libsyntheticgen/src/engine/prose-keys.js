/**
 * Prose Keys — collects all keys that need LLM-generated prose.
 *
 * Each key maps to a context object that guides the LLM prompt. The
 * activity-prose branches dispatch through the `PROSE_ACTIVITIES`
 * registration (see `libsyntheticgen/activity/`); non-activity prose
 * (org_readme, projects, guide_html, outpost_markdown) stays inline
 * because it is not bound by the prose-bearing activity contract.
 */

import { PROSE_ACTIVITIES } from "../activity/index.js";

/**
 * Add guide HTML content keys (articles, blogs, FAQs, etc).
 * @param {Map<string, object>} keys
 * @param {object} guideContent
 * @param {string} domain
 * @param {string} orgName
 */
function addGuideContentKeys(keys, guideContent, domain, orgName) {
  for (const topic of guideContent.article_topics || []) {
    keys.set(`article_${topic}`, {
      topic: `${topic.replace(/_/g, " ")} in pharmaceutical industry`,
      tone: "technical, informative",
      length: "6-8 paragraphs",
      domain,
      orgName,
    });
  }

  for (let i = 0; i < (guideContent.blogs || 0); i++) {
    keys.set(`blog_${i}`, {
      topic: "pharmaceutical engineering blog post",
      tone: "conversational, technical",
      length: "4-5 paragraphs",
      domain,
      orgName,
    });
  }

  for (let i = 0; i < (guideContent.faqs || 0); i++) {
    keys.set(`faq_${i}`, {
      topic: "pharmaceutical engineering FAQ",
      tone: "helpful, concise",
      length: "1 paragraph",
      domain,
      orgName,
    });
  }

  for (const topic of guideContent.howto_topics || []) {
    keys.set(`howto_${topic}`, {
      topic: `how-to guide for ${topic.replace(/_/g, " ")}`,
      tone: "instructional",
      length: "5-6 paragraphs",
      domain,
      orgName,
    });
  }

  for (let i = 0; i < (guideContent.reviews || 0); i++) {
    keys.set(`review_${i}`, {
      topic: "peer review comment on engineering work",
      tone: "professional, constructive",
      length: "1-2 sentences",
      maxTokens: 100,
      domain,
      orgName,
    });
  }

  for (let i = 0; i < (guideContent.comments || 0); i++) {
    keys.set(`comment_${i}`, {
      topic: "discussion comment on engineering topic",
      tone: "casual, technical",
      length: "1-2 sentences",
      maxTokens: 80,
      domain,
      orgName,
    });
  }
}

/**
 * Add outpost persona keys (briefings, notes).
 * @param {Map<string, object>} keys
 * @param {object} outpostContent
 * @param {object} entities
 * @param {string} domain
 * @param {string} orgName
 */
function addOutpostKeys(keys, outpostContent, entities, domain, orgName) {
  const personas = selectPersonaNames(entities, outpostContent);
  for (const persona of personas) {
    for (let i = 0; i < (outpostContent.briefings_per_persona || 0); i++) {
      keys.set(`briefing_${persona.name}_${i}`, {
        topic: `daily briefing for ${persona.name}, a ${persona.level} ${persona.discipline}`,
        tone: "professional, concise",
        length: "2-3 paragraphs",
        domain,
        orgName,
        role: `${persona.level} ${persona.discipline}`,
      });
    }

    for (let i = 0; i < (outpostContent.notes_per_persona || 0); i++) {
      keys.set(`note_${persona.name}_${i}`, {
        topic: `engineering knowledge note by ${persona.name}`,
        tone: "personal, technical",
        length: "1-2 paragraphs",
        domain,
        orgName,
        role: `${persona.level} ${persona.discipline}`,
      });
    }
  }
}

/**
 * Collect all prose keys from the entity graph.
 * @param {object} entities - Generated entity graph from tier0
 * @returns {Map<string, object>} key -> context for prose generation
 */
export function collectProseKeys(entities) {
  const keys = new Map();
  const orgName = entities.orgs[0]?.name || "BioNova";
  const domain = entities.domain;

  keys.set("org_readme", {
    topic: `${orgName} company overview`,
    tone: "corporate, informative",
    length: "3-4 paragraphs",
    domain,
    orgName,
  });

  for (const proj of entities.projects) {
    if (proj.prose_topic) {
      keys.set(`project_${proj.id}`, {
        topic: proj.prose_topic,
        tone: proj.prose_tone || "technical",
        length: "2-3 paragraphs",
        domain,
        orgName,
      });
    }
  }

  const guideContent = entities.content.find((c) => c.id === "guide_html");
  if (guideContent) {
    addGuideContentKeys(keys, guideContent, domain, orgName);
  }

  const outpostContent = entities.content.find(
    (c) => c.id === "outpost_markdown",
  );
  if (outpostContent) {
    addOutpostKeys(keys, outpostContent, entities, domain, orgName);
  }

  // Activity-prose dispatch — the registration is the single source of
  // truth for which prose-bearing activity outputs exist (criterion
  // #1 / #2 of spec 820). Non-activity prose stays inline above.
  const pkCtx = { domain, orgName, entities };
  for (const pa of PROSE_ACTIVITIES) {
    const output = entities.activity?.[pa.id];
    if (!output) continue;
    for (const [k, ctx] of pa.proseKeys(output, pkCtx)) keys.set(k, ctx);
  }

  return keys;
}

/**
 * Select persona representatives from people.
 */
function selectPersonaNames(entities, outpostContent) {
  const levels = outpostContent.persona_levels || [
    "L1",
    "L2",
    "L3",
    "L4",
    "L5",
  ];
  const personas = [];
  for (const level of levels) {
    const person = entities.people.find((p) => p.level === level);
    if (person) {
      personas.push({
        name: person.name,
        level: person.level,
        discipline: person.discipline,
        email: person.email,
        team_id: person.team_id,
      });
    }
  }
  return personas;
}
