/**
 * HTML Renderer — generates HTML microdata files for Guide.
 *
 * Uses TemplateLoader from libtemplate for all output.
 * Pass 1: Deterministic templates produce complete HTML with structural microdata.
 * Pass 2: LLM enricher rewrites prose blocks in-place (handled by enricher.js).
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";
import { generateDrugs, generatePlatforms } from "./industry-data.js";
import { assignLinks } from "./link-assigner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templates = new TemplateLoader(join(__dirname, "..", "templates"));

/** Wrap inner HTML in the page shell. */
function page(title, body, domain) {
  return templates.render("page.html", {
    title,
    body,
    domain: `https://${domain}`,
  });
}

function titleCase(str) {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Render HTML microdata files from entities and prose.
 * @param {object} entities
 * @param {Map<string,string>} prose
 * @returns {{ files: Map<string,string>, linked: import('./link-assigner.js').LinkedEntities }}
 */
export function renderHTML(entities, prose) {
  const files = new Map();
  const domain = entities.domain;

  // Generate industry data
  const drugs = generateDrugs(domain);
  const platforms = generatePlatforms(domain);

  // Content config
  const gc = entities.content.find((c) => c.id === "guide_html");
  const courseCount = gc?.courses || 0;
  const eventCount = gc?.events || 0;
  const blogCount = gc?.blogs || 0;
  const articleTopics = gc?.article_topics || [];

  // Assign cross-links deterministically
  const linked = assignLinks({
    drugs,
    platforms,
    projects: entities.projects,
    people: entities.people,
    teams: entities.teams,
    departments: entities.departments,
    domain,
    courseCount,
    eventCount,
    blogCount,
    articleTopics,
    seed: entities.activity?.seed || 42,
  });

  // Enrich platform and drug entities with reverse links
  const enrichedPlatforms = enrichPlatformsWithLinks(linked);
  const enrichedDrugs = enrichDrugsWithLinks(linked);

  // --- Structural pages (unchanged) ---
  const leadershipBody = templates.render("leadership.html", {
    managers: entities.people
      .filter((p) => p.is_manager)
      .map((m) => {
        const team = entities.teams.find((t) => t.id === m.team_id)
        const dept = team ? entities.departments.find((d) => d.id === team.department) : null
        return {
          ...m,
          teamName: team?.name || "",
          departmentIri: dept?.iri || "",
        }
      }),
  });
  files.set(
    "organization-leadership.html",
    page("Organization Leadership", leadershipBody, domain),
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
              jobTitle: `${p.level} ${p.discipline ? titleCase(p.discipline) : 'Engineer'}`,
              teamIri: t.iri,
            })),
        })),
    })),
  });
  files.set(
    "organization-departments-teams.html",
    page("Organization Departments & Teams", deptBody, domain),
  );

  const rolesBody = templates.render("roles.html", {
    domain: `https://${domain}`,
    levels: ["L1", "L2", "L3", "L4", "L5"].map((id) => ({
      id,
      count: entities.people.filter((p) => p.level === id).length,
    })),
  });
  files.set("roles.html", page("Engineering Roles", rolesBody, domain));

  // --- New linked document types ---

  // Projects cross-functional
  files.set(
    "projects-cross-functional.html",
    page(
      "Cross-Functional Projects",
      templates.render("projects.html", { projects: linked.projects }),
      domain,
    ),
  );

  // Technology platforms dependencies
  files.set(
    "technology-platforms-dependencies.html",
    page(
      "Technology Platforms",
      templates.render("platforms.html", { platforms: enrichedPlatforms }),
      domain,
    ),
  );

  // Drugs development pipeline
  files.set(
    "drugs-development-pipeline.html",
    page(
      "Drug Development Pipeline",
      templates.render("drugs.html", { drugs: enrichedDrugs }),
      domain,
    ),
  );

  // --- Content-driven pages ---
  if (gc) {
    for (const article of linked.articles || []) {
      const body = templates.render("article.html", {
        articles: [{
          ...article,
          prose:
            prose.get(`article_${article.topic}`) ||
            `Article about ${article.topic.replace(/_/g, " ")}.`,
        }],
      });
      files.set(
        `articles-${article.topic.replace(/_/g, "-")}.html`,
        page(`${article.title} - Article`, body, domain),
      );
    }

    // Blog posts — individual files + index with blog collection wrapper
    const blogIri = `https://${domain}/id/blog`;
    const blogPosts = linked.blogPosts.map((post) => ({
      ...post,
      blogIri,
      body:
        prose.get(`blog_${post.index - 1}`) ||
        `Blog post about ${post.headline.toLowerCase()}.`,
    }));

    // Individual blog post files
    for (const post of blogPosts) {
      files.set(
        `blog-${post.index}.html`,
        page(
          post.headline,
          templates.render("blog-post.html", post),
          domain,
        ),
      );
    }

    // Blog index page
    files.set(
      "blog-posts.html",
      page(
        "Engineering Blog",
        templates.render("blog.html", { blogIri, posts: blogPosts }),
        domain,
      ),
    );

    files.set(
      "faq-pages.html",
      page(
        "Frequently Asked Questions",
        templates.render("faq.html", {
          faqs: Array.from({ length: gc.faqs || 0 }, (_, i) => {
            const entityPool = [...linked.drugs, ...linked.platforms, ...linked.projects];
            const aboutLinks = [
              entityPool[i % entityPool.length],
              entityPool[(i + 3) % entityPool.length],
            ].filter(Boolean);
            return {
              iri: `https://${domain}/id/faq/faq-${i + 1}`,
              question: `FAQ Question ${i + 1}`,
              answer: prose.get(`faq_${i}`) || `Answer to FAQ ${i + 1}.`,
              aboutLinks,
            };
          }),
        }),
        domain,
      ),
    );

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
        page(`How-To: ${titleCase(topic)}`, body, domain),
      );
    }

    files.set(
      "reviews.html",
      page(
        "Reviews",
        templates.render("reviews.html", {
          reviews: Array.from({ length: gc.reviews || 0 }, (_, i) => {
            const person = entities.people[i % entities.people.length];
            const reviewPool = [...linked.courses, ...linked.events, ...linked.platforms];
            const reviewed = reviewPool[i % reviewPool.length];
            return {
              iri: `https://${domain}/id/review/review-${i + 1}`,
              rating: 1 + (((i * 7 + 3) % 5)),
              author: person?.name || "Anonymous",
              authorIri: person?.iri || "",
              body: prose.get(`review_${i}`) || "Good work on this implementation.",
              reviewedIri: reviewed?.iri || "",
            };
          }),
        }),
        domain,
      ),
    );

    files.set(
      "comments.html",
      page(
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
              date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
              aboutIri: parent?.iri || "",
            };
          }),
        }),
        domain,
      ),
    );

    // Courses — enriched with IDs, prereqs, attendees, platform/drug links
    files.set(
      "courses-learning-catalog.html",
      page(
        "Learning Catalog",
        templates.render("courses.html", { courses: linked.courses }),
        domain,
      ),
    );

    // Events — enriched with organizer, attendees, about links
    files.set(
      "events-program-calendar.html",
      page(
        "Event Calendar",
        templates.render("events.html", { events: linked.events }),
        domain,
      ),
    );
  }

  return { files, linked };
}

