/**
 * Prose Keys — collects all keys that need LLM-generated prose.
 *
 * Each key maps to a context object that guides the LLM prompt.
 */

/**
 * Collect all prose keys from the entity graph.
 * @param {object} entities - Generated entity graph from tier0
 * @returns {Map<string, object>} key → context for prose generation
 */
export function collectProseKeys(entities) {
  const keys = new Map();

  // Organization README prose
  keys.set("org_readme", {
    topic: `${entities.orgs[0]?.name || "BioNova"} company overview`,
    tone: "corporate, informative",
    length: "3-4 paragraphs",
    domain: entities.domain,
  });

  // Project descriptions
  for (const proj of entities.projects) {
    if (proj.prose_topic) {
      keys.set(`project_${proj.id}`, {
        topic: proj.prose_topic,
        tone: proj.prose_tone || "technical",
        length: "2-3 paragraphs",
        domain: entities.domain,
      });
    }
  }

  // HTML content — articles
  const guideContent = entities.content.find((c) => c.id === "guide_html");
  if (guideContent) {
    for (const topic of guideContent.article_topics || []) {
      keys.set(`article_${topic}`, {
        topic: `${topic.replace(/_/g, " ")} in pharmaceutical industry`,
        tone: "technical, informative",
        length: "6-8 paragraphs",
        domain: entities.domain,
      });
    }

    // Blog posts
    for (let i = 0; i < (guideContent.blogs || 0); i++) {
      keys.set(`blog_${i}`, {
        topic: "pharmaceutical engineering blog post",
        tone: "conversational, technical",
        length: "4-5 paragraphs",
        domain: entities.domain,
      });
    }

    // FAQs
    for (let i = 0; i < (guideContent.faqs || 0); i++) {
      keys.set(`faq_${i}`, {
        topic: "pharmaceutical engineering FAQ",
        tone: "helpful, concise",
        length: "1 paragraph",
        domain: entities.domain,
      });
    }

    // HowTos
    for (const topic of guideContent.howto_topics || []) {
      keys.set(`howto_${topic}`, {
        topic: `how-to guide for ${topic.replace(/_/g, " ")}`,
        tone: "instructional",
        length: "5-6 paragraphs",
        domain: entities.domain,
      });
    }

    // Reviews
    for (let i = 0; i < (guideContent.reviews || 0); i++) {
      keys.set(`review_${i}`, {
        topic: "peer review comment on engineering work",
        tone: "professional, constructive",
        length: "1-2 sentences",
        maxTokens: 100,
        domain: entities.domain,
      });
    }

    // Comments
    for (let i = 0; i < (guideContent.comments || 0); i++) {
      keys.set(`comment_${i}`, {
        topic: "discussion comment on engineering topic",
        tone: "casual, technical",
        length: "1-2 sentences",
        maxTokens: 80,
        domain: entities.domain,
      });
    }
  }

  // Basecamp personas
  const basecampContent = entities.content.find(
    (c) => c.id === "basecamp_markdown",
  );
  if (basecampContent) {
    const personas = selectPersonaNames(entities, basecampContent);
    for (const persona of personas) {
      // Briefings
      for (let i = 0; i < (basecampContent.briefings_per_persona || 0); i++) {
        keys.set(`briefing_${persona.name}_${i}`, {
          topic: `daily briefing for ${persona.name}, a ${persona.level} ${persona.discipline}`,
          tone: "professional, concise",
          length: "2-3 paragraphs",
          domain: entities.domain,
          role: `${persona.level} ${persona.discipline}`,
        });
      }

      // Notes
      for (let i = 0; i < (basecampContent.notes_per_persona || 0); i++) {
        keys.set(`note_${persona.name}_${i}`, {
          topic: `engineering knowledge note by ${persona.name}`,
          tone: "personal, technical",
          length: "1-2 paragraphs",
          domain: entities.domain,
          role: `${persona.level} ${persona.discipline}`,
        });
      }
    }
  }

  // Snapshot comments (GetDX engineer voice)
  if (entities.activity?.commentKeys) {
    for (const ck of entities.activity.commentKeys) {
      const direction =
        ck.trajectory === "declining" ? "declining" : "improving";
      keys.set(`snapshot_comment_${ck.snapshot_id}_${ck.email.replace(/[@.]/g, "_")}`, {
        topic: `GetDX snapshot survey comment about ${ck.driver_name.toLowerCase()}`,
        tone: "authentic, first-person developer voice",
        length: "1-2 sentences",
        maxTokens: 80,
        domain: entities.domain,
        role: `${ck.person_level} ${ck.person_discipline.replace(/_/g, " ")} on the ${ck.team_name}`,
        scenario: ck.scenario_name,
        driver: ck.driver_name,
        direction,
        magnitude: ck.magnitude,
      });
    }
  }

  return keys;
}

/**
 * Select persona representatives from people.
 */
function selectPersonaNames(entities, basecampContent) {
  const levels = basecampContent.persona_levels || [
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
