/**
 * Job formatting for markdown/CLI output
 */

import {
  tableToMarkdown,
  objectToMarkdownList,
  formatPercent,
} from "../shared.js";
import { formatLevel } from "../../lib/render.js";
import { formatJobDescription } from "./description.js";
import { SKILL_PROFICIENCY_ORDER } from "@forwardimpact/map/levels";
import { toolkitToMarkdown } from "../toolkit/markdown.js";

/**
 * Format job detail as markdown
 * @param {Object} view - Job detail view from presenter
 * @param {Object} [entities] - Original entities (for job description)
 * @param {string} [jobTemplate] - Mustache template for job description
 * @returns {string}
 */
export function jobToMarkdown(view, entities = {}, jobTemplate) {
  const lines = [
    `# ${view.title}`,
    "",
    `${view.disciplineName} × ${view.levelId} × ${view.trackName}`,
    "",
  ];

  // Expectations
  if (view.expectations && Object.keys(view.expectations).length > 0) {
    lines.push("## Expectations", "");
    lines.push(objectToMarkdownList(view.expectations));
    lines.push("");
  }

  // Behaviour Profile
  lines.push("## Behaviour Profile", "");
  const behaviourRows = view.behaviourProfile.map((b) => [
    b.behaviourName,
    formatLevel(b.maturity),
  ]);
  lines.push(tableToMarkdown(["Behaviour", "Maturity"], behaviourRows));
  lines.push("");

  // Skill Matrix - sorted by level descending
  lines.push("## Skill Matrix", "");
  const sortedSkills = [...view.skillMatrix].sort((a, b) => {
    const levelA = SKILL_PROFICIENCY_ORDER.indexOf(a.level);
    const levelB = SKILL_PROFICIENCY_ORDER.indexOf(b.level);
    if (levelB !== levelA) {
      return levelB - levelA;
    }
    return a.skillName.localeCompare(b.skillName);
  });
  const skillRows = sortedSkills.map((s) => [
    s.skillName,
    formatLevel(s.proficiency),
  ]);
  lines.push(tableToMarkdown(["Skill", "Level"], skillRows));
  lines.push("");

  // Toolkit
  if (view.toolkit && view.toolkit.length > 0) {
    lines.push("## Tool Kit", "");
    lines.push(toolkitToMarkdown(view.toolkit));
    lines.push("");
  }

  // Driver Coverage
  if (view.driverCoverage.length > 0) {
    lines.push("## Driver Coverage", "");
    const driverRows = view.driverCoverage.map((d) => [
      d.name,
      formatPercent(d.coverage),
      `${d.skillsCovered}/${d.skillsTotal} skills`,
      `${d.behavioursCovered}/${d.behavioursTotal} behaviours`,
    ]);
    lines.push(
      tableToMarkdown(
        ["Driver", "Coverage", "Skills", "Behaviours"],
        driverRows,
      ),
    );
    lines.push("");
  }

  // Job Description (copyable markdown)
  if (entities.discipline && entities.level && jobTemplate) {
    lines.push("---", "");
    lines.push("## Job Description", "");
    lines.push("```markdown");
    lines.push(
      formatJobDescription(
        {
          job: {
            title: view.title,
            skillMatrix: view.skillMatrix,
            behaviourProfile: view.behaviourProfile,
            expectations: view.expectations,
            derivedResponsibilities: view.derivedResponsibilities,
          },
          discipline: entities.discipline,
          level: entities.level,
          track: entities.track,
        },
        jobTemplate,
      ),
    );
    lines.push("```");
  }

  return lines.join("\n");
}