/**
 * Enrich platforms with reverse links from projects and drugs.
 * @param {import('./link-assigner.js').LinkedEntities} linked
 * @returns {object[]}
 */
function enrichPlatformsWithLinks(linked) {
  return linked.platforms.map((plat) => {
    // Resolve dependency objects for template rendering
    const depObjects = (plat.dependencies || [])
      .map((depId) => linked.platforms.find((p) => p.id === depId))
      .filter(Boolean);

    // Reverse: projects that link to this platform
    const projectLinks = linked.projects
      .filter((proj) =>
        proj.platformLinks.some((pl) => pl.id === plat.id),
      )
      .slice(0, 3);

    // Reverse: drugs that use this platform
    const drugLinks = linked.drugs
      .filter(
        (d) =>
          d.platformLinks && d.platformLinks.some((pl) => pl.id === plat.id),
      )
      .slice(0, 2);

    return {
      ...plat,
      dependencies: depObjects,
      projectLinks,
      drugLinks,
    };
  });
}

/**
 * Enrich drugs with reverse links from projects, platforms, events.
 * @param {import('./link-assigner.js').LinkedEntities} linked
 * @returns {object[]}
 */
function enrichDrugsWithLinks(linked) {
  const base = linked.drugs[0]?.iri?.replace(/\/id\/drug\/.*/, "") || "";

  return linked.drugs.map((drug) => {
    // Reverse: projects that reference this drug
    const projectLinks = linked.projects
      .filter((proj) => proj.drugLinks.some((dl) => dl.id === drug.id))
      .slice(0, 3);

    // Platforms associated via projects
    const platformIds = new Set();
    for (const proj of projectLinks) {
      for (const pl of proj.platformLinks) platformIds.add(pl.id);
    }
    const platformLinks = linked.platforms
      .filter((p) => platformIds.has(p.id))
      .slice(0, 3);

    // Events about this drug
    const eventLinks = linked.events
      .filter((e) => e.aboutDrugs.some((d) => d.id === drug.id))
      .slice(0, 2);

    const parentDrugIri = drug.parentDrug
      ? `${base}/id/drug/${drug.parentDrug}`
      : null;

    return {
      ...drug,
      projectLinks,
      platformLinks,
      eventLinks,
      parentDrugIri,
    };
  });
}

/**
 * Render organization README.
 * @param {object} entities
 * @param {Map<string,string>} prose
 * @returns {string}
 */
export function renderREADME(entities, prose) {
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
 * @returns {string}
 */
export function renderONTOLOGY(entities) {
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
