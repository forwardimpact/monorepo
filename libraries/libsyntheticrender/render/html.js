/**
 * HTML Renderer — generates HTML microdata files for Guide.
 *
 * Uses TemplateLoader from libtemplate for all output.
 * Pass 1: Deterministic templates produce complete HTML with structural microdata.
 * Pass 2: LLM enricher rewrites prose blocks in-place (handled by enricher.js).
 */

import { generateDrugs, generatePlatforms } from "./industry-data.js";
import { assignLinks } from "./link-assigner.js";
import {
  FAQ_QUESTIONS,
  enrichPlatformsWithLinks,
  enrichDrugsWithLinks,
} from "./html-helpers.js";

/** Wrap inner HTML in the page shell. */
function page(templates, title, body, domain) {
  return templates.render("page.html", {
    title,
    body,
    domain: `https://${domain}`,
  });
}

function titleCase(str) {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderStructuralPages(files, entities, templates, domain) {
  const leadershipBody = templates.render("leadership.html", {
    managers: entities.people
      .filter((p) => p.is_manager)
      .map((m) => {
        const team = entities.teams.find((t) => t.id === m.team_id);
        const dept = team
          ? entities.departments.find((d) => d.id === team.department)
          : null;
        return {
          ...m,
          teamName: team?.name || "",
          departmentIri: dept?.iri || "",
        };
      }),
  });
  files.set(
    "organization-leadership.html",
    page(templates, "Organization Leadership", leadershipBody, domain),
  );

  const deptBody = templates.render("departments.html", {
    departments: entities.departments.map((d) => ({
      ...d,
      teams: entities.teams
        .filter((t) => t.department === d.id)
        .map((t) => ({
          ...t,
          members: entities.people
            .filter((p) => p.team_id === t.id)
            .map((p) => ({
              iri: p.iri,
              name: p.name,
              jobTitle: `${p.level} ${p.discipline ? titleCase(p.discipline) : "Engineer"}`,
              teamIri: t.iri,
            })),
        })),
    })),
  });
  files.set(
    "organization-departments-teams.html",
    page(templates, "Organization Departments & Teams", deptBody, domain),
  );

  const rolesBody = templates.render("roles.html", {
    domain: `https://${domain}`,
    levels: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({
      id,
      count: entities.people.filter((p) => p.level === id).length,
    })),
  });
  files.set(
    "roles.html",
    page(templates, "Engineering Roles", rolesBody, domain),
  );
}

function renderLinkedPages(
  files,
  linked,
  enrichedPlatforms,
  enrichedDrugs,
  templates,
  domain,
) {
  files.set(
    "projects-cross-functional.html",
    page(
      templates,
      "Cross-Functional Projects",
      templates.render("projects.html", { projects: linked.projects }),
      domain,
    ),
  );
  files.set(
    "technology-platforms-dependencies.html",
    page(
      templates,
      "Technology Platforms",
      templates.render("platforms.html", { platforms: enrichedPlatforms }),
      domain,
    ),
  );
  files.set(
    "drugs-development-pipeline.html",
    page(
      templates,
      "Drug Development Pipeline",
      templates.render("drugs.html", { drugs: enrichedDrugs }),
      domain,
    ),
  );
}

function renderContentPages(
  files,
  gc,
  linked,
  entities,
  prose,
  templates,
  domain,
) {
  for (const article of linked.articles || []) {
    const body = templates.render("article.html", {
      articles: [
        {
          ...article,
          prose:
            prose.get(`article_${article.topic}`) ||
            `Article about ${article.topic.replace(/_/g, " ")}.`,
        },
      ],
    });
    files.set(
      `articles-${article.topic.replace(/_/g, "-")}.html`,
      page(templates, `${article.title} - Article`, body, domain),
    );
  }

  renderBlogPages(files, linked, prose, templates, domain);
  renderFaqPage(files, gc, linked, prose, templates, domain);
  renderHowtoPages(files, gc, prose, templates, domain);
  renderReviewsPage(files, gc, linked, entities, prose, templates, domain);
  renderCommentsPage(files, gc, linked, entities, prose, templates, domain);

  files.set(
    "courses-learning-catalog.html",
    page(
      templates,
      "Learning Catalog",
      templates.render("courses.html", { courses: linked.courses }),
      domain,
    ),
  );
  files.set(
    "events-program-calendar.html",
    page(
      templates,
      "Event Calendar",
      templates.render("events.html", { events: linked.events }),
      domain,
    ),
  );
}

