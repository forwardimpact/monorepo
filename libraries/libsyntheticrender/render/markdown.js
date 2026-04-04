/**
 * Markdown Renderer — generates personal knowledge-base content
 * for Basecamp personas.
 *
 * Uses TemplateLoader from libtemplate for all output.
 */

const SKILL_NAMES = [
  "version_control",
  "code_review",
  "testing",
  "deployment",
  "monitoring",
  "documentation",
  "architecture",
  "security",
];
const PROFICIENCIES = [
  "awareness",
  "foundational",
  "working",
  "practitioner",
  "expert",
];
const LEVEL_IDX = { L1: 0, L2: 1, L3: 2, L4: 3, L5: 4 };

/**
 * Render all files for a single persona.
 * @param {Map<string,string>} files
 * @param {object} person
 * @param {object} entities
 * @param {Map<string,string>} prose
 * @param {object} templates
 * @param {string} date
 */
function buildPersonaContext(person, entities, date) {
  const team = entities.teams.find((t) => t.id === person.team_id);
  const dept = entities.departments.find((d) => d.id === person.department);
  return {
    ctx: {
      personId: person.id,
      personName: person.name,
      discipline: person.discipline,
      level: person.level,
      email: person.email,
      teamName: team?.name || "Unknown",
      deptName: dept?.name || "Unknown",
      teamSize: team?.size || "?",
      isManager: person.is_manager ? "Yes" : "No",
      date,
    },
    team,
    baseIdx: LEVEL_IDX[person.level] || 0,
  };
}

function renderPersonaProjects(
  files,
  prefix,
  ctx,
  person,
  entities,
  prose,
  templates,
) {
  const personProjects = entities.projects.filter((proj) =>
    (proj.teams || []).includes(person.team_id),
  );
  for (const proj of personProjects) {
    files.set(
      `${prefix}/project-${proj.id}.md`,
      templates.render("project-note.md", {
        ...ctx,
        projectId: proj.id,
        projectName: proj.name,
        projectType: proj.type,
        timeline_start: proj.timeline_start,
        timeline_end: proj.timeline_end,
        note:
          prose.get(`project_note_${person.id}_${proj.id}`) ||
          `Notes on ${proj.name} from ${person.name}'s perspective.`,
      }),
    );
  }
}

function renderPersona(files, person, entities, prose, templates, date) {
  const { ctx, team, baseIdx } = buildPersonaContext(person, entities, date);
  const prefix = `personas/${person.id}`;

  files.set(
    `${prefix}/daily-briefing.md`,
    templates.render("briefing.md", {
      ...ctx,
      briefing:
        prose.get(`briefing_${person.id}`) ||
        `Morning briefing for ${person.name}, ${person.discipline} ${person.level} on ${team?.name || "their team"}.`,
    }),
  );

  files.set(
    `${prefix}/weekly-notes.md`,
    templates.render("weekly.md", {
      ...ctx,
      weeklyNote:
        prose.get(`weekly_${person.id}`) ||
        `Weekly reflection for ${person.name}.`,
    }),
  );

  files.set(
    `${prefix}/skill-reflections.md`,
    templates.render("skill-reflection.md", {
      ...ctx,
      skills: SKILL_NAMES.map((s) => ({
        label: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        proficiency: PROFICIENCIES[Math.min(4, baseIdx)],
      })),
      growthNote:
        baseIdx < 4
          ? `Target: Move from ${PROFICIENCIES[baseIdx]} to ${PROFICIENCIES[baseIdx + 1]} in key areas.`
          : "Currently at expert level. Focus on mentoring and knowledge sharing.",
    }),
  );

  renderPersonaProjects(files, prefix, ctx, person, entities, prose, templates);
}

/**
 * Render Markdown files for Basecamp personas.
 * @param {object} entities
 * @param {Map<string,string>} prose
 * @param {import('@forwardimpact/libtemplate/loader').TemplateLoader} templates - Template loader
 * @returns {Map<string,string>} path → Markdown content
 */
export function renderMarkdown(entities, prose, templates) {
  if (!templates) throw new Error("templates is required");
  const files = new Map();
  const basecampContent = entities.content.find(
    (c) => c.id === "basecamp_markdown",
  );
  if (!basecampContent) return files;

  const personaCount = basecampContent.personas || 0;
  const personaLevels = basecampContent.persona_levels || ["L2", "L3", "L4"];
  const candidates = entities.people.filter((p) =>
    personaLevels.includes(p.level),
  );
  const personas = candidates.slice(0, personaCount);
  const date = new Date().toISOString().split("T")[0];

  for (const person of personas) {
    renderPersona(files, person, entities, prose, templates, date);
  }

  return files;
}
