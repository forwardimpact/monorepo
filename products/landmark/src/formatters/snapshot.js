/**
 * Formatters for the `snapshot` command.
 */

import { formatDelta, padRight, renderHeader } from "./shared.js";

export function toText(view) {
  if (view.snapshots) return listToText(view);
  if (view.trend) return trendToText(view);
  return scoresToText(view);
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  if (view.snapshots) return listToMarkdown(view);
  if (view.trend) return trendToMarkdown(view);
  return scoresToMarkdown(view);
}

function listToText({ snapshots }) {
  const lines = [renderHeader("GetDX Snapshots"), ""];
  for (const s of snapshots) {
    const date = s.scheduled_for ?? "(no date)";
    const status = s.completed_at ? "completed" : "pending";
    lines.push(`    ${padRight(s.snapshot_id, 30)}  ${date}  ${status}`);
  }
  lines.push("");
  return lines.join("\n");
}

function scoresToText({ snapshotId, scores }) {
  const lines = [renderHeader(`Snapshot ${snapshotId}`), ""];
  const nameWidth = Math.max(
    20,
    ...scores.map((s) => (s.item_name ?? s.item_id ?? "").length),
  );
  for (const s of scores) {
    const name = padRight(s.item_name ?? s.item_id ?? "", nameWidth);
    const score = s.score != null ? `${s.score}` : "n/a";
    const comparisons = [
      `vs_prev: ${formatDelta(s.vs_prev)}`,
      `vs_org: ${formatDelta(s.vs_org)}`,
      `vs_50th: ${formatDelta(s.vs_50th)}`,
      `vs_75th: ${formatDelta(s.vs_75th)}`,
      `vs_90th: ${formatDelta(s.vs_90th)}`,
    ].join(", ");
    lines.push(`    ${name}  ${padRight(score, 6)}  ${comparisons}`);
  }
  lines.push("");
  return lines.join("\n");
}

function trendToText({ itemId, trend }) {
  const lines = [renderHeader(`Trend for ${itemId}`), ""];
  for (const row of trend) {
    const date = row.getdx_snapshots?.scheduled_for ?? "(unknown)";
    const score = row.score != null ? `${row.score}` : "n/a";
    lines.push(`    ${padRight(date, 15)}  ${score}`);
  }
  lines.push("");
  return lines.join("\n");
}

function listToMarkdown({ snapshots }) {
  const lines = [
    "# GetDX Snapshots",
    "",
    "| Snapshot ID | Date | Status |",
    "| --- | --- | --- |",
  ];
  for (const s of snapshots) {
    const date = s.scheduled_for ?? "(no date)";
    const status = s.completed_at ? "completed" : "pending";
    lines.push(`| ${s.snapshot_id} | ${date} | ${status} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function scoresToMarkdown({ snapshotId, scores }) {
  const lines = [
    `# Snapshot ${snapshotId}`,
    "",
    "| Item | Score | vs_prev | vs_org | vs_50th | vs_75th | vs_90th |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const s of scores) {
    const name = s.item_name ?? s.item_id ?? "";
    lines.push(
      `| ${name} | ${s.score ?? "n/a"} | ${formatDelta(s.vs_prev)} | ${formatDelta(s.vs_org)} | ${formatDelta(s.vs_50th)} | ${formatDelta(s.vs_75th)} | ${formatDelta(s.vs_90th)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function trendToMarkdown({ itemId, trend }) {
  const lines = [
    `# Trend for ${itemId}`,
    "",
    "| Date | Score |",
    "| --- | --- |",
  ];
  for (const row of trend) {
    const date = row.getdx_snapshots?.scheduled_for ?? "(unknown)";
    lines.push(`| ${date} | ${row.score ?? "n/a"} |`);
  }
  lines.push("");
  return lines.join("\n");
}
