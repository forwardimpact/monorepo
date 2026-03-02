/**
 * Job builder page
 */

import { render } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBuilder, createStandardPreview } from "../components/builder.js";
import { prepareJobBuilderPreview } from "@forwardimpact/libskill/job";

/**
 * Render job builder page
 */
export function renderJobBuilder() {
  const { data } = getState();

  render(
    createBuilder({
      title: "Job Builder",
      description:
        "Combine a discipline, track, and level to generate a complete job definition " +
        "with skill matrix and behaviour profile.",
      formTitle: "Select Components",
      emptyPreviewText:
        "Select all three components to preview the job definition.",
      buttonText: "View Full Job Definition →",
      previewPresenter: (selection) =>
        prepareJobBuilderPreview({
          ...selection,
          behaviourCount: data.behaviours.length,
          levels: data.levels,
        }),
      detailPath: (sel) =>
        sel.track
          ? `/job/${sel.discipline}/${sel.level}/${sel.track}`
          : `/job/${sel.discipline}/${sel.level}`,
      renderPreview: createStandardPreview,
      helpItems: [
        {
          label: "Discipline",
          text: "Defines the T-shaped skill profile with primary, secondary, and broad skills.",
        },
        {
          label: "Level",
          text: "Sets base skill proficiencies and behaviour maturity expectations for career level.",
        },
        {
          label: "Track",
          text: "Modifies skill and behaviour expectations based on the nature of work.",
        },
      ],
    }),
  );
}
