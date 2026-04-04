/**
 * Enricher — Pass 2 LLM enrichment of prose blocks.
 *
 * Finds all elements with `data-enrich` attributes in Pass 1 HTML,
 * calls ProseEngine to generate rich prose with inline microdata,
 * and replaces placeholder content.
 *
 * @module libuniverse/render/enricher
 */

/**
 * Regex to find data-enrich blocks and their content.
 * Matches: <div ... data-enrich="key"> ... </div>
 */
const ENRICH_PATTERN =
  /(<div[^>]+data-enrich="([^"]+)"[^>]*>)([\s\S]*?)(<\/div>)/g;

/** @param {string} schemaType @param {object[]} items @param {number} [limit] */
function toMentions(schemaType, items, limit) {
  const sliced = limit !== undefined ? items.slice(0, limit) : items;
  return sliced.map((item) => ({
    type: schemaType,
    name: item.name,
    iri: item.iri,
  }));
}

function enrichProject(linked, id) {
  const proj = linked.projects.find((p) => p.id === id);
  if (!proj) return null;
  const mentions = [
    ...toMentions("Drug", proj.drugLinks),
    ...toMentions("SoftwareApplication", proj.platformLinks),
    ...toMentions("Person", proj.members, 3),
  ];
  const narrative = {};
  if (proj.milestones?.length) narrative.milestones = proj.milestones;
  if (proj.risks?.length) narrative.risks = proj.risks;
  if (proj.technical_choices?.length)
    narrative.technical_choices = proj.technical_choices;
  return {
    entityType: "Project",
    entityName: proj.name,
    mentionTargets: mentions,
    ...(Object.keys(narrative).length > 0 && { narrative }),
  };
}

function enrichPlatform(linked, id) {
  const plat = linked.platforms.find((p) => p.id === id);
  if (!plat) return null;
  const deps = plat.dependencies || [];
  const depPlatforms = deps
    .map((d) =>
      linked.platforms.find((p) => p.id === (typeof d === "string" ? d : d.id)),
    )
    .filter(Boolean);
  return {
    entityType: "SoftwareApplication",
    entityName: plat.name,
    mentionTargets: [
      ...toMentions("SoftwareApplication", depPlatforms),
      ...toMentions("Project", plat.projectLinks || [], 2),
      ...toMentions("Drug", plat.drugLinks || [], 2),
    ],
  };
}

function enrichDrug(linked, id) {
  const drug = linked.drugs.find((d) => d.id === id);
  if (!drug) return null;
  const mentions = [
    ...toMentions("Project", drug.projectLinks || [], 2),
    ...toMentions("SoftwareApplication", drug.platformLinks || [], 2),
  ];
  if (drug.parentDrug) {
    const parent = linked.drugs.find((d) => d.id === drug.parentDrug);
    if (parent)
      mentions.push({ type: "Drug", name: parent.name, iri: parent.iri });
  }
  return {
    entityType: "Drug",
    entityName: drug.name,
    mentionTargets: mentions,
  };
}

function enrichCourse(linked, id) {
  const course = linked.courses.find((c) => c.id === id);
  if (!course) return null;
  const mentions = [
    ...(course.platformLink
      ? [
          {
            type: "SoftwareApplication",
            name: course.platformLink.name,
            iri: course.platformLink.iri,
          },
        ]
      : []),
    ...(course.drugLink
      ? [{ type: "Drug", name: course.drugLink.name, iri: course.drugLink.iri }]
      : []),
    ...toMentions("Person", course.attendees, 2),
  ];
  return {
    entityType: "Course",
    entityName: course.title,
    mentionTargets: mentions,
  };
}

function enrichEvent(linked, id) {
  const idx = parseInt(id, 10) - 1;
  const event = linked.events[idx];
  if (!event) return null;
  return {
    entityType: "Event",
    entityName: event.title,
    mentionTargets: [
      { type: "Person", name: event.organizer.name, iri: event.organizer.iri },
      ...toMentions("Project", event.aboutProjects, 2),
      ...toMentions("Drug", event.aboutDrugs, 2),
      ...toMentions("Person", event.attendees, 2),
    ],
  };
}

function enrichBlog(linked, id) {
  const idx = parseInt(id, 10) - 1;
  const post = linked.blogPosts[idx];
  if (!post) return null;
  return {
    entityType: "BlogPosting",
    entityName: post.headline,
    mentionTargets: [
      ...toMentions("Drug", post.aboutDrugs, 2),
      ...toMentions("SoftwareApplication", post.aboutPlatforms, 2),
      ...toMentions("Person", post.mentionsPeople, 3),
    ],
  };
}

function enrichArticle(linked, id) {
  const article = linked.articles?.find((a) => a.topic === id);
  if (!article) return null;
  return {
    entityType: "ScholarlyArticle",
    entityName: article.title,
    mentionTargets: [
      ...toMentions("Drug", article.drugLinks || [], 2),
      ...toMentions("SoftwareApplication", article.platformLinks || [], 2),
      ...toMentions("Project", article.projectLinks || [], 2),
      ...toMentions("Person", article.authorLinks || [], 2),
    ],
  };
}

const ENRICH_HANDLERS = {
  project: enrichProject,
  platform: enrichPlatform,
  drug: enrichDrug,
  course: enrichCourse,
  event: enrichEvent,
  blog: enrichBlog,
  article: enrichArticle,
};