function renderBlogPages(files, linked, prose, templates, domain) {
  const blogIri = `https://${domain}/id/blog`;
  const blogPosts = linked.blogPosts.map((post) => ({
    ...post,
    blogIri,
    body:
      prose.get(`blog_${post.index - 1}`) ||
      `Blog post about ${post.headline.toLowerCase()}.`,
  }));

  for (const post of blogPosts) {
    files.set(
      `blog-${post.index}.html`,
      page(
        templates,
        post.headline,
        templates.render("blog-post.html", post),
        domain,
      ),
    );
  }

  files.set(
    "blog-posts.html",
    page(
      templates,
      "Engineering Blog",
      templates.render("blog.html", { blogIri, posts: blogPosts }),
      domain,
    ),
  );
}

function renderFaqPage(files, gc, linked, prose, templates, domain) {
  files.set(
    "faq-pages.html",
    page(
      templates,
      "Frequently Asked Questions",
      templates.render("faq.html", {
        faqs: Array.from({ length: gc.faqs || 0 }, (_, i) => {
          const entityPool = [
            ...linked.drugs,
            ...linked.platforms,
            ...linked.projects,
          ];
          const aboutLinks = [
            entityPool[i % entityPool.length],
            entityPool[(i + 3) % entityPool.length],
          ].filter(Boolean);
          return {
            iri: `https://${domain}/id/faq/faq-${i + 1}`,
            question: FAQ_QUESTIONS[i % FAQ_QUESTIONS.length],
            answer: prose.get(`faq_${i}`) || `Answer to FAQ ${i + 1}.`,
            aboutLinks,
          };
        }),
      }),
      domain,
    ),
  );
}

function renderHowtoPages(files, gc, prose, templates, domain) {
  for (const topic of gc.howto_topics || []) {
    const body = templates.render("howto.html", {
      domain: `https://${domain}`,
      topic,
      title: titleCase(topic),
      prose:
        prose.get(`howto_${topic}`) ||
        `How-to guide for ${topic.replace(/_/g, " ")}.`,
    });
    files.set(
      `howto-${topic.replace(/_/g, "-")}.html`,
      page(templates, `How-To: ${titleCase(topic)}`, body, domain),
    );
  }
}

function renderReviewsPage(
  files,
  gc,
  linked,
  entities,
  prose,
  templates,
  domain,
) {
  files.set(
    "reviews.html",
    page(
      templates,
      "Reviews",
      templates.render("reviews.html", {
        reviews: Array.from({ length: gc.reviews || 0 }, (_, i) => {
          const person = entities.people[i % entities.people.length];
          const reviewPool = [
            ...linked.courses,
            ...linked.events,
            ...linked.platforms,
          ];
          const reviewed = reviewPool[i % reviewPool.length];
          return {
            iri: `https://${domain}/id/review/review-${i + 1}`,
            rating: 1 + ((i * 7 + 3) % 5),
            author: person?.name || "Anonymous",
            authorIri: person?.iri || "",
            body:
              prose.get(`review_${i}`) || "Good work on this implementation.",
            reviewedIri: reviewed?.iri || "",
          };
        }),
      }),
      domain,
    ),
  );
}

function renderCommentsPage(
  files,
  gc,
  linked,
  entities,
  prose,
  templates,
  domain,
) {
  files.set(
    "comments.html",
    page(
      templates,
      "Discussion Comments",
      templates.render("comments.html", {
        comments: Array.from({ length: gc.comments || 0 }, (_, i) => {
          const person = entities.people[i % entities.people.length];
          const parentPool = [...linked.blogPosts, ...(linked.articles || [])];
          const parent = parentPool[i % parentPool.length];
          return {
            iri: `https://${domain}/id/comment/comment-${i + 1}`,
            author: person?.name || "Anonymous",
            authorIri: person?.iri || "",
            body: prose.get(`comment_${i}`) || "Interesting discussion point.",
            date: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
            aboutIri: parent?.iri || "",
          };
        }),
      }),
      domain,
    ),
  );
}

