/**
 * Career progress selection page
 */

import { render } from "../lib/render.js";
import { getState } from "../lib/state.js";
import { createBuilder, createProgressPreview } from "../components/builder.js";
import { prepareCareerProgressPreview } from "../formatters/progress/shared.js";

/**
 * Render career progress selection page
 */
export function renderCareerProgress() {
  const { data } = getState();

  render(
    createBuilder({
      title: "Career Progress",
      description:
        "Select your current role to visualize career progression. See what skills and behaviours " +
        "change as you advance to the next level. You can also compare expectations across different tracks.",
      formTitle: "Select Your Current Role",
      emptyPreviewText:
        "Select all three components to preview progression paths.",
      buttonText: "View Career Progress →",
      previewPresenter: (selection) =>
        prepareCareerProgressPreview({
          ...selection,
          levels: data.levels,
          tracks: data.tracks,
        }),
      detailPath: (sel) =>
        sel.track
          ? `/progress/${sel.discipline}/${sel.level}/${sel.track}`
          : `/progress/${sel.discipline}/${sel.level}`,
      renderPreview: createProgressPreview,
      labels: {
        level: "Current Level",
      },
      helpItems: [
        {
          label: "📈 Level Progression",
          text: "See exactly which skills and behaviours need to grow to advance to the next level rank.",
        },
        {
          label: "🔀 Track Comparison",
          text: "Compare how expectations differ across tracks at the same level. This helps you explore lateral moves.",
        },
        {
          label: "🎯 Development Focus",
          text: "Identify the specific areas to focus on for career growth based on the engineering pathway.",
        },
        {
          label: "📊 Visual Comparison",
          text: "Radar charts and comparison tables make it easy to see gaps and growth areas at a glance.",
        },
      ],
    }),
  );
}
