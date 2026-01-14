/**
 * Questions JSON Formatter
 *
 * Formats questions as JSON for programmatic analysis.
 */

/**
 * Format questions as JSON
 * @param {Object} view - Questions view from prepareQuestionsView
 * @param {Object} options - Format options
 * @returns {string}
 */
export function questionsToJson(view, _options = {}) {
  const { filter, questions, stats } = view;

  const output = {
    filter: {
      level: filter.level,
      maturity: filter.maturity,
      skills: filter.skills,
      behaviours: filter.behaviours,
      capability: filter.capability,
    },
    questions: questions.map((q) => ({
      source: q.source,
      sourceName: q.sourceName,
      sourceType: q.sourceType,
      level: q.level,
      id: q.id,
      text: q.text,
      lookingFor: q.lookingFor,
      expectedDurationMinutes: q.expectedDurationMinutes,
      followUps: q.followUps.length > 0 ? q.followUps : undefined,
    })),
    stats: {
      totalQuestions: stats.totalQuestions,
      bySource: stats.bySource,
      byLevel: stats.byLevel,
    },
  };

  return JSON.stringify(output, null, 2);
}
