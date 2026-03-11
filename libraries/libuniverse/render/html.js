/**
 * HTML Renderer — generates HTML microdata files for Guide.
 *
 * Uses TemplateLoader from libtemplate for all output.
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";

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

const COURSE_TOPICS = [
  "Introduction to Drug Discovery",
  "Clinical Data Management",
  "GMP Compliance Essentials",
  "Pharmaceutical Statistics",
  "Molecular Biology Fundamentals",
  "Regulatory Submissions",
  "Data Engineering for Pharma",
  "AI in Drug Development",
  "Quality Assurance Methods",
  "Supply Chain Management",
  "Cloud Infrastructure Security",
  "API Design Patterns",
  "Machine Learning Pipelines",
  "DevOps Best Practices",
  "Technical Writing for Scientists",
];

const EVENT_NAMES = [
  "Engineering All-Hands",
  "Tech Talk: AI in Pharma",
  "Hackathon 2025",
  "Architecture Review Board",
  "Sprint Demo Day",
  "New Hire Orientation",
  "Compliance Training",
  "Platform Migration Workshop",
  "Data Science Summit",
  "Security Awareness Week",
];

/**
 * Render HTML microdata files from entities and prose.
 * @param {object} entities
 * @param {Map<string,string>} prose
 * @returns {Map<string,string>} filename → HTML content
 */
export function renderHTML(entities, prose) {
  const files = new Map();
  const domain = entities.domain;
  const orgName = entities.orgs[0]?.name || "Organization";

  // Structural pages
  const leadershipBody = templates.render("leadership.html", {
    managers: entities.people
      .filter((p) => p.is_manager)
      .map((m) => ({
        ...m,
        teamName: entities.teams.find((t) => t.id === m.team_id)?.name || "",
      })),
  });
  files.set(
    "organization-leadership.html",
    page("Organization Leadership", leadershipBody, domain),
  );

  const deptBody = templates.render("departments.html", {
    departments: entities.departments.map((d) => ({
      ...d,
      teams: entities.teams.filter((t) => t.department === d.id),
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

  // Content-driven pages
  const gc = entities.content.find((c) => c.id === "guide_html");
  if (gc) {
    for (const topic of gc.article_topics || []) {
      const body = templates.render("article.html", {
        domain: `https://${domain}`,
        topic,
        title: titleCase(topic),
        orgName,
        prose:
          prose.get(`article_${topic}`) ||
          `Article about ${topic.replace(/_/g, " ")}.`,
      });
      files.set(
        `articles-${topic.replace(/_/g, "-")}.html`,
        page(`${titleCase(topic)} - Article`, body, domain),
      );
    }

    files.set(
      "blog-posts.html",
      page(
        "Engineering Blog",
        templates.render("blog.html", {
          domain: `https://${domain}`,
          posts: Array.from({ length: gc.blogs || 0 }, (_, i) => ({
            index: i + 1,
            body:
              prose.get(`blog_${i}`) ||
              `Blog post ${i + 1} about pharmaceutical engineering.`,
            date: `2025-${String(Math.floor(i / 2) + 1).padStart(2, "0")}-15`,
          })),
        }),
        domain,
      ),
    );

    files.set(
      "faq-pages.html",
      page(
        "Frequently Asked Questions",
        templates.render("faq.html", {
          domain: `https://${domain}`,
          faqs: Array.from({ length: gc.faqs || 0 }, (_, i) => ({
            index: i + 1,
            answer: prose.get(`faq_${i}`) || `Answer to FAQ ${i + 1}.`,
          })),
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
          domain: `https://${domain}`,
          reviews: Array.from({ length: gc.reviews || 0 }, (_, i) => ({
            index: i + 1,
            rating: 3 + (i % 3),
            author:
              entities.people[i % entities.people.length]?.name || "Anonymous",
            body:
              prose.get(`review_${i}`) || "Good work on this implementation.",
          })),
        }),
        domain,
      ),
    );

    files.set(
      "comments.html",
      page(
        "Discussion Comments",
        templates.render("comments.html", {
          domain: `https://${domain}`,
          comments: Array.from({ length: gc.comments || 0 }, (_, i) => ({
            index: i + 1,
            author:
              entities.people[i % entities.people.length]?.name || "Anonymous",
            body: prose.get(`comment_${i}`) || "Interesting discussion point.",
          })),
        }),
        domain,
      ),
    );

    files.set(
      "courses-learning-catalog.html",
      page(
        "Learning Catalog",
        templates.render("courses.html", {
          domain: `https://${domain}`,
          courses: Array.from({ length: gc.courses || 0 }, (_, i) => ({
            index: i + 1,
            title: COURSE_TOPICS[i % COURSE_TOPICS.length],
            orgName,
            date: `2025-${String((i % 12) + 1).padStart(2, "0")}-01`,
          })),
        }),
        domain,
      ),
    );

    files.set(
      "events-program-calendar.html",
      page(
        "Event Calendar",
        templates.render("events.html", {
          domain: `https://${domain}`,
          events: Array.from({ length: gc.events || 0 }, (_, i) => ({
            index: i + 1,
            title: EVENT_NAMES[i % EVENT_NAMES.length],
            orgName,
            date: `2025-${String((i % 12) + 1).padStart(2, "0")}-15`,
            location: entities.orgs[0]?.location || "Cambridge, MA",
          })),
        }),
        domain,
      ),
    );
  }

  return files;
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
