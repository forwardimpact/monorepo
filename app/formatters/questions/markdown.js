/**
 * Questions Markdown Formatter
 *
 * Formats questions for terminal output as tables and lists.
 */

import { SKILL_LEVELS, BEHAVIOUR_MATURITIES } from "./shared.js";

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
  role_modeling: "role",
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
 * Format stats-only output
 * @param {Object} view - Questions view
 * @param {Array} skills - Skills data
 * @returns {string}
 */
function formatStats(view, skills) {
  const lines = [];
  const { stats } = view;

  // Skill question counts
  lines.push("SKILL QUESTION COUNTS");
  lines.push("═".repeat(75));
  lines.push("");

  // Header
  const skillHeader =
    pad("Skill", 30) +
    SKILL_LEVELS.map((l) => pad(LEVEL_ABBREVS[l], 7)).join("") +
    "TOTAL";
  lines.push(skillHeader);
  lines.push("─".repeat(75));

  // Rows
  const sortedSkillIds = Object.keys(stats.skillStats).sort();
  let skillTotal = 0;
  const levelTotals = {};

  for (const skillId of sortedSkillIds) {
    const skillData = stats.skillStats[skillId];
    const skill = skills.find((s) => s.id === skillId);
    const name = skill ? truncate(skill.name, 28) : skillId;

    const row =
      pad(name, 30) +
      SKILL_LEVELS.map((l) => {
        const count = skillData[l] || 0;
        levelTotals[l] = (levelTotals[l] || 0) + count;
        return pad(String(count), 7);
      }).join("") +
      String(skillData.total || 0);

    lines.push(row);
    skillTotal += skillData.total || 0;
  }

  lines.push("─".repeat(75));
  const totalsRow =
    pad("TOTAL", 30) +
    SKILL_LEVELS.map((l) => pad(String(levelTotals[l] || 0), 7)).join("") +
    String(skillTotal);
  lines.push(totalsRow);
  lines.push("");

  // Behaviour question counts
  lines.push("BEHAVIOUR QUESTION COUNTS");
  lines.push("═".repeat(75));
  lines.push("");

  const behaviourHeader =
    pad("Behaviour", 30) +
    BEHAVIOUR_MATURITIES.map((m) => pad(MATURITY_ABBREVS[m], 7)).join("") +
    "TOTAL";
  lines.push(behaviourHeader);
  lines.push("─".repeat(75));

  const sortedBehaviourIds = Object.keys(stats.behaviourStats).sort();
  let behaviourTotal = 0;
  const maturityTotals = {};

  for (const behaviourId of sortedBehaviourIds) {
    const behaviourData = stats.behaviourStats[behaviourId];
    const name = truncate(behaviourId.replace(/_/g, " "), 28);

    const row =
      pad(name, 30) +
      BEHAVIOUR_MATURITIES.map((m) => {
        const count = behaviourData[m] || 0;
        maturityTotals[m] = (maturityTotals[m] || 0) + count;
        return pad(String(count), 7);
      }).join("") +
      String(behaviourData.total || 0);

    lines.push(row);
    behaviourTotal += behaviourData.total || 0;
  }

  lines.push("─".repeat(75));
  const bTotalsRow =
    pad("TOTAL", 30) +
    BEHAVIOUR_MATURITIES.map((m) =>
      pad(String(maturityTotals[m] || 0), 7),
    ).join("") +
    String(behaviourTotal);
  lines.push(bTotalsRow);
  lines.push("");

  // Identify gaps (skills with < 2 questions per level)
  const gaps = [];
  for (const skillId of sortedSkillIds) {
    const skillData = stats.skillStats[skillId];
    for (const level of SKILL_LEVELS) {
      if ((skillData[level] || 0) < 1) {
        gaps.push(`${skillId}: missing ${level} questions`);
      }
    }
  }

  if (gaps.length > 0) {
    lines.push("⚠️  GAPS:");
    for (const gap of gaps.slice(0, 10)) {
      lines.push(`  - ${gap}`);
    }
    if (gaps.length > 10) {
      lines.push(`  ... and ${gaps.length - 10} more`);
    }
  }

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
 * Format single source deep dive
 * @param {Object} view - Questions view
 * @returns {string}
 */
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
    sourceType === "skill" ? SKILL_LEVELS : BEHAVIOUR_MATURITIES;

  for (const level of orderedLevels) {
    if (!byLevel[level]) continue;

    lines.push(level.toUpperCase());
    for (const q of byLevel[level]) {
      lines.push(`  • [${q.id}] ${q.text}`);
      lines.push(`    Duration: ${q.expectedDurationMinutes} min`);
      if (q.lookingFor.length > 0) {
        lines.push("    Looking for:");
        for (const item of q.lookingFor) {
          lines.push(`      - ${item}`);
        }
      }
      if (q.followUps.length > 0) {
        lines.push("    Follow-ups:");
        for (const fu of q.followUps) {
          lines.push(`      → ${fu}`);
        }
      }
      lines.push("");
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
