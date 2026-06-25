/**
 * Questions Markdown Formatter
 *
 * Formats questions for terminal output as tables and lists.
 */

import { SKILL_PROFICIENCIES, BEHAVIOUR_MATURITIES } from "./shared.js";

/**
 * Level abbreviations for compact display
 */
const LEVEL_ABBREVS = {
  awareness: "aware",
  foundational: "found",
  working: "work",
  practitioner: "pract",
  expert: "expert",
};

/**
 * Maturity abbreviations for compact display
 */
const MATURITY_ABBREVS = {
  emerging: "emerg",
  developing: "dev",
  practicing: "pract",
  "role-modeling": "role",
  exemplifying: "exemp",
};

/**
 * Truncate text to max length with ellipsis
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

/**
 * Pad string to width
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function pad(str, width) {
  return str.padEnd(width);
}

/**
 * Format a stats table for skills or behaviours.
 * @param {Object} params
 * @param {string} params.title
 * @param {string} params.rowLabel
 * @param {Object} params.entryStats - Map of id → per-level counts
 * @param {string[]} params.levels - Level keys to render columns for
 * @param {Record<string, string>} params.abbrevs - Column abbreviations per level
 * @param {(id: string) => string} params.nameOf - Render the row label for an id
 * @returns {string[]} lines
 */
function formatStatsTable({
  title,
  rowLabel,
  entryStats,
  levels,
  abbrevs,
  nameOf,
}) {
  const lines = [];
  lines.push(title);
  lines.push("═".repeat(75));
  lines.push("");

  const header =
    pad(rowLabel, 30) +
    levels.map((l) => pad(abbrevs[l], 7)).join("") +
    "TOTAL";
  lines.push(header);
  lines.push("─".repeat(75));

  const sortedIds = Object.keys(entryStats).sort();
  const levelTotals = {};
  let grandTotal = 0;

  for (const id of sortedIds) {
    const data = entryStats[id];
    const row =
      pad(nameOf(id), 30) +
      levels
        .map((l) => {
          const count = data[l] || 0;
          levelTotals[l] = (levelTotals[l] || 0) + count;
          return pad(String(count), 7);
        })
        .join("") +
      String(data.total || 0);
    lines.push(row);
    grandTotal += data.total || 0;
  }

  lines.push("─".repeat(75));
  const totalsRow =
    pad("TOTAL", 30) +
    levels.map((l) => pad(String(levelTotals[l] || 0), 7)).join("") +
    String(grandTotal);
  lines.push(totalsRow);
  lines.push("");
  return lines;
}

function findSkillGaps(skillStats) {
  const gaps = [];
  for (const skillId of Object.keys(skillStats).sort()) {
    const data = skillStats[skillId];
    for (const level of SKILL_PROFICIENCIES) {
      if ((data[level] || 0) < 1) {
        gaps.push(`${skillId}: missing ${level} questions`);
      }
    }
  }
  return gaps;
}

function formatGaps(gaps) {
  if (gaps.length === 0) return [];
  const lines = ["⚠️  GAPS:"];
  for (const gap of gaps.slice(0, 10)) {
    lines.push(`  - ${gap}`);
  }
  if (gaps.length > 10) {
    lines.push(`  ... and ${gaps.length - 10} more`);
  }
  return lines;
}

/**
 * Format stats-only output
 * @param {Object} view - Questions view
 * @param {Array} skills - Skills data
 * @returns {string}
 */
function formatStats(view, skills) {
  const { stats } = view;
  const skillName = (id) => {
    const skill = skills.find((s) => s.id === id);
    return skill ? truncate(skill.name, 28) : id;
  };
  const behaviourName = (id) => truncate(id.replace(/[-_]/g, " "), 28);

  const lines = [
    ...formatStatsTable({
      title: "SKILL QUESTION COUNTS",
      rowLabel: "Skill",
      entryStats: stats.skillStats,
      levels: SKILL_PROFICIENCIES,
      abbrevs: LEVEL_ABBREVS,
      nameOf: skillName,
    }),
    ...formatStatsTable({
      title: "BEHAVIOUR QUESTION COUNTS",
      rowLabel: "Behaviour",
      entryStats: stats.behaviourStats,
      levels: BEHAVIOUR_MATURITIES,
      abbrevs: MATURITY_ABBREVS,
      nameOf: behaviourName,
    }),
    ...formatGaps(findSkillGaps(stats.skillStats)),
  ];

  return lines.join("\n");
}

