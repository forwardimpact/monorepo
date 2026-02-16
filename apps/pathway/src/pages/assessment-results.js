/**
 * Self-assessment results page
 * Displays job matches, gaps, and development recommendations
 */

import {
  render,
  div,
  h1,
  h2,
  h3,
  h4,
  p,
  span,
  button,
  a,
} from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBadge } from "../components/card.js";
import { formatLevel } from "../lib/render.js";
import { getAssessmentState, resetAssessment } from "./self-assessment.js";
import { findRealisticMatches } from "@forwardimpact/libpathway/matching";

/**
 * Render the assessment results page
 */
export function renderAssessmentResults() {
  const { data } = getState();
  const assessmentState = getAssessmentState();

  // Check if there's any assessment data
  const hasSkills = Object.keys(assessmentState.skills).length > 0;
  const hasBehaviours = Object.keys(assessmentState.behaviours).length > 0;

  if (!hasSkills && !hasBehaviours) {
    renderNoAssessment();
    return;
  }

  // Create self-assessment object in the expected format
  const selfAssessment = {
    id: "current-assessment",
    skills: assessmentState.skills,
    behaviours: assessmentState.behaviours,
  };

  // Find matching jobs with realistic scoring
  const { matches, matchesByTier, estimatedGrade } = findRealisticMatches({
    selfAssessment,
    disciplines: data.disciplines,
    grades: data.grades,
    tracks: data.tracks,
    skills: data.skills,
    behaviours: data.behaviours,
    filterByGrade: false, // Show all grades but group by tier
    topN: 20,
  });

  const page = div(
    { className: "assessment-results-page" },
    // Header
    div(
      { className: "page-header" },
      a(
        { href: "#/self-assessment", className: "back-link" },
        "← Back to Assessment",
      ),
      h1({ className: "page-title" }, "Your Job Matches"),
      p(
        { className: "page-description" },
        "Based on your self-assessment, here are the roles that best match your current skills and behaviours.",
      ),
    ),

    // Summary stats
    createSummaryStats(assessmentState, data, estimatedGrade),

    // Top matches grouped by tier
    createMatchesSection(matches, matchesByTier, selfAssessment, data),

    // Actions
    div(
      { className: "results-actions-footer" },
      button(
        {
          className: "btn btn-secondary",
          onClick: () => {
            window.location.hash = "/self-assessment";
          },
        },
        "← Edit Assessment",
      ),
      button(
        {
          className: "btn btn-secondary",
          onClick: () => {
            if (
              confirm(
                "Are you sure you want to start over? This will clear your assessment.",
              )
            ) {
              resetAssessment();
              window.location.hash = "/self-assessment";
            }
          },
        },
        "Start Over",
      ),
    ),
  );

  render(page);
}

/**
 * Render message when no assessment data exists
 */
function renderNoAssessment() {
  render(
    div(
      { className: "assessment-results-page" },
      div(
        { className: "no-assessment-message" },
        h1({}, "No Assessment Data"),
        p(
          {},
          "You haven't completed a self-assessment yet. Complete the assessment to see your job matches.",
        ),
        a(
          { href: "#/self-assessment", className: "btn btn-primary btn-lg" },
          "Start Self-Assessment →",
        ),
      ),
    ),
  );
}

/**
 * Create summary statistics section
 * @param {Object} assessmentState - Current assessment state
 * @param {Object} data - App data
 * @param {{grade: Object, confidence: number}} estimatedGrade - Estimated best-fit grade
 * @returns {HTMLElement}
 */
function createSummaryStats(assessmentState, data, estimatedGrade) {
  const skillCount = Object.keys(assessmentState.skills).length;
  const behaviourCount = Object.keys(assessmentState.behaviours).length;

  // Calculate average levels
  const avgSkillLevel = calculateAverageLevel(
    Object.values(assessmentState.skills),
    ["awareness", "foundational", "working", "practitioner", "expert"],
  );

  // Get grade name based on track (default to professional)
  const gradeName =
    estimatedGrade.grade.professionalTitle ||
    estimatedGrade.grade.name ||
    estimatedGrade.grade.id;
  const confidenceLabel =
    estimatedGrade.confidence >= 0.7
      ? "High"
      : estimatedGrade.confidence >= 0.4
        ? "Medium"
        : "Low";

  return div(
    { className: "results-summary-section" },
    h2({}, "Assessment Summary"),
    div(
      { className: "auto-grid-xs" },
      createStatBox(
        String(skillCount),
        `of ${data.skills.length} Skills`,
        "📊",
      ),
      createStatBox(
        String(behaviourCount),
        `of ${data.behaviours.length} Behaviours`,
        "🧠",
      ),
      createStatBox(formatLevel(avgSkillLevel), "Avg Skill Level", "💡"),
      createStatBox(gradeName, `Estimated Level (${confidenceLabel})`, "🎯"),
    ),
  );
}