/**
 * Build entity context for enrichment from linked entities.
 * @param {string} enrichKey
 * @param {object} linked - LinkedEntities from link-assigner
 * @returns {{ entityType: string, entityName: string, mentionTargets: object[] } | null}
 */
function buildEnrichContext(enrichKey, linked) {
  const [type, ...rest] = enrichKey.split("_");
  const id = rest.join("_");
  const handler = ENRICH_HANDLERS[type];
  return handler ? handler(linked, id) : null;
}

/**
 * Build the LLM prompt for enriching a prose block.
 * @param {object} ctx - Context from buildEnrichContext
 * @param {string} placeholder - Current placeholder text
 * @param {string} domain - Universe domain for IRI constraint
 * @returns {object[]} Messages array for ProseEngine.generateStructured
 */
function buildEnrichMessages(ctx, placeholder, domain) {
  const mentionList = ctx.mentionTargets
    .map((m) => `- ${m.type}: ${m.name} (${m.iri})`)
    .join("\n");

  const system = `You are a technical writer producing HTML content with Schema.org microdata for a pharmaceutical company knowledge base.
Output only the inner HTML content — no wrapper tags, no markdown fences.
Write 300-500 words of detailed, rich prose across multiple paragraphs. Mention entities using inline Schema.org microdata spans.
Only use the exact IRIs provided. Do not invent new IRIs. All itemid values must start with "https://${domain}/id/".`;

  const user = `Rewrite this text block for a ${ctx.entityType} document about "${ctx.entityName}".

Current text: "${placeholder}"

Write 300-500 words of detailed prose across 3-5 paragraphs. Naturally mention these entities using Schema.org microdata:

${mentionList}

Use this pattern for inline mentions:
<span itemprop="mentions" itemscope itemtype="https://schema.org/{{type}}" itemid="{{iri}}"><span itemprop="name">{{name}}</span></span>

Output only the HTML content for the block — no wrapper tags.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Strip or sanitize itemid attributes that don't match the universe domain.
 * @param {string} html
 * @param {string} domain
 * @returns {string}
 */
function stripOffDomainIris(html, domain) {
  const prefix = `https://${domain}/id/`;
  return html
    .replace(
      /(<[^>]*?)\s+itemscope\s+itemtype="[^"]*"\s+itemid="([^"]*)"/g,
      (match, before, iri) => {
        if (iri.startsWith(prefix)) return match;
        return before;
      },
    )
    .replace(
      /(<[^>]*?)\s+itemid="([^"]*)"\s+itemscope\s+itemtype="[^"]*"/g,
      (match, before, iri) => {
        if (iri.startsWith(prefix)) return match;
        return before;
      },
    )
    .replace(/(<[^>]*?)\s+itemid="([^"]*)"/g, (match, before, iri) => {
      if (iri.startsWith(prefix)) return match;
      return before;
    });
}

/**
 * Close any unclosed HTML tags in LLM-generated prose.
 * Tracks open/close tags and appends missing closing tags.
 * @param {string} html
 * @returns {string}
 */
function balanceTags(html) {
  const VOID = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "source",
    "track",
    "wbr",
  ]);
  const stack = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const full = m[0];
    const tag = m[1].toLowerCase();
    if (VOID.has(tag) || full.endsWith("/>")) continue;
    if (full.startsWith("</")) {
      const idx = stack.lastIndexOf(tag);
      if (idx !== -1) stack.splice(idx, 1);
    } else {
      stack.push(tag);
    }
  }
  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += `</${stack[i]}>`;
  }
  return html + suffix;
}

/**
 * Enrich all prose blocks in HTML documents via LLM.
 * @param {Map<string, string>} htmlFiles - filename → HTML content from Pass 1
 * @param {object} linked - LinkedEntities from link-assigner
 * @param {import('../engine/prose.js').ProseEngine} proseEngine
 * @param {string} domain - Universe domain
 * @param {object} logger - Logger instance
 * @returns {Promise<Map<string, string>>} filename → enriched HTML content
 */
export async function enrichDocuments(
  htmlFiles,
  linked,
  proseEngine,
  domain,
  logger,
) {
  if (!logger) throw new Error("logger is required");
  const enriched = new Map();
  let totalBlocks = 0;
  let enrichedBlocks = 0;

  for (const [filename, html] of htmlFiles) {
    let result = html;
    const matches = [...html.matchAll(ENRICH_PATTERN)];
    totalBlocks += matches.length;

    for (const match of matches) {
      const [, openTag, enrichKey, content, closeTag] = match;
      const ctx = buildEnrichContext(enrichKey, linked);
      if (!ctx) continue;

      const placeholder = content.replace(/<[^>]+>/g, "").trim();
      const messages = buildEnrichMessages(ctx, placeholder, domain);
      let prose = await proseEngine.generateStructured(
        `enrich_${enrichKey}`,
        messages,
      );

      if (prose) {
        if (domain) prose = stripOffDomainIris(prose, domain);
        prose = balanceTags(prose);
        const cleanOpen = openTag.replace(/\s*data-enrich="[^"]*"/, "");
        result = result.replace(
          match[0],
          `${cleanOpen}\n      ${prose}\n    ${closeTag}`,
        );
        enrichedBlocks++;
      }
    }

    enriched.set(filename, result);
  }

  logger.info(
    "enricher",
    `Enriched ${enrichedBlocks}/${totalBlocks} prose blocks`,
  );
  return enriched;
}