function extractDateRange(entities) {
  const allDates = (entities.scenarios || [])
    .flatMap((s) => (s.snapshots || []).map((snap) => snap.date))
    .sort();
  return {
    startYear: allDates.length ? new Date(allDates[0]).getFullYear() : null,
    endYear: allDates.length ? new Date(allDates.at(-1)).getFullYear() : null,
  };
}

/**
 * Build linked entities from entities and guide content config.
 * @param {object} entities
 * @param {string} domain
 * @returns {{ linked: object, gc: object|undefined }}
 */
function extractGuideConfig(gc) {
  return {
    courseCount: gc?.courses || 0,
    eventCount: gc?.events || 0,
    blogCount: gc?.blogs || 0,
    articleTopics: gc?.article_topics || [],
    blogTopics: gc?.blog_topics || null,
  };
}

function buildLinkedEntities(entities, domain) {
  const gc = entities.content.find((c) => c.id === "guide_html");
  const { startYear, endYear } = extractDateRange(entities);
  const seed = entities.activity?.seed || 42;
  const orgName = entities.orgs?.[0]?.name || domain;

  const linked = assignLinks({
    drugs: generateDrugs(domain),
    platforms: generatePlatforms(domain),
    projects: entities.projects,
    people: entities.people,
    teams: entities.teams,
    departments: entities.departments,
    domain,
    ...extractGuideConfig(gc),
    seed,
    orgName,
    startYear,
    endYear,
  });

  return { linked, gc };
}

/**
 * Render HTML microdata files from entities and prose.
 * @param {object} entities
 * @param {Map<string,string>} prose
 * @param {import('@forwardimpact/libtemplate/loader').TemplateLoader} templates - Template loader
 * @returns {{ files: Map<string,string>, linked: import('./link-assigner.js').LinkedEntities }}
 */
export function renderHTML(entities, prose, templates) {
  if (!templates) throw new Error("templates is required");
  const files = new Map();
  const domain = entities.domain;

  const { linked, gc } = buildLinkedEntities(entities, domain);
  const enrichedPlatforms = enrichPlatformsWithLinks(linked);
  const enrichedDrugs = enrichDrugsWithLinks(linked);

  renderStructuralPages(files, entities, templates, domain);
  renderLinkedPages(
    files,
    linked,
    enrichedPlatforms,
    enrichedDrugs,
    templates,
    domain,
  );

  if (gc) {
    renderContentPages(files, gc, linked, entities, prose, templates, domain);
  }

  return { files, linked };
}

/**
 * Render organization README.
 * @param {object} entities
 * @param {Map<string,string>} prose
 * @param {import('@forwardimpact/libtemplate/loader').TemplateLoader} templates - Template loader
 * @returns {string}
 */
export function renderREADME(entities, prose, templates) {
  if (!templates) throw new Error("templates is required");
  const orgName = entities.orgs[0]?.name || "Organization";
  return templates.render("readme.md", {
    orgName,
    overview:
      prose.get("org_readme") || `${orgName} is a pharmaceutical company.`,
    departments: entities.departments.map((d) => ({
      ...d,
      teams: entities.teams.filter((t) => t.department === d.id),
    })),
    projects: entities.projects.map((p) => ({
      ...p,
      prose: prose.get(`project_${p.id}`) || p.prose_topic || "",
    })),
  });
}

/**
 * Render ONTOLOGY.md with entity IRIs.
 * @param {object} entities
 * @param {import('@forwardimpact/libtemplate/loader').TemplateLoader} templates - Template loader
 * @returns {string}
 */
export function renderONTOLOGY(entities, templates) {
  if (!templates) throw new Error("templates is required");
  const people = entities.people.slice(0, 30);
  return templates.render("ontology.md", {
    domain: entities.domain,
    orgs: entities.orgs,
    departments: entities.departments,
    teams: entities.teams,
    people,
    hasMore: entities.people.length > 30,
    moreCount: entities.people.length - 30,
    projects: entities.projects,
  });
}