/**
 * Format table output for questions at a level/maturity
 * @param {Object} view - Questions view
 * @returns {string}
 */
function formatTable(view) {
  const lines = [];
  const { filter, questions, stats } = view;

  // Header
  const levelOrMaturity = filter.level || filter.maturity || "ALL";
  const sourceType = filter.level
    ? "skills"
    : filter.maturity
      ? "behaviours"
      : "sources";
  lines.push(
    `${levelOrMaturity.toUpperCase()} LEVEL QUESTIONS (${stats.totalQuestions} from ${Object.keys(stats.bySource).length} ${sourceType})`,
  );
  lines.push("═".repeat(80));
  lines.push("");

  // Table header
  lines.push(pad("Source", 28) + " │ " + pad("Question", 45) + " │ Min");
  lines.push("─".repeat(28) + "─┼─" + "─".repeat(45) + "─┼─" + "───");

  // Group by source
  const bySource = {};
  for (const q of questions) {
    if (!bySource[q.source]) {
      bySource[q.source] = { name: q.sourceName, questions: [] };
    }
    bySource[q.source].questions.push(q);
  }

  for (const data of Object.values(bySource).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    for (const q of data.questions) {
      const source = truncate(data.name, 26);
      const text = truncate(q.text, 43);
      const mins = String(q.expectedDurationMinutes);
      lines.push(pad(source, 28) + " │ " + pad(text, 45) + " │ " + mins);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Append an indented labelled list if items are present
 * @param {string[]} lines
 * @param {string} label
 * @param {string[]} items
 * @param {string} bullet - Bullet character prefix
 */
function appendLabelledList(lines, label, items, bullet = "-") {
  if (!items || items.length === 0) return;
  lines.push(`    ${label}:`);
  for (const item of items) {
    lines.push(`      ${bullet} ${item}`);
  }
}

/**
 * Format a single question's detail lines
 * @param {string[]} lines
 * @param {Object} q - Flattened question
 */
function formatQuestionDetail(lines, q) {
  lines.push(`  • [${q.id}] ${q.text}`);
  lines.push(`    Duration: ${q.expectedDurationMinutes} min`);
  if (q.context) {
    lines.push(`    Context: ${q.context}`);
  }
  appendLabelledList(lines, "Steer the simulation", q.simulationPrompts);
  appendLabelledList(lines, "Guide candidate thinking", q.decompositionPrompts);
  appendLabelledList(lines, "Looking for", q.lookingFor);
  appendLabelledList(lines, "Follow-ups", q.followUps, "→");
  lines.push("");
}

function formatSingleSource(view) {
  const lines = [];
  const { questions, stats } = view;

  if (questions.length === 0) {
    return "No questions found.";
  }

  const sourceName = questions[0].sourceName;
  const sourceType = questions[0].sourceType;

  lines.push(`${sourceName} QUESTIONS (${stats.totalQuestions} total)`);
  lines.push("═".repeat(60));
  lines.push("");

  // Group by level/maturity
  const byLevel = {};
  for (const q of questions) {
    if (!byLevel[q.level]) {
      byLevel[q.level] = [];
    }
    byLevel[q.level].push(q);
  }

  const orderedLevels =
    sourceType === "skill" ? SKILL_PROFICIENCIES : BEHAVIOUR_MATURITIES;

  for (const level of orderedLevels) {
    if (!byLevel[level]) continue;

    lines.push(level.toUpperCase());
    for (const q of byLevel[level]) {
      formatQuestionDetail(lines, q);
    }
  }

  return lines.join("\n");
}

/**
 * Format questions as markdown for terminal
 * @param {Object} view - Questions view from prepareQuestionsView
 * @param {Object} options - Format options
 * @param {boolean} options.stats - Stats only
 * @param {Array} options.skills - Skills data for name resolution
 * @returns {string}
 */
export function questionsToMarkdown(view, options = {}) {
  // Stats only mode
  if (options.stats) {
    return formatStats(view, options.skills || []);
  }

  // Single source deep dive
  const uniqueSources = new Set(view.questions.map((q) => q.source));
  if (uniqueSources.size === 1) {
    return formatSingleSource(view);
  }

  // Table format (default)
  return formatTable(view);
}