/**
 * Create a stat box
 * @param {string} value
 * @param {string} label
 * @param {string} icon
 * @returns {HTMLElement}
 */
function createStatBox(value, label, icon) {
  return div(
    { className: "result-stat-box" },
    span({ className: "stat-icon" }, icon),
    span({ className: "stat-value" }, value),
    span({ className: "stat-label" }, label),
  );
}

/**
 * Calculate average level from array of levels
 * @param {string[]} levels
 * @param {string[]} levelOrder
 * @returns {string}
 */
function calculateAverageLevel(levels, levelOrder) {
  if (levels.length === 0) return levelOrder[0];

  const sum = levels.reduce((acc, level) => {
    const index = levelOrder.indexOf(level);
    return acc + (index >= 0 ? index : 0);
  }, 0);

  const avgIndex = Math.round(sum / levels.length);
  return levelOrder[Math.min(avgIndex, levelOrder.length - 1)];
}

/**
 * Create the matches section grouped by tier
 * @param {Array} matches - Job matches from findRealisticMatches
 * @param {Object} matchesByTier - Matches grouped by tier
 * @param {Object} selfAssessment - Self-assessment data
 * @param {Object} data - App data
 * @returns {HTMLElement}
 */
function createMatchesSection(matches, matchesByTier, selfAssessment, data) {
  if (matches.length === 0) {
    return div(
      { className: "no-matches" },
      h2({}, "No Matches Found"),
      p(
        {},
        "We couldn't find any suitable job matches. Try completing more of the assessment.",
      ),
    );
  }

  // Create tier sections
  const tierSections = [];

  // Tier 1: Strong Matches
  if (matchesByTier[1].length > 0) {
    tierSections.push(
      createTierSection(
        1,
        "Strong Matches",
        "green",
        "Ready for these roles now",
        matchesByTier[1],
        selfAssessment,
        data,
      ),
    );
  }

  // Tier 2: Good Matches
  if (matchesByTier[2].length > 0) {
    tierSections.push(
      createTierSection(
        2,
        "Good Matches",
        "blue",
        "Ready within 6-12 months of focused growth",
        matchesByTier[2],
        selfAssessment,
        data,
      ),
    );
  }

  // Tier 3: Stretch Roles
  if (matchesByTier[3].length > 0) {
    tierSections.push(
      createTierSection(
        3,
        "Stretch Roles",
        "amber",
        "Ambitious but achievable with dedicated development",
        matchesByTier[3],
        selfAssessment,
        data,
      ),
    );
  }

  // Tier 4: Aspirational (show fewer)
  if (matchesByTier[4].length > 0) {
    tierSections.push(
      createTierSection(
        4,
        "Aspirational",
        "gray",
        "Long-term career goals requiring significant growth",
        matchesByTier[4].slice(0, 3),
        selfAssessment,
        data,
      ),
    );
  }

  return div(
    { className: "matches-section" },
    h2({}, "Job Matches by Readiness"),
    p(
      { className: "text-muted" },
      "Jobs are grouped by how ready you are for them based on your current skills and behaviours.",
    ),
    ...tierSections,
  );
}

/**
 * Create a tier section
 * @param {number} tierNum - Tier number (1-4)
 * @param {string} title - Section title
 * @param {string} color - Color class
 * @param {string} description - Tier description
 * @param {Array} matches - Matches in this tier
 * @param {Object} selfAssessment - Self-assessment data
 * @param {Object} data - App data
 * @returns {HTMLElement}
 */
function createTierSection(
  tierNum,
  title,
  color,
  description,
  matches,
  selfAssessment,
  data,
) {
  return div(
    { className: `tier-section tier-${tierNum} tier-color-${color}` },
    div(
      { className: "tier-header" },
      h3({ className: "tier-title" }, title),
      span(
        { className: "tier-count" },
        `${matches.length} role${matches.length !== 1 ? "s" : ""}`,
      ),
    ),
    p({ className: "tier-description" }, description),
    div(
      { className: "matches-list" },
      ...matches.map((match, index) =>
        createMatchCard(match, index, selfAssessment, data),
      ),
    ),
  );
}

