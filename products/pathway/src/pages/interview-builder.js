/**
 * Interview prep page
 */

import { render } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBuilder, createStandardPreview } from "../components/builder.js";
import { prepareInterviewBuilderPreview } from "../formatters/interview/shared.js";

/**
 * Render interview prep page
 */
export function renderInterviewPrep() {
  const { data } = getState();

  render(
    createBuilder({
      title: "Interview Prep",
      description:
        "Select a discipline, track, and level to generate tailored interview questions " +
        "based on the role's skill requirements and expected behaviours.",
      formTitle: "Select Role",
      emptyPreviewText: "Select all three components to preview the interview.",
      buttonText: "View Interview Questions →",
      previewPresenter: (selection) =>
        prepareInterviewBuilderPreview({
          ...selection,
          behaviourCount: data.behaviours.length,
          levels: data.levels,
        }),
      detailPath: (sel) =>
        sel.track
          ? `/interview/${sel.discipline}/${sel.level}/${sel.track}`
          : `/interview/${sel.discipline}/${sel.level}`,
      renderPreview: createStandardPreview,
      helpItems: [
        {
          label: "Role Selection",
          text: "Choose a discipline, track, and level to define the target role for the interview.",
        },
        {
          label: "Skill Questions",
          text: "These questions come from the required skill proficiencies for the role.",
        },
        {
          label: "Behaviour Questions",
          text: "Behavioural questions assess mindsets and ways of working at the expected maturity.",
        },
      ],
    }),
  );
}