/**
 * Create a match card
 * @param {Object} match - Job match object
 * @param {number} index - Match index
 * @param {Object} selfAssessment - Self-assessment data
 * @param {Object} data - App data
 * @returns {HTMLElement}
 */
function createMatchCard(match, _index, _selfAssessment, _data) {
  const { job, analysis } = match;
  const matchPercent = Math.round(analysis.overallScore * 100);

  // Use tier from model for consistent classification
  const tierColor = analysis.tier.color;

  return div(
    { className: `match-card match-tier-${tierColor}` },
    // Header
    div(
      { className: "match-card-header" },
      div(
        { className: "match-title-area" },
        h3(
          { className: "match-job-title" },
          a(
            {
              href: job.track
                ? `#/job/${job.discipline.id}/${job.grade.id}/${job.track.id}`
                : `#/job/${job.discipline.id}/${job.grade.id}`,
            },
            job.title,
          ),
        ),
        div(
          { className: "match-badges" },
          createBadge(job.discipline.name, "default"),
          createBadge(job.grade.name, "secondary"),
          job.track && createBadge(job.track.name, "broad"),
        ),
      ),
      div(
        { className: "match-score-area" },
        div(
          { className: `match-score match-score-${tierColor}` },
          span({ className: "score-value" }, `${matchPercent}%`),
          span({ className: "score-label" }, "Match"),
        ),
      ),
    ),

    // Score breakdown
    div(
      { className: "auto-grid-sm" },
      createScoreBar(
        "Skills",
        analysis.skillScore,
        analysis.weightsUsed.skills,
      ),
      createScoreBar(
        "Behaviours",
        analysis.behaviourScore,
        analysis.weightsUsed.behaviours,
      ),
    ),

    // Priority gaps section (use priorityGaps from model - top 3)
    analysis.priorityGaps.length > 0 &&
      div(
        { className: "match-gaps" },
        h4({}, "Priority Development Areas"),
        div(
          { className: "gaps-list" },
          ...analysis.priorityGaps.map((gap) => createGapItem(gap)),
          analysis.gaps.length > 3 &&
            span(
              { className: "more-gaps" },
              `+${analysis.gaps.length - 3} more areas`,
            ),
        ),
      ),

    // Actions
    div(
      { className: "match-card-actions" },
      a(
        {
          href: job.track
            ? `#/job/${job.discipline.id}/${job.grade.id}/${job.track.id}`
            : `#/job/${job.discipline.id}/${job.grade.id}`,
          className: "btn btn-secondary btn-sm",
        },
        "View Job Details",
      ),
      a(
        {
          href: job.track
            ? `#/interview/${job.discipline.id}/${job.grade.id}/${job.track.id}`
            : `#/interview/${job.discipline.id}/${job.grade.id}`,
          className: "btn btn-secondary btn-sm",
        },
        "Interview Prep",
      ),
    ),
  );
}

/**
 * Create a score bar
 * @param {string} label
 * @param {number} score - Score from 0 to 1
 * @param {number} weight - Weight factor
 * @returns {HTMLElement}
 */
function createScoreBar(label, score, weight) {
  const percent = Math.round(score * 100);
  const weightPercent = Math.round(weight * 100);

  return div(
    { className: "score-bar-item" },
    div(
      { className: "score-bar-header" },
      span({ className: "score-bar-label" }, label),
      span(
        { className: "score-bar-values" },
        `${percent}% (${weightPercent}% weight)`,
      ),
    ),
    div(
      { className: "progress-bar" },
      div({ className: "progress-bar-fill", style: `width: ${percent}%` }),
    ),
  );
}

/**
 * Create a gap item
 * @param {Object} gap - Gap information
 * @returns {HTMLElement}
 */
function createGapItem(gap) {
  const isSkill = gap.type === "skill";

  return div(
    { className: "gap-item" },
    span({ className: "gap-type-icon" }, isSkill ? "💡" : "🧠"),
    span({ className: "gap-name" }, gap.name),
    span(
      { className: "gap-levels" },
      span({ className: "gap-current" }, formatLevel(gap.current)),
      span({ className: "gap-arrow" }, "→"),
      span({ className: "gap-required" }, formatLevel(gap.required)),
    ),
    span(
      { className: `gap-size gap-size-${gap.gap}` },
      `+${gap.gap} level${gap.gap > 1 ? "s" : ""}`,
    ),
  );
}
